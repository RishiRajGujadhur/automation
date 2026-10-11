import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { createPatch } from 'diff';
import { z } from 'zod';
import {
  configSchema,
  scan,
  confined,
  projectRoot,
  dataRoot,
  parseFeature,
  matchActions,
  matchFeatureBindings,
  bindingMatches,
} from './core.js';
import { Recorder } from './recorder.js';
import { proposeCode, proposeDictionaryPageObject } from './proposals.js';
import { validate } from './validation.js';
import { projectModel } from './projectModel.js';
import { command, dotnet } from './core.js';
import type { Index } from '../src/types.js';
import { readSettings, writeSettings, settingsSchema, tracesDir } from './settings.js';
import { WorkspaceSearch } from './stepSearch.js';
import { mergeDictionary, proposeField, findEntry, parseDictionary, selectorRank, fieldName, type FieldProposal } from './dictionaries.js';
const studio = readSettings();
const allowedHosts = [studio.apiPort, studio.webPort].flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]);
const allowedOrigins = allowedHosts.map((h) => `http://${h}`);
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    !allowedOrigins.includes(origin)
  ) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  if (
    !allowedHosts.includes(req.headers.host ?? '')
  ) {
    res.status(403).json({ error: 'Host not allowed' });
    return;
  }
  next();
});
const configFile = path.join(dataRoot, '.local/workspace.json');
let config = configSchema.parse(
  await fs
    .readFile(configFile, 'utf8')
    .then(JSON.parse)
    .catch(() => ({ repositoryRoot: path.join(projectRoot, 'fixtures') })),
);
let index: Index | undefined;
const recorder = new Recorder();
const previews = new Map<string, { file: string; source: string; hash: string; root: string }>();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
let search:WorkspaceSearch|undefined;
let pendingScan:Promise<Index>|undefined;
function activate(next:Index){search?.close();index=next;index.revision=randomUUID();index.scannedAt=new Date().toISOString();search=new WorkspaceSearch({steps:next.stepDefinitions,selectors:next.selectors,dictionaries:next.dictionaryEntries??[],backgrounds:next.features.flatMap(f=>f.backgrounds.map(b=>({...b,file:f.file})))});return next;}
const ensure = async ():Promise<Index> => {if(index)return index;if(!pendingScan)pendingScan=scan(config).then(activate).finally(()=>{pendingScan=undefined;});return pendingScan;};
function publicIndex(i:Index):Index{return {...i,stats:{steps:i.stepDefinitions.length,selectors:i.selectors.length,features:i.features.length,scenarios:i.features.reduce((n,f)=>n+f.scenarios.length,0),backgrounds:i.features.reduce((n,f)=>n+f.backgrounds.length,0),dictionaries:i.dictionaryEntries?.length??0,methods:i.methods.length},features:i.features.map(f=>({...f,source:'',scenarios:[],backgrounds:[]})),stepDefinitions:[],selectors:[],methods:[],callEdges:[],dictionaryEntries:[]};}
const paging=z.object({q:z.string().max(200).default(''),offset:z.coerce.number().int().min(0).max(10000000).default(0),limit:z.coerce.number().int().min(1).max(50).default(25),keyword:z.enum(['','Given','When','Then']).default('')});
app.get('/api/workspace', async (_req, res) => res.json({ config, index: publicIndex(await ensure()) }));
app.get('/api/steps',async(req,res)=>{await ensure();const {q,offset,limit,keyword}=paging.parse(req.query);res.json(await search!.search(q,offset,limit,keyword));});
app.get('/api/step',async(req,res)=>{const i=await ensure();const binding=search!.byId.get(z.string().parse(req.query.id));if(!binding){res.status(404).json({error:'Binding not found. Refresh the catalogue.'});return;}const visited=new Set<string>();const edges:Index['callEdges']=[];const walk=(id:string)=>{if(visited.has(id)||visited.size>100)return;visited.add(id);for(const e of i.callEdges.filter(e=>e.from===id).slice(0,50)){edges.push(e);if(e.resolution==='Resolved')walk(e.to);}};walk(binding.method);res.json({binding,edges:edges.slice(0,100)});});
app.get('/api/feature',async(req,res)=>{const f=(await ensure()).features.find(f=>f.file===req.query.file);if(!f){res.status(404).json({error:'Feature not found'});return;}res.json(f);});
app.get('/api/dictionaries',async(req,res)=>{await ensure();const {q,offset,limit}=paging.parse(req.query);res.json(await search!.query('dictionaries',q,offset,limit));});
app.get('/api/dictionary/files',async(_req,res)=>{const i=await ensure();res.json([...new Set((i.dictionaryEntries??[]).map(e=>e.file))].sort());});
const selectorSchema=z.object({type:z.string().trim().regex(/^(testid|text|css|xpath|ariarole\.[a-z]+)$/i,'Unsupported selector type.'),value:z.string().trim().min(1,'Selector value is empty.').max(2000)});
app.post('/api/dictionary/verify',async(req,res)=>{const {selectors,url}=z.object({selectors:z.array(selectorSchema).min(1).max(20),url:z.string().url().optional()}).parse(req.body);res.json(await recorder.verify(selectors,url));});
const proposalSchema=z.object({page:z.string().max(200),section:z.string().min(1).max(200),field:z.string().min(1).max(200),fieldType:z.string().max(60).default('TextBox'),selectors:z.array(selectorSchema).min(1).max(20)});
async function previewDictionary(file:string,proposals:FieldProposal[]){
 if(!/\.xml$/i.test(file))throw new Error('Dictionary files must end with .xml.');
 const target=await confined(config.repositoryRoot,file,false);
 const before=await fs.readFile(target,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 const {xml,changes}=mergeDictionary(before,proposals);
 const id=randomUUID();previews.set(id,{file,source:xml,hash:hash(before),root:config.repositoryRoot});
 return {id,file,created:!before,changes,diff:createPatch(file,before,xml,'repository','proposed'),changed:before!==xml,entries:parseDictionary(xml,file)};
}
app.post('/api/dictionary/preview',async(req,res)=>{const {file,proposals}=z.object({file:z.string().min(5).max(400),proposals:z.array(proposalSchema).min(1).max(200)}).parse(req.body);res.json(await previewDictionary(file,proposals));});
app.post('/api/validate',async(req,res)=>{const input=z.object({steps:z.array(z.object({keyword:z.string(),text:z.string().max(2000)})).max(200).optional(),page:z.string().max(200).optional(),section:z.string().max(200).optional(),field:z.string().max(200).optional(),featureFile:z.string().max(400).optional(),dictionaryFile:z.string().max(400).optional()}).parse(req.body);res.json({checks:await validate(input,await ensure(),config)});});
app.post('/api/generator/plan',async(req,res)=>{
 const {page,section,field,action,value}=z.object({page:z.string().max(200).default(''),section:z.string().min(1).max(200),field:z.string().min(1).max(200),action:z.enum(['fill','click','visible']).default('fill'),value:z.string().max(2000).default('')}).parse(req.body);
 const i=await ensure();const entry=findEntry(i.dictionaryEntries??[],page,section,field);
 if(!entry){res.json({entry:null});return;}
 const source=await fs.readFile(await confined(config.repositoryRoot,entry.file),'utf8');
 const first=entry.selectors.find(s=>s.supported);
 const code=!first?.code?null:action==='visible'?`await Expect(${first.code}).ToBeVisibleAsync();`:action==='click'?`await ${first.code}.ClickAsync();`:`await ${first.code}.FillAsync(${JSON.stringify(value)});`;
 res.json({entry,source,flow:entry.selectors.map((s,n)=>({...s,order:n+1,rank:selectorRank(s.type,s.value),chosen:s===first})),code});
});
// Per-line binding status for the generator's live step lint.
app.post('/api/steps/match',async(req,res)=>{
 const {steps}=z.object({steps:z.array(z.object({keyword:z.enum(['Given','When','Then']),text:z.string().max(2000)})).max(100)}).parse(req.body);
 const i=await ensure();
 res.json(steps.map(s=>{const hits=i.stepDefinitions.filter(b=>b.keyword===s.keyword&&bindingMatches(b,s.text));return {status:hits.length===1?'Matched':hits.length?'Ambiguous':'Unmatched',binding:hits[0]?{pattern:hits[0].pattern,file:hits[0].file,line:hits[0].line}:null};}));
});
app.get('/api/dictionary/tree',async(_req,res)=>{
 const i=await ensure();const tree=new Map<string,{page:string;section:string;fields:Set<string>}>();
 for(const e of (i.dictionaryEntries??[]).slice(0,20000)){const k=e.page+'\u0000'+e.section;if(!tree.has(k))tree.set(k,{page:e.page,section:e.section,fields:new Set()});tree.get(k)!.fields.add(e.field);}
 res.json([...tree.values()].map(t=>({...t,fields:[...t.fields].sort()})));
});
app.get('/api/features/folders',async(_req,res)=>{const i=await ensure();res.json([...new Set(i.features.map(f=>f.file.split('/').slice(0,-1).join('/')).filter(Boolean))].sort());});
// Test Design tools run client-side over the whole feature corpus; bindings are trimmed to what they need.
app.get('/api/design/corpus',async(_req,res)=>{const i=await ensure();res.json({revision:i.revision,features:i.features.map(f=>({file:f.file,name:f.name,tags:f.tags,line:f.line,source:f.source,scenarios:f.scenarios,backgrounds:f.backgrounds})),bindings:i.stepDefinitions.map(b=>({id:b.id,keyword:b.keyword,pattern:b.pattern,expression:b.expression,usages:b.usages,file:b.file,line:b.line,parameters:b.parameters}))});});
// Test impact analysis: files changed vs. a git ref (default HEAD) plus untracked files. Read-only git commands.
app.get('/api/design/changed',async(req,res)=>{const base=z.string().regex(/^[\w./~^@-]{1,80}$/).default('HEAD').parse(req.query.base??'HEAD');const root=config.repositoryRoot;try{const top=(await command('git',['rev-parse','--show-toplevel'],'',root)).trim();const diff=await command('git',['diff','--name-only',base,'--','.'],'',root);const untracked=await command('git',['ls-files','--others','--exclude-standard','--','.'],'',root);const rel=(f:string)=>path.relative(root,path.join(top,f)).replaceAll('\\','/');res.json({base,files:[...new Set([...diff.split('\n').filter(Boolean).map(rel),...untracked.split('\n').filter(Boolean)])].filter(f=>!f.startsWith('..'))});}catch(e){res.status(400).json({error:`git is unavailable for this repository: ${(e as Error).message.split('\n')[0]}`});}});
app.get('/api/health',(_req,res)=>res.json({ok:true,scannedAt:index?.scannedAt??null}));
app.get('/api/project/model',async(_req,res)=>{res.json(await projectModel(config,await ensure()));});
app.get('/api/project/files',async(req,res)=>{const folder=z.string().default('.').parse(req.query.folder);const dir=await confined(config.repositoryRoot,folder);const entries=await fs.readdir(dir,{withFileTypes:true});const {offset,limit}=paging.parse(req.query);const filtered=entries.filter(e=>!e.isSymbolicLink()&&!e.name.startsWith('.')&&!config.ignoredDirectories.includes(e.name)).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));res.json({folder,items:filtered.slice(offset,offset+limit).map(e=>({name:e.name,file:path.relative(config.repositoryRoot,path.join(dir,e.name)).replaceAll('\\','/'),directory:e.isDirectory()})),total:filtered.length,hasNext:offset+limit<filtered.length});});
app.post('/api/workspace', async (req, res) => {
  const next = configSchema.parse(req.body);
  const scanned = await scan(next);
  config = next;
  activate(scanned);
  previews.clear();
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2));
  res.json({ config, index:publicIndex(index!) });
});
app.post('/api/scan', async (_req, res) => {
  activate(await scan(config));
  res.json(publicIndex(index!));
});
app.get('/api/features',async(req,res)=>{const i=await ensure();const {q,offset,limit}=paging.parse(req.query);const items=i.features.filter(f=>(f.name+' '+f.file).toLowerCase().includes(q.toLowerCase()));res.json({items:items.slice(offset,offset+limit).map(f=>({...f,source:''})),total:items.length,hasNext:offset+limit<items.length});});
app.get('/api/selectors',async(req,res)=>{await ensure();const {q,offset,limit}=paging.parse(req.query);res.json(await search!.query('selectors',q,offset,limit,z.string().max(40).default('').parse(req.query.type)));});
app.get('/api/backgrounds',async(req,res)=>{await ensure();const {q,offset,limit}=paging.parse(req.query);res.json(await search!.query('backgrounds',q,offset,limit));});
app.get('/api/source', async (req, res) => {
  const file = await confined(config.repositoryRoot, String(req.query.file));
  if (!/\.(cs|feature|xml|csproj|json|config|runsettings|props|targets|sln|md|yaml|yml|csv|txt|resx)$/.test(file)) throw new Error('Unsupported source file');
  if((await fs.stat(file)).size>2_000_000)throw new Error('Source preview is limited to 2 MB. Open this file in your IDE.');
  res.json({ source: await fs.readFile(file, 'utf8') });
});
app.post('/api/scenario/validate', async (req, res) => {
  const source = z.string().max(200000).parse(req.body.source);
  const i = await ensure();
  const feature = parseFeature(source, 'draft.feature', []);
  const diagnostics = await matchFeatureBindings([feature], i.stepDefinitions);
  res.json({ ...feature, diagnostics });
});
app.get('/api/recording', (_req, res) =>
  res.json({ status: recorder.status, actions: recorder.actions }),
);
app.post('/api/recording/start', async (req, res) => {
  await recorder.start(z.string().url().parse(req.body.url), false, readSettings().tracing);
  res.json({ status: recorder.status });
});
app.post('/api/recording/pause', (req, res) => {
  recorder.status = req.body.resume ? 'recording' : 'paused';
  res.json({ status: recorder.status });
});
app.post('/api/recording/stop', async (_req, res) => {
  const trace = await recorder.stop();
  res.json({ status: recorder.status, trace: trace ? path.basename(trace) : null });
});
app.post('/api/recording/clear', (_req, res) => {
  recorder.actions = [];
  res.json({ ok: true });
});
const actionSchema = z.object({
  id: z.string(),
  action: z.enum(['goto', 'fill', 'press', 'click']),
  url: z.string().url().optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  target: z
    .object({
      role: z.string().optional(),
      name: z.string().optional(),
      testId: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  sensitive: z.boolean().optional(),
});
app.post('/api/recording/match', async (req, res) => {
 const i=await ensure();const actions=z.array(actionSchema).max(1000).parse(req.body.actions);const matches=[];
 for(const action of actions){const q=[action.target?.name,action.target?.description,action.target?.testId,action.url?new URL(action.url).hostname.replace('www.','').split('.')[0]:''].filter(Boolean).join(' ')||({goto:'open',fill:'enter',press:'press',click:'click'})[action.action];const candidates=await search!.search(q,0,100);matches.push(...matchActions([action],{...i,stepDefinitions:candidates.items}));}res.json(matches);
});
app.post('/api/recording/dictionary-proposal',async(req,res)=>{
 const {actions,page,section,file,pageObjectFile}=z.object({actions:z.array(actionSchema).min(1).max(200),page:z.string().min(1).max(200),section:z.string().min(1).max(200),file:z.string().min(5).max(400),pageObjectFile:z.string().endsWith('.cs').optional()}).parse(req.body);
 const i=await ensure();const proposals:FieldProposal[]=[];const members:{action:z.infer<typeof actionSchema>;section:string;field:string}[]=[];const skipped:string[]=[];
 for(const a of actions){
  const existing=a.target?.name?findEntry(i.dictionaryEntries??[],page,section,fieldName(a.target.name)):undefined;
  if(existing){members.push({action:a,section:existing.section,field:existing.field});continue;}
  const p=proposeField(a,page,section);
  if(!p){if(a.action!=='goto')skipped.push(`${a.action} ${a.target?.name??''}: no test id, role or text was recorded`);continue;}
  if(!proposals.some(x=>x.field===p.field))proposals.push(p);
  members.push({action:a,section,field:p.field.toLowerCase()});
 }
 const dictionary=proposals.length?await previewDictionary(file,proposals):null;
 let pageObject=null;
 if(members.length&&pageObjectFile){
  const target=await confined(config.repositoryRoot,pageObjectFile,false);
  if(await fs.access(target).then(()=>true,()=>false))throw new Error('Page object file already exists. Choose a new filename to avoid replacing source.');
  const po=proposeDictionaryPageObject(page,file,members,i);const id=randomUUID();
  previews.set(id,{file:pageObjectFile,source:po.source,hash:hash(''),root:config.repositoryRoot});
  pageObject={...po,id,file:pageObjectFile,diff:createPatch(pageObjectFile,'',po.source,'repository','proposed')};
 }
 res.json({proposals,dictionary,pageObject,skipped,reused:members.length-proposals.length});
});
app.post('/api/generation/proposal', async (req, res) => {
  const { action, wording, file } = z
    .object({
      action: actionSchema,
      wording: z.string().min(1).max(500),
      file: z.string().endsWith('.cs'),
    })
    .parse(req.body);
  const proposal = proposeCode(action, wording, await ensure());
  const target = await confined(config.repositoryRoot, file, false);
  try {
    await fs.access(target);
    throw new Error(
      'Proposal file already exists. Choose a new filename to avoid replacing source.',
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const id = randomUUID();
  previews.set(id, { file, source: proposal.source, hash: hash(''), root: config.repositoryRoot });
  res.json({
    ...proposal,
    id,
    file,
    diff: createPatch(file, '', proposal.source, 'repository', 'proposed'),
    changed: true,
  });
});
let execution: { status: string; output: string } = { status: 'idle', output: '' };
app.get('/api/execution', (_req, res) => res.json(execution));
app.post('/api/execution', async (req, res) => {
  const { project, filter } = z
    .object({
      project: z.string().trim().endsWith('.csproj', 'Choose a .csproj file.').refine((v) => !v.split(/[\\/]/).includes('..'), 'Path cannot contain ..'),
      filter: z.string().min(1).max(500),
      approved: z.literal(true),
    })
    .parse(req.body);
  if (execution.status === 'running') throw new Error('A test run is already active.');
  const target = await confined(config.repositoryRoot, project);
  execution = { status: 'running', output: '' };
  command(
    dotnet,
    ['test', target, '--filter', filter, '--logger', 'console;verbosity=normal', ...(readSettings().tracing.enabled ? ['--environment', 'STUDIO_PLAYWRIGHT_TRACING=1'] : [])],
    '',
    config.repositoryRoot,
  )
    .then((output) => {
      execution = { status: 'passed', output: output.slice(-30000) };
    })
    .catch((e) => {
      execution = { status: 'failed', output: (e as Error).message.slice(-30000) };
    });
  res.json(execution);
});
app.post('/api/generation/preview', async (req, res) => {
  const { file, source } = z
    .object({ file: z.string().endsWith('.feature'), source: z.string().max(200000) })
    .parse(req.body);
  parseFeature(source, file, []);
  const target = await confined(config.repositoryRoot, file, false);
  const before = await fs.readFile(target, 'utf8').catch((e) => {
    if (e.code === 'ENOENT') return '';
    throw e;
  });
  const id = randomUUID();
  previews.set(id, { file, source, hash: hash(before), root: config.repositoryRoot });
  res.json({
    id,
    file,
    diff: createPatch(file, before, source, 'repository', 'proposed'),
    changed: before !== source,
  });
});
app.post('/api/generation/apply', async (req, res) => {
  const { id } = z.object({ id: z.string(), approved: z.literal(true) }).parse(req.body);
  const p = previews.get(id);
  if (!p || p.root !== config.repositoryRoot)
    throw new Error('Preview expired. Preview the change again.');
  const target = await confined(config.repositoryRoot, p.file, false);
  const before = await fs.readFile(target, 'utf8').catch((e) => {
    if (e.code === 'ENOENT') return '';
    throw e;
  });
  if (hash(before) !== p.hash) {
    res.status(409).json({ error: 'File changed since preview. Review a fresh diff.' });
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, p.source, 'utf8');
  previews.delete(id);
  activate(await scan(config));
  res.json({ ok: true, index:publicIndex(index!) });
});
app.get('/api/demo', (_req, res) =>
  res
    .type('html')
    .send(
      '<!doctype html><title>Local search fixture</title><h1>Search the local demo</h1><label>Search <input role="combobox" aria-label="Search"></label><button onclick="document.querySelector(\'section\').hidden=false">Search</button><section hidden><a href="/api/demo/result" data-testid="search-result">Dayforce — local fixture</a></section>',
    ),
);
app.get('/api/demo/result', (_req, res) =>
  res
    .type('html')
    .send(
      '<h1>Dayforce local result</h1><p>Deterministic recording fixture. No external service required.</p>',
    ),
);
// Studio settings (ports, tracing). Port changes apply after restarting `npm run dev`.
app.get('/api/settings', (_req, res) => res.json({ ...readSettings(), running: { webPort: studio.webPort, apiPort: studio.apiPort } }));
app.post('/api/settings', (req, res) => {
  const next = settingsSchema.parse(req.body);
  writeSettings(next);
  res.json({ ...next, restartRequired: next.webPort !== studio.webPort || next.apiPort !== studio.apiPort });
});
app.get('/api/traces', async (_req, res) => {
  const files = await fs.readdir(tracesDir).catch(() => [] as string[]);
  const items = await Promise.all(files.filter((f) => /^[\w.-]+\.zip$/.test(f)).map(async (name) => ({ name, size: (await fs.stat(path.join(tracesDir, name))).size, modified: (await fs.stat(path.join(tracesDir, name))).mtime })));
  res.json(items.sort((a, b) => +b.modified - +a.modified).slice(0, 20));
});
app.get('/api/traces/:name', (req, res) => {
  const name = z.string().regex(/^[\w.-]+\.zip$/, 'Invalid trace name').parse(req.params.name);
  res.download(path.join(tracesDir, name), name);
});
app.use(express.static(path.join(projectRoot, 'dist')));
app.use(
  (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error.message);
    res.status(400).json({ error: error.message });
  },
);
// Windows lets a second server bind a port that is already listening, and connections then go to the
// other process (e.g. the desktop app). Refuse to start instead of serving nothing.
const portTaken = await new Promise<boolean>((resolve) => {
  const probe = net.connect({ host: '127.0.0.1', port: studio.apiPort });
  probe.once('connect', () => { probe.destroy(); resolve(true); });
  probe.once('error', () => resolve(false));
});
if (portTaken) {
  console.error(`Port ${studio.apiPort} is already in use by another program (is the TestAuthoring Studio desktop app running?). Close it, or set STUDIO_API_PORT / change the API port in Settings → Ports.`);
  process.exit(1);
}
app.listen(studio.apiPort, '127.0.0.1', () => console.log(`Local API: http://127.0.0.1:${studio.apiPort} (web UI on ${studio.webPort})`)).on('error', (e) => { console.error(`Local API could not start: ${e.message}`); process.exit(1); });
