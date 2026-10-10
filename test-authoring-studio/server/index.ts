import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createPatch } from 'diff';
import { z } from 'zod';
import {
  configSchema,
  scan,
  confined,
  projectRoot,
  parseFeature,
  matchActions,
  matchFeatureBindings,
} from './core.js';
import { Recorder } from './recorder.js';
import { proposeCode } from './proposals.js';
import { command, dotnet } from './core.js';
import type { Index } from '../src/types.js';
import { StepSearch } from './stepSearch.js';
import { normalizeXRef } from './dictionaries.js';
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4310'].includes(origin)
  ) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  if (
    !['127.0.0.1:4310', 'localhost:4310', '127.0.0.1:5173', 'localhost:5173'].includes(
      req.headers.host ?? '',
    )
  ) {
    res.status(403).json({ error: 'Host not allowed' });
    return;
  }
  next();
});
const configFile = path.join(projectRoot, '.local/workspace.json');
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
let search:StepSearch|undefined;
let pendingScan:Promise<Index>|undefined;
function activate(next:Index){search?.close();index=next;index.revision=randomUUID();search=new StepSearch(next.stepDefinitions);return next;}
const ensure = async ():Promise<Index> => {if(index)return index;if(!pendingScan)pendingScan=scan(config).then(activate).finally(()=>{pendingScan=undefined;});return pendingScan;};
function publicIndex(i:Index):Index{return {...i,stats:{steps:i.stepDefinitions.length,selectors:i.selectors.length,features:i.features.length,scenarios:i.features.reduce((n,f)=>n+f.scenarios.length,0),backgrounds:i.features.reduce((n,f)=>n+f.backgrounds.length,0),dictionaries:i.dictionaryEntries?.length??0,methods:i.methods.length},features:i.features.map(f=>({...f,source:'',scenarios:[],backgrounds:[]})),stepDefinitions:[],selectors:[],methods:[],callEdges:[],dictionaryEntries:[]};}
const paging=z.object({q:z.string().max(200).default(''),offset:z.coerce.number().int().min(0).max(10000000).default(0),limit:z.coerce.number().int().min(1).max(50).default(25),keyword:z.enum(['','Given','When','Then']).default('')});
app.get('/api/workspace', async (_req, res) => res.json({ config, index: publicIndex(await ensure()) }));
app.get('/api/steps',async(req,res)=>{await ensure();const {q,offset,limit,keyword}=paging.parse(req.query);res.json(await search!.search(q,offset,limit,keyword));});
app.get('/api/step',async(req,res)=>{const i=await ensure();const binding=search!.byId.get(z.string().parse(req.query.id));if(!binding){res.status(404).json({error:'Binding not found. Refresh the catalogue.'});return;}const visited=new Set<string>();const edges:Index['callEdges']=[];const walk=(id:string)=>{if(visited.has(id)||visited.size>100)return;visited.add(id);for(const e of i.callEdges.filter(e=>e.from===id).slice(0,50)){edges.push(e);if(e.resolution==='Resolved')walk(e.to);}};walk(binding.method);res.json({binding,edges:edges.slice(0,100)});});
app.get('/api/feature',async(req,res)=>{const f=(await ensure()).features.find(f=>f.file===req.query.file);if(!f){res.status(404).json({error:'Feature not found'});return;}res.json(f);});
app.get('/api/dictionaries',async(req,res)=>{const i=await ensure();const {q,offset,limit}=paging.parse(req.query);const entries=(i.dictionaryEntries??[]).filter(e=>normalizeXRef([e.page,e.section,e.field,e.file].join(' ')).includes(normalizeXRef(q)));res.json({items:entries.slice(offset,offset+limit),total:entries.length,hasNext:offset+limit<entries.length});});
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
for (const [route, key] of Object.entries({
  features: 'features',
  selectors: 'selectors',
  scenarios: 'scenarios',
  backgrounds: 'backgrounds',
}))
  app.get(`/api/${route}`, async (req, res) => {
    const i = await ensure();
    const items =
      key === 'scenarios' || key === 'backgrounds'
        ? i.features.flatMap((f) => f[key].map((s) => ({ ...s, file: f.file })))
        : i[key as 'features'];
    const q = String(req.query.q ?? '').toLowerCase();
    const {offset,limit}=paging.parse(req.query);const filtered=items.filter((x) => JSON.stringify(x).toLowerCase().includes(q));res.json({items:filtered.slice(offset,offset+limit),total:filtered.length,hasNext:offset+limit<filtered.length});
  });
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
  await recorder.start(z.string().url().parse(req.body.url));
  res.json({ status: recorder.status });
});
app.post('/api/recording/pause', (req, res) => {
  recorder.status = req.body.resume ? 'recording' : 'paused';
  res.json({ status: recorder.status });
});
app.post('/api/recording/stop', async (_req, res) => {
  await recorder.stop();
  res.json({ status: recorder.status });
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
      project: z.string().endsWith('.csproj'),
      filter: z.string().min(1).max(500),
      approved: z.literal(true),
    })
    .parse(req.body);
  if (execution.status === 'running') throw new Error('A test run is already active.');
  const target = await confined(config.repositoryRoot, project);
  execution = { status: 'running', output: '' };
  command(
    dotnet,
    ['test', target, '--filter', filter, '--logger', 'console;verbosity=normal'],
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
app.use(express.static(path.join(projectRoot, 'dist')));
app.use(
  (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error.message);
    res.status(400).json({ error: error.message });
  },
);
app.listen(4310, '127.0.0.1', () => console.log('Local API: http://127.0.0.1:4310'));
