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
  scanner,
  parseFeature,
  matchActions,
  matchFeatureBindings,
  bindingMatches,
} from './core.js';
import { Recorder } from './recorder.js';
import { proposeCode, proposeDictionaryPageObject } from './proposals.js';
import { insertMethod, newStepFile } from './stepScaffold.js';
import { validate } from './validation.js';
import { projectModel } from './projectModel.js';
import { command, dotnet } from './core.js';
import { Debugger, owningProject, featureTests } from './debugger.js';
import { TestRunner } from './testRunner.js';
import { readSolution, projectInfo, findSolutions } from './solution.js';
import { Builder } from './build.js';
import { findInFiles, replaceInFiles } from './search.js';
import { LanguageService } from './langService.js';
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
// Feature ↔ C#: the step files a feature's steps bind to (by use count), the naming-convention step file,
// and SpecFlow's generated code-behind when present. Used for file nesting and "go to step definitions".
app.get('/api/feature/links',async(req,res)=>{
  const i=await ensure();const file=z.string().max(400).parse(req.query.file);
  const f=i.features.find(x=>x.file===file);if(!f){res.status(404).json({error:'Feature not found'});return;}
  const byId=new Map(i.stepDefinitions.map(b=>[b.id,b]));const counts=new Map<string,number>();
  for(const block of [...f.backgrounds,...f.scenarios])for(const s of block.steps)for(const id of s.candidates){const b=byId.get(id);if(b)counts.set(b.file,(counts.get(b.file)??0)+1);}
  const stepFiles=[...counts].sort((a,b)=>b[1]-a[1]).map(([file,steps])=>({file,steps}));
  const base=path.basename(file,'.feature');
  const folders=[...new Set(i.stepDefinitions.map(b=>path.posix.dirname(b.file)))];
  const folder=stepFiles[0]?path.posix.dirname(stepFiles[0].file):folders[0]??'Steps';
  const convention=`${folder}/${base}Steps.cs`;
  const exists=async(p:string)=>fs.access(await confined(config.repositoryRoot,p,false)).then(()=>true,()=>false);
  res.json({stepFiles,convention,conventionExists:await exists(convention),codeBehind:(await exists(file+'.cs'))?file+'.cs':null,stepFolders:folders.length?folders:['Steps']});
});
// Step definition files known to the index (for "create step definition").
app.get('/api/steps/files',async(_req,res)=>{const i=await ensure();res.json([...new Set(i.stepDefinitions.map(b=>b.file))].sort());});
// Create a step definition for an unbound step: appended to an existing [Binding] class or a new file in the
// repository's style (regex vs. Cucumber expressions by majority). Previewed; written only on approval.
app.post('/api/steps/scaffold',async(req,res)=>{
  const {keyword,text,file}=z.object({keyword:z.enum(['Given','When','Then']),text:z.string().min(1).max(500),file:z.string().max(400).regex(/.cs$/i)}).parse(req.body);
  const i=await ensure();
  const cucumber=i.stepDefinitions.filter(b=>b.expression==='Cucumber').length;
  const style=cucumber>i.stepDefinitions.length/2?'cucumber':'regex';
  const target=await confined(config.repositoryRoot,file,false);
  const before=await fs.readFile(target,'utf8').catch((e)=>{if(e.code==='ENOENT')return '';throw e;});
  let result;
  if(before)result=insertMethod(before,keyword,text,style);
  else{
    const sampleFile=i.stepDefinitions[0]?.file;
    const sample=sampleFile?await fs.readFile(await confined(config.repositoryRoot,sampleFile,false),'utf8').catch(()=>undefined):undefined;
    const cls=path.basename(file,'.cs').replace(/[^A-Za-z0-9_]/g,'')||'NewSteps';
    result=newStepFile(/^[A-Za-z_]/.test(cls)?cls:'Steps'+cls,keyword,text,style,sample);
  }
  const id=randomUUID();
  previews.set(id,{file,source:result.source,hash:hash(before),root:config.repositoryRoot});
  res.json({id,file,line:result.line,method:result.method.name,pattern:result.method.pattern,created:!before,changed:true,diff:createPatch(file,before,result.source,'repository','proposed')});
});
// Solution Explorer model: projects (.csproj) with their files and package dependencies, plus file nesting
// (each feature → the step files its steps bind to, and SpecFlow's generated .feature.cs code-behind).
app.get('/api/solution',async(_req,res)=>{
  const i=await ensure();const model=await projectModel(config,i);
  const byId=new Map(i.stepDefinitions.map(b=>[b.id,b]));
  const all=new Set(model.files.map(x=>x.file));
  const nesting:Record<string,{file:string;kind:'steps'|'code-behind';steps?:number}[]>={};
  for(const f of i.features){
    const counts=new Map<string,number>();
    for(const block of [...f.backgrounds,...f.scenarios])for(const s of block.steps)for(const id of s.candidates){const b=byId.get(id);if(b)counts.set(b.file,(counts.get(b.file)??0)+1);}
    const kids:{file:string;kind:'steps'|'code-behind';steps?:number}[]=[...counts].sort((a,b)=>b[1]-a[1]).map(([file,steps])=>({file,kind:'steps',steps}));
    if(all.has(f.file+'.cs'))kids.unshift({file:f.file+'.cs',kind:'code-behind'});
    if(kids.length)nesting[f.file]=kids;
  }
  // A solution (.sln/.slnx) gives the real tree: solution folders → projects. Without one, every .csproj is a project
  // (a single solution file at the top of the folder is picked up automatically, as Visual Studio's Open Folder does).
  let solutionFile=config.solution;
  if(!solutionFile){const found=(await findSolutions(config.repositoryRoot,config.ignoredDirectories,1));if(found.length===1)solutionFile=found[0];}
  const parsed=solutionFile?await readSolution(config.repositoryRoot,solutionFile).catch(()=>undefined):undefined;
  const files=parsed?model.files:model.files;
  const projectFiles=parsed?parsed.projects.map(p=>p.file):(model.projects.length?model.projects:[]);
  const projects=await Promise.all(projectFiles.map(async(file)=>({file,name:path.posix.basename(file).replace(/\.\w+proj$/i,''),dir:path.posix.dirname(file)==='.'?'':path.posix.dirname(file),...await projectInfo(config.repositoryRoot,file)})));
  if(!projects.length)projects.push({file:'.',name:model.root,dir:'',packages:model.packages,frameworks:model.frameworks,references:[],missing:false});
  const tree=parsed?.tree??projects.map(p=>({kind:'project' as const,name:p.name,file:p.file}));
  res.json({name:solutionFile?path.posix.basename(solutionFile).replace(/\.slnx?$/i,''):model.root,solutionFile:solutionFile||null,configurations:parsed?.configurations??['Debug','Release'],tree,projects,packages:model.packages,frameworks:model.frameworks,files,nesting,truncated:model.truncated});
});
// File ▸ Open ▸ Project/Solution: a .sln/.slnx/.csproj (or a folder) on disk becomes the workspace.
app.get('/api/solution/find',async(_req,res)=>{res.json(await findSolutions(config.repositoryRoot,config.ignoredDirectories));});
app.post('/api/solution/open',async(req,res)=>{
  const {path:target}=z.object({path:z.string().min(1).max(1000)}).parse(req.body);
  const full=path.resolve(target);
  const stat=await fs.stat(full).catch(()=>undefined);
  if(!stat)throw new Error(`${target} was not found.`);
  let next:typeof config;
  if(stat.isDirectory())next=configSchema.parse({...config,repositoryRoot:full,solution:'',targetProject:'.'});
  else if(/\.slnx?$/i.test(full))next=configSchema.parse({...config,repositoryRoot:path.dirname(full),solution:path.basename(full),targetProject:'.'});
  else if(/\.csproj$/i.test(full))next=configSchema.parse({...config,repositoryRoot:path.dirname(full),solution:'',targetProject:path.basename(full)});
  else throw new Error('Choose a solution (.sln, .slnx), a project (.csproj) or a folder.');
  clearTimeout(rescanTimer);
  tests.reset();
  const scanned=await scan(next);
  config=next;activate(scanned);previews.clear();
  await fs.mkdir(path.dirname(configFile),{recursive:true});
  await fs.writeFile(configFile,JSON.stringify(config,null,2));
  res.json({config,index:publicIndex(index!)});
});
app.get('/api/health',(_req,res)=>res.json({ok:true,scannedAt:index?.scannedAt??null}));
app.get('/api/project/model',async(_req,res)=>{res.json(await projectModel(config,await ensure()));});
app.get('/api/project/files',async(req,res)=>{const folder=z.string().default('.').parse(req.query.folder);const dir=await confined(config.repositoryRoot,folder);const entries=await fs.readdir(dir,{withFileTypes:true});const {offset,limit}=paging.parse(req.query);const filtered=entries.filter(e=>!e.isSymbolicLink()&&!e.name.startsWith('.')&&!config.ignoredDirectories.includes(e.name)).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));res.json({folder,items:filtered.slice(offset,offset+limit).map(e=>({name:e.name,file:path.relative(config.repositoryRoot,path.join(dir,e.name)).replaceAll('\\','/'),directory:e.isDirectory()})),total:filtered.length,hasNext:offset+limit<filtered.length});});
app.post('/api/workspace', async (req, res) => {
  const next = configSchema.parse(req.body);
  clearTimeout(rescanTimer);
  if (next.repositoryRoot !== config.repositoryRoot || next.solution !== config.solution) tests.reset();
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
// ---- Code editing (C#, feature, XML) --------------------------------------------------------------
const editable = /.(cs|feature|xml)$/i;
// Roslyn syntax diagnostics + step-binding checks for one C# buffer (scanner --diagnostics).
app.post('/api/csharp/diagnostics', async (req, res) => {
  const { source, path: file } = z.object({ source: z.string().max(1_000_000), path: z.string().max(400).default('') }).parse(req.body);
  res.json(JSON.parse(await command(...scanner(['--diagnostics']), JSON.stringify({ source, path: file }))));
});
// Diff preview for any editable file; approval goes through /api/generation/apply like every other write.
app.post('/api/file/preview', async (req, res) => {
  const { file, source } = z.object({ file: z.string().max(400).regex(editable), source: z.string().max(1_000_000) }).parse(req.body);
  if (file.endsWith('.feature')) parseFeature(source, file, []);
  const target = await confined(config.repositoryRoot, file, false);
  const before = await fs.readFile(target, 'utf8').catch((e) => { if (e.code === 'ENOENT') return ''; throw e; });
  const id = randomUUID();
  previews.set(id, { file, source, hash: hash(before), root: config.repositoryRoot });
  res.json({ id, file, diff: createPatch(file, before, source, 'repository', 'proposed'), changed: before !== source, created: !before });
});
// Direct save (auto save). Refuses when the file changed on disk since the editor loaded it (baseHash).
let rescanTimer: NodeJS.Timeout | undefined;
/**
 * Re-index shortly after writes. The scan is for the workspace of the moment it starts: if the workspace changes
 * while it runs (another folder or solution was opened), its result is dropped instead of replacing the new index.
 */
function rescanSoon(delay: number) {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    const target = config;
    scan(target).then((i) => { if (config === target) activate(i); }).catch((e) => console.error('Rescan failed:', (e as Error).message));
  }, delay);
}
app.post('/api/file/save', async (req, res) => {
  const { file, source, baseHash } = z.object({ file: z.string().max(400).regex(editable), source: z.string().max(1_000_000), baseHash: z.string().max(80) }).parse(req.body);
  if (file.endsWith('.feature')) parseFeature(source, file, []);
  const target = await confined(config.repositoryRoot, file, false);
  const before = await fs.readFile(target, 'utf8').catch((e) => { if (e.code === 'ENOENT') return ''; throw e; });
  if (hash(before) !== baseHash) { res.status(409).json({ error: `${file} changed outside the studio. Reload it before saving.`, hash: hash(before) }); return; }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, source, 'utf8');
  // Re-index shortly after the last save so bindings and features stay current without rescanning on every keystroke.
  rescanSoon(1500);
  lang.notify(config.repositoryRoot, [file]);
  res.json({ ok: true, hash: hash(source) });
});
// C# language service (Roslyn): IntelliSense, quick info, go to definition, references, rename, organize usings.
const lang = new LanguageService();
const csPosition = z.object({ file: z.string().max(400).regex(/\.cs$/), source: z.string().max(1_000_000).optional(), line: z.number().int().min(1), column: z.number().int().min(1) });
for (const op of ['complete', 'hover', 'definition', 'references', 'signature'] as const) {
  app.post(`/api/csharp/${op}`, async (req, res) => {
    const body = csPosition.parse(req.body);
    await confined(config.repositoryRoot, body.file, false);
    res.json(await lang.request(config.repositoryRoot, { op, ...body }, op === 'complete' ? 20_000 : 60_000));
  });
}
/** Rename symbol: every changed file except the one being edited is written; the editor applies its own new text. */
app.post('/api/csharp/rename', async (req, res) => {
  const body = csPosition.extend({ newName: z.string().min(1).max(200) }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  const r = await lang.request<{ name: string; newName: string; changes: { file: string; text: string; edits: number }[] }>(config.repositoryRoot, { op: 'rename', ...body }, 120_000);
  const written: string[] = [];
  for (const c of r.changes) {
    if (c.file === body.file) continue;
    const target = await confined(config.repositoryRoot, c.file);
    await fs.writeFile(target, c.text, 'utf8');
    written.push(c.file);
  }
  if (written.length) rescanSoon(1500);
  res.json({ ...r, written, current: r.changes.find((c) => c.file === body.file)?.text ?? null });
});
app.post('/api/csharp/organize', async (req, res) => {
  const body = z.object({ file: z.string().max(400).regex(/\.cs$/), source: z.string().max(1_000_000) }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  res.json(await lang.request(config.repositoryRoot, { op: 'organize', ...body }, 60_000));
});
/** Step usages (CodeLens for step definitions): for each binding in a C# file, the feature lines that use it. */
app.get('/api/steps/lenses', async (req, res) => {
  const file = z.string().min(1).max(400).parse(req.query.file);
  const i = await ensure();
  const lenses = i.stepDefinitions.filter((b) => b.file === file).map((b) => {
    const usages: { file: string; line: number; text: string; scenario: string }[] = [];
    for (const f of i.features) for (const block of [...f.backgrounds.map((x) => ({ ...x, name: `Background${x.name ? `: ${x.name}` : ''}` })), ...f.scenarios])
      for (const s of block.steps) if (s.candidates.includes(b.id)) usages.push({ file: f.file, line: s.line, text: `${s.keyword} ${s.text}`.trim(), scenario: block.name });
    return { line: b.line, keyword: b.keyword, pattern: b.pattern, method: b.method, usages };
  });
  res.json(lenses);
});
// Find in Files (Ctrl+Shift+F) and Replace All; Go to All (Ctrl+T) symbols from the language service.
const searchOptions = z.object({ query: z.string().min(1).max(500), regex: z.boolean().optional(), matchCase: z.boolean().optional(), wholeWord: z.boolean().optional(), include: z.string().max(500).optional(), exclude: z.string().max(500).optional() });
app.post('/api/search/text', async (req, res) => {
  const options = searchOptions.parse(req.body);
  if (options.regex) { try { new RegExp(options.query); } catch (e) { throw new Error(`Invalid regular expression: ${(e as Error).message}`); } }
  res.json(await findInFiles(config.repositoryRoot, config.ignoredDirectories, options));
});
app.post('/api/search/replace', async (req, res) => {
  const { replacement, files, approved: _approved, ...options } = searchOptions.extend({ replacement: z.string().max(5000), files: z.array(z.string().max(400)).max(5000).optional(), approved: z.literal(true) }).parse(req.body);
  const changed = await replaceInFiles(config.repositoryRoot, config.ignoredDirectories, options, replacement, files);
  if (changed.length) { lang.notify(config.repositoryRoot, changed.map((c) => c.file)); rescanSoon(500); }
  res.json({ changed });
});
app.get('/api/symbols', async (req, res) => {
  const q = z.string().min(1).max(200).parse(req.query.q);
  res.json(await lang.request(config.repositoryRoot, { op: 'symbols', query: q }, 30_000).catch(() => []));
});
/** Format Document / Selection (Roslyn formatter with the project's .editorconfig). */
app.post('/api/csharp/format', async (req, res) => {
  const pos = z.object({ line: z.number().int().min(1), column: z.number().int().min(1), endLine: z.number().int().min(1), endColumn: z.number().int().min(1) });
  const body = z.object({ file: z.string().max(400).regex(/\.cs$/), source: z.string().max(1_000_000), selection: pos.optional() }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  res.json(await lang.request(config.repositoryRoot, { op: 'format', ...body }, 60_000));
});
/** Quick Actions and Refactorings (Ctrl+.): Roslyn's code fixes for diagnostics at the cursor and refactorings for the selection. */
app.post('/api/csharp/actions', async (req, res) => {
  const body = csPosition.extend({ endLine: z.number().int().min(1).optional(), endColumn: z.number().int().min(1).optional() }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  res.json(await lang.request(config.repositoryRoot, { op: 'actions', ...body }, 60_000));
});
/** Applies a Quick Action: other files it changes are written; the edited file's new text goes back to the editor. */
app.post('/api/csharp/applyAction', async (req, res) => {
  const body = z.object({ file: z.string().max(400).regex(/\.cs$/), actionId: z.string().max(40) }).parse(req.body);
  const r = await lang.request<{ title: string; changes: { file: string; text: string }[] }>(config.repositoryRoot, { op: 'applyAction', ...body }, 60_000);
  const written: string[] = [];
  for (const c of r.changes) {
    if (c.file === body.file) continue;
    const target = await confined(config.repositoryRoot, c.file, false);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, c.text, 'utf8');
    written.push(c.file);
  }
  if (written.length) rescanSoon(1500);
  res.json({ title: r.title, written, current: r.changes.find((c) => c.file === body.file)?.text ?? null });
});
// Explorer file operations (Rename, Copy/Cut + Paste, Delete), confined to the repository like every other write.
const afterFileChange = (files: string[]) => { lang.notify(config.repositoryRoot, files); rescanSoon(500); };
const exists = (p: string) => fs.access(p).then(() => true, () => false);
app.post('/api/file/rename', async (req, res) => {
  const { from, to } = z.object({ from: z.string().min(1).max(400), to: z.string().min(1).max(400) }).parse(req.body);
  const src = await confined(config.repositoryRoot, from);
  const dest = await confined(config.repositoryRoot, to, false);
  if (src === dest) { res.json({ ok: true, file: to }); return; }
  if (await exists(dest) && src.toLowerCase() !== dest.toLowerCase()) throw new Error(`${to} already exists.`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(src, dest);
  afterFileChange([from, to]);
  res.json({ ok: true, file: to });
});
app.post('/api/file/copy', async (req, res) => {
  const { from, to } = z.object({ from: z.string().min(1).max(400), to: z.string().min(1).max(400) }).parse(req.body);
  const src = await confined(config.repositoryRoot, from);
  let dest = await confined(config.repositoryRoot, to, false);
  // Like Visual Studio: pasting onto an existing name makes "Name - Copy.ext", "Name - Copy (2).ext"…
  const ext = path.extname(dest), stem = dest.slice(0, dest.length - ext.length);
  for (let n = 1; await exists(dest); n++) dest = `${stem} - Copy${n > 1 ? ` (${n})` : ''}${ext}`;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true, errorOnExist: true, force: false });
  const file = path.relative(config.repositoryRoot, dest).replaceAll('\\', '/');
  afterFileChange([file]);
  res.json({ ok: true, file });
});
app.post('/api/file/delete', async (req, res) => {
  const { file } = z.object({ file: z.string().min(1).max(400), approved: z.literal(true) }).parse(req.body);
  const target = await confined(config.repositoryRoot, file);
  if (target === path.resolve(config.repositoryRoot)) throw new Error('The repository root cannot be deleted.');
  await fs.rm(target, { recursive: true });
  afterFileChange([file]);
  res.json({ ok: true });
});
app.get('/api/source', async (req, res) => {
  const file = await confined(config.repositoryRoot, String(req.query.file));
  if (!/\.(cs|feature|xml|csproj|json|config|runsettings|props|targets|sln|md|yaml|yml|csv|txt|resx)$/.test(file)) throw new Error('Unsupported source file');
  if((await fs.stat(file)).size>2_000_000)throw new Error('Source preview is limited to 2 MB. Open this file in your IDE.');
  const source = await fs.readFile(file, 'utf8');
  res.json({ source, hash: hash(source) });
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
// Debugger (Visual Studio style): breakpoints in .feature and .cs files, stepping, call stack, locals and watch.
const debug = new Debugger();
// Never leave a test host waiting for a debugger when the studio exits or reloads.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, () => { void debug.stop().finally(() => process.exit(0)); });
process.once('exit', () => { void debug.stop(); });
const repoFile = z.string().min(1).max(500).refine((v) => !v.split(/[\\/]/).includes('..'), 'Path cannot contain ..');
app.get('/api/debug', (_req, res) => res.json(debug.state));
app.get('/api/debug/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`);
  send(debug.state);
  debug.on('state', send);
  // Heartbeat: the client reconnects when it stops (e.g. a proxy kept a dead connection open).
  const ping = setInterval(() => res.write('event: ping\ndata: 1\n\n'), 10_000);
  req.on('close', () => { clearInterval(ping); debug.off('state', send); });
});
app.post('/api/debug/breakpoints', async (req, res) => {
  const { file, lines } = z.object({ file: repoFile, lines: z.array(z.number().int().min(1)).max(500) }).parse(req.body);
  await confined(config.repositoryRoot, file);
  res.json(await debug.setBreakpoints(config.repositoryRoot, file.replaceAll('\\', '/'), lines));
});
app.post('/api/debug/start', async (req, res) => {
  const body = z.object({ file: repoFile.optional(), scenario: z.string().max(500).optional(), project: repoFile.optional(), filter: z.string().max(500).optional() }).parse(req.body);
  const root = config.repositoryRoot;
  if (body.file && !body.file.endsWith('.feature')) throw new Error('Choose a .feature file to debug.');
  const project = body.project ?? (body.file ? await owningProject(root, body.file) : undefined) ?? (config.targetProject.endsWith('.csproj') ? config.targetProject : undefined);
  if (!project?.endsWith('.csproj')) throw new Error('No test project (.csproj) was found for this feature. Set the target project in Workspace settings.');
  await confined(root, project);
  const label = body.file ? (body.scenario ? `${body.scenario} — ${body.file}` : body.file) : project;
  void debug.start({ root, project, filter: body.filter, label, featureFile: body.file, scenario: body.scenario });
  res.json(debug.state);
});
app.post('/api/debug/control', async (req, res) => {
  const { action } = z.object({ action: z.enum(['continue', 'next', 'stepIn', 'stepOut', 'pause', 'stop']) }).parse(req.body);
  if (action === 'stop') await debug.stop(); else await debug.control(action);
  res.json(debug.state);
});
app.post('/api/debug/scopes', async (req, res) => {
  const { frameId } = z.object({ frameId: z.number().int() }).parse(req.body);
  res.json(await debug.scopes(frameId));
});
app.post('/api/debug/variables', async (req, res) => {
  const { ref } = z.object({ ref: z.number().int().min(1) }).parse(req.body);
  res.json(await debug.variables(ref));
});
app.post('/api/debug/evaluate', async (req, res) => {
  const { expressions, frameId } = z.object({ expressions: z.array(z.string().min(1).max(500)).max(50), frameId: z.number().int().optional() }).parse(req.body);
  const results = [];
  for (const e of expressions) results.push(await debug.evaluate(e, frameId));
  res.json(results);
});
// Build ▸ Build / Rebuild / Clean Solution (Ctrl+Shift+B): Output and Error List stream from /api/build/events.
const builder = new Builder();
app.get('/api/build', (_req, res) => res.json(builder.state));
app.get('/api/build/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`);
  send(builder.state);
  builder.on('state', send);
  const ping = setInterval(() => res.write('event: ping\ndata: 1\n\n'), 10_000);
  req.on('close', () => { clearInterval(ping); builder.off('state', send); });
});
/** What "Build Solution" builds: the open solution, else the configured project, else the only solution/project at the root. */
async function buildTarget(project?: string) {
  const root = config.repositoryRoot;
  if (project) { await confined(root, project); return project; }
  if (config.solution) return config.solution;
  if (config.targetProject.endsWith('.csproj')) return config.targetProject;
  const top = await fs.readdir(root).catch(() => [] as string[]);
  const sln = top.filter((f) => /\.slnx?$/i.test(f));
  if (sln.length === 1) return sln[0];
  const proj = top.filter((f) => f.endsWith('.csproj'));
  if (proj.length === 1) return proj[0];
  throw new Error(sln.length + proj.length > 1 ? 'Several solutions or projects are at the top of this folder. Open one with File ▸ Open Project/Solution.' : 'No solution or project file to build. Open one with File ▸ Open Project/Solution.');
}
app.post('/api/build', async (req, res) => {
  const { action, project, configuration } = z.object({ action: z.enum(['build', 'rebuild', 'clean']).default('build'), project: z.string().max(400).optional(), configuration: z.string().regex(/^[\w .|-]{1,60}$/).default('Debug') }).parse(req.body);
  res.json(builder.start({ root: config.repositoryRoot, target: await buildTarget(project), action, configuration: configuration.split('|')[0].trim() }));
});
app.post('/api/build/cancel', (_req, res) => res.json(builder.cancel()));
// Test Explorer: C# test methods (Roslyn) and feature scenarios, run with `dotnet test` (results from TRX).
type DiscoveredTest = { id: string; kind: 'test' | 'scenario'; project: string; projectFile?: string; className: string; method: string; name: string; file: string; line: number; filter: string; feature?: string; cases?: number };
app.get('/api/tests', async (_req, res) => {
  const root = config.repositoryRoot;
  const i = await ensure();
  const tests: DiscoveredTest[] = [];
  let warning: string | undefined;
  try {
    const found = await lang.request<{ project: string; projectFile?: string; className: string; method: string; file: string; line: number; framework: string; cases: number }[]>(root, { op: 'tests' }, 120_000);
    for (const t of found) tests.push({ id: `cs:${t.className}.${t.method}`, kind: 'test', project: t.project, projectFile: t.projectFile, className: t.className, method: t.method, name: t.method, file: t.file, line: t.line, cases: t.cases,
      filter: t.cases ? `FullyQualifiedName~${t.className}.${t.method}(` : `FullyQualifiedName=${t.className}.${t.method}` });
  } catch (e) { warning = `C# tests were not discovered: ${(e as Error).message}`; }
  for (const f of i.features) {
    const proj = await owningProject(root, f.file);
    const project = proj ? path.posix.basename(proj).replace(/\.csproj$/i, '') : path.basename(root);
    const names = f.scenarios.map((s) => s.name);
    const gen = await featureTests(root, f.file, names);
    const className = gen.className ?? `${f.name.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('')}Feature`;
    for (const sc of f.scenarios) {
      const method = gen.methods[sc.name];
      tests.push({ id: `sc:${f.file}#${sc.name}`, kind: 'scenario', project, projectFile: proj, className, method, name: sc.name, file: f.file, line: sc.line, feature: f.name,
        filter: gen.className ? `FullyQualifiedName~${className}.${method}` : `FullyQualifiedName~${className}` });
    }
  }
  res.json({ tests, warning, generated: tests.some((t) => t.kind === 'scenario') });
});
const tests = new TestRunner();
app.get('/api/tests/run', (_req, res) => res.json(tests.state));
app.get('/api/tests/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`);
  send(tests.state);
  tests.on('state', send);
  const ping = setInterval(() => res.write('event: ping\ndata: 1\n\n'), 10_000);
  req.on('close', () => { clearInterval(ping); tests.off('state', send); });
});
app.post('/api/tests/run', async (req, res) => {
  const { filters, ids, configuration } = z.object({ filters: z.array(z.string().max(600)).max(2000).default([]), ids: z.array(z.string().max(600)).max(2000).default([]), configuration: z.string().regex(/^[\w .|-]{1,60}$/).default('Debug') }).parse(req.body);
  // One filter per test, or-ed; a very long filter (huge selections) runs everything instead.
  const joined = [...new Set(filters)].join('|');
  const filter = filters.length && joined.length < 8000 ? joined : undefined;
  res.json(await tests.run({ root: config.repositoryRoot, target: await buildTarget(), filter, requested: filters.length ? ids : ['all'], configuration: configuration.split('|')[0].trim() }));
});
app.post('/api/tests/cancel', (_req, res) => res.json(tests.cancel()));
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
