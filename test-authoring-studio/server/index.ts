import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  resolveStep,
  ignoredDirsFor,
  extraRootsOf,
  isCucumberExpression as isCucumberPattern,
  expressionToRegex as patternToRegex,
} from './core.js';
import { startTerminal, stopTerminal, terminal, type TerminalEvent } from './terminal.js';
import { Recorder } from './recorder.js';
import { Spy } from './spy.js';
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
import { values, render, parameterCount, replaceAttributePattern } from './stepRename.js';
import { installed as nugetInstalled, updates as nugetUpdates, search as nugetSearch, versions as nugetVersions, install as nugetInstall, uninstall as nugetUninstall } from './nuget.js';
import { status as gitStatus, stage as gitStage, unstage as gitUnstage, discard as gitDiscard, commit as gitCommit, headInfo, log as gitLog, branches as gitBranches, checkout as gitCheckout, createBranch as gitCreateBranch, sync as gitSync, merge as gitMerge, blame as gitBlame, clone as gitClone } from './git.js';
import { LanguageService } from './langService.js';
import type { Index } from '../src/types.js';
import { readSettings, writeSettings, settingsSchema, tracesDir, spySnapshotsDir } from './settings.js';
import { WorkspaceSearch } from './stepSearch.js';
import { scenarioSteps, scenarioText, featureWithScenario } from './recordingFeature.js';
import { defineSteps, argumentKind, type StepArgument } from './stepScaffold.js';
import { recordedStepsSource } from './recordedSteps.js';
import { editorConfigFor } from './editorconfig.js';
import { recordHistory, historyOf, historyItem } from './localHistory.js';
import { findVisualStudio, classicProjects, msbuildArgs, classicOutput, CLASSIC_HELP } from './msbuild.js';
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
let activations = 0;
function activate(next:Index){activations++;setTimeout(()=>lang.warm(config.repositoryRoot),0);search?.close();index=next;index.revision=randomUUID();index.scannedAt=new Date().toISOString();search=new WorkspaceSearch({steps:next.stepDefinitions,selectors:next.selectors,dictionaries:next.dictionaryEntries??[],backgrounds:next.features.flatMap(f=>f.backgrounds.map(b=>({...b,file:f.file})))});return next;}
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
 const {steps}=z.object({steps:z.array(z.object({keyword:z.enum(['Given','When','Then']),text:z.string().max(2000),tags:z.array(z.string().max(200)).max(50).optional(),feature:z.string().max(500).optional(),scenario:z.string().max(500).optional()})).max(300)}).parse(req.body);
 const i=await ensure();
 res.json(steps.map(s=>{const r=resolveStep(i.stepDefinitions,s);const b=r.bindings[0];return {status:r.status,params:r.params,binding:b?{pattern:b.pattern,file:b.file,line:b.line}:null};}));
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
// Define Steps (Reqnroll): the unbound steps of a feature, and skeleton methods for them (new class or appended).
async function unboundSteps(file:string){
 const i=await ensure();
 const feature=i.features.find(f=>f.file===file);
 if(!feature)throw new Error(`${file} is not an indexed feature file.`);
 const out:{keyword:string;text:string;line:number;arg?:StepArgument}[]=[];
 for(const block of [...feature.backgrounds,...feature.scenarios]){
  let kw='Given';
  for(const st of block.steps){
   const k=st.keyword.trim();if(['Given','When','Then'].includes(k))kw=k;
   if(st.status==='Unmatched')out.push({keyword:kw,text:st.text,line:st.line,arg:argumentKind(st.argument)});
  }
 }
 return {feature,steps:out};
}
// Check RegExp (Rider) for step definition patterns: the regular expression (Cucumber expressions converted) and the
// feature steps it matches.
app.post('/api/steps/regex', async (req, res) => {
  const { pattern } = z.object({ pattern: z.string().max(2000) }).parse(req.body);
  const cucumber = isCucumberPattern(pattern);
  const regex = patternToRegex(pattern, cucumber);
  let re: RegExp;
  try { re = new RegExp(`^(?:${regex.replace(/^\^/, '').replace(/\$$/, '')})$`); } catch (e) { res.json({ regex, cucumber, steps: [], error: (e as Error).message }); return; }
  const i = await ensure();
  const steps: { file: string; line: number; text: string }[] = [];
  for (const f of i.features) for (const b of [...f.backgrounds, ...f.scenarios]) for (const st of b.steps) if (steps.length < 500 && re.test(st.text)) steps.push({ file: f.file, line: st.line, text: st.text });
  res.json({ regex, cucumber, steps });
});
// Find unused step definitions (Reqnroll): bindings no feature step resolves to.
// Gherkin formatting settings (.editorconfig, as Reqnroll reads them) for a feature file.
app.get('/api/editorconfig',async(req,res)=>{const file=z.string().min(1).max(400).parse(req.query.file);await confined(config.repositoryRoot,file,false);res.json(await editorConfigFor(config.repositoryRoot,file));});
app.get('/api/steps/unused',async(_req,res)=>{const i=await ensure();res.json(i.stepDefinitions.filter(b=>b.usages===0).map(b=>({id:b.id,keyword:b.keyword,pattern:b.pattern,className:b.className,method:b.method.split('(')[0].split('.').pop(),file:b.file,line:b.line})).sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line));});
app.get('/api/steps/unbound',async(req,res)=>{const file=z.string().max(400).parse(req.query.file);const r=await unboundSteps(file);res.json({feature:r.feature.name,steps:r.steps,files:[...new Set((await ensure()).stepDefinitions.map(b=>b.file))].sort()});});
app.post('/api/steps/define',async(req,res)=>{
 const b=z.object({feature:z.string().max(400),lines:z.array(z.number().int()).max(500).optional(),file:z.string().max(400).regex(/\.cs$/i,'Step definition files end with .cs.'),className:z.string().regex(/^[A-Za-z_]\w{0,100}$/,'Use a C# class name.')}).parse(req.body);
 const i=await ensure();
 const {steps}=await unboundSteps(b.feature);
 const chosen=b.lines?steps.filter(s=>b.lines!.includes(s.line)):steps;
 const cucumber=i.stepDefinitions.filter(x=>x.expression==='Cucumber').length;
 const style=cucumber>i.stepDefinitions.length/2?'cucumber':'regex';
 const target=await confined(config.repositoryRoot,b.file,false);
 const before=await fs.readFile(target,'utf8').catch((e)=>{if(e.code==='ENOENT')return '';throw e;});
 const sampleFile=i.stepDefinitions[0]?.file;
 const sample=sampleFile?await fs.readFile(path.join(config.repositoryRoot,sampleFile),'utf8').catch(()=>undefined):undefined;
 let reqnroll=/using\s+Reqnroll\s*;/.test(sample??'');
 for(const c of (await projectModel(config,i)).files.filter(f=>f.file.endsWith('.csproj')).slice(0,20))if(/Include="Reqnroll/i.test(await fs.readFile(path.join(config.repositoryRoot,c.file),'utf8').catch(()=>'')))reqnroll=true;
 const r=defineSteps(chosen,style,{className:b.className,existing:before||undefined,sample,reqnroll});
 const id=randomUUID();previews.set(id,{file:b.file,source:r.source,hash:hash(before),root:config.repositoryRoot});
 res.json({id,file:b.file,created:!before,changed:true,count:r.count,methods:r.methods,style,diff:createPatch(b.file,before,r.source,'repository','proposed')});
});
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
// Add ▸ New Project / Existing Project, Remove (dotnet sln add / remove; dotnet new for new projects).
const runDotnet = (args: string[], cwd: string) => new Promise<string>((resolve, reject) => {
  const p = spawn(dotnet, args, { cwd, windowsHide: true, env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en', DOTNET_NOLOGO: '1' } });
  let out = '';
  p.stdout?.on('data', (d) => { out += d; });
  p.stderr?.on('data', (d) => { out += d; });
  p.on('error', reject);
  p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(out.trim().split('\n').slice(-3).join(' ') || `dotnet ${args[0]} failed.`))));
});
const needSolution = () => { if (!config.solution) throw new Error('Open a solution (.sln / .slnx) to add or remove projects.'); return config.solution; };
const PROJECT_TEMPLATES = ['classlib', 'nunit', 'xunit', 'mstest', 'console'] as const;
app.post('/api/solution/projects/new', async (req, res) => {
  const { template, name, folder } = z.object({ template: z.enum(PROJECT_TEMPLATES), name: z.string().trim().regex(/^[A-Za-z_][\w.]{0,80}$/, 'Use letters, digits, dots and underscores.'), folder: z.string().max(300).default('') }).parse(req.body);
  const sln = needSolution();
  const dir = path.posix.join(folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '') || '.', name);
  const target = await confined(config.repositoryRoot, dir, false);
  if (await fs.stat(target).then(() => true, () => false)) throw new Error(`${dir} already exists.`);
  await runDotnet(['new', template, '-n', name, '-o', target, '--no-restore'], config.repositoryRoot);
  const csproj = path.posix.join(dir, `${name}.csproj`);
  await runDotnet(['sln', sln, 'add', csproj], config.repositoryRoot);
  rescanSoon(200);
  res.json({ project: csproj });
});
app.post('/api/solution/projects/add', async (req, res) => {
  const { path: given } = z.object({ path: z.string().trim().min(1).max(1000) }).parse(req.body);
  const sln = needSolution();
  const full = path.resolve(config.repositoryRoot, given);
  if (!/\.csproj$/i.test(full) || !(await fs.stat(full).then((s) => s.isFile(), () => false))) throw new Error(`${given} is not a .csproj file.`);
  await runDotnet(['sln', sln, 'add', full], config.repositoryRoot);
  rescanSoon(200);
  res.json({ project: path.relative(config.repositoryRoot, full).replaceAll('\\', '/') });
});
app.post('/api/solution/projects/remove', async (req, res) => {
  const { project } = z.object({ project: z.string().max(400), approved: z.literal(true) }).parse(req.body);
  const sln = needSolution();
  await runDotnet(['sln', sln, 'remove', project], config.repositoryRoot);
  rescanSoon(200);
  res.json({ ok: true });
});
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
  if(!solutionFile){const found=(await findSolutions(config.repositoryRoot,ignoredDirsFor(config),1));if(found.length===1)solutionFile=found[0];}
  const parsed=solutionFile?await readSolution(config.repositoryRoot,solutionFile).catch(()=>undefined):undefined;
  const files=parsed?model.files:model.files;
  const projectFiles=parsed?parsed.projects.map(p=>p.file):(model.projects.length?model.projects:[]);
  const projects=await Promise.all(projectFiles.map(async(file)=>({file,name:path.posix.basename(file).replace(/\.\w+proj$/i,''),dir:path.posix.dirname(file)==='.'?'':path.posix.dirname(file),...await projectInfo(config.repositoryRoot,file),external:file.startsWith('../')})));
  if(!projects.length)projects.push({file:'.',name:model.root,dir:'',packages:model.packages,frameworks:model.frameworks,references:[],missing:false,external:false,legacy:false,assemblies:[],items:undefined});
  const tree=parsed?.tree??projects.map(p=>({kind:'project' as const,name:p.name,file:p.file}));
  res.json({name:solutionFile?path.posix.basename(solutionFile).replace(/\.slnx?$/i,''):model.root,solutionFile:solutionFile||null,configurations:parsed?.configurations??['Debug','Release'],tree,projects,packages:model.packages,frameworks:model.frameworks,files,nesting,truncated:model.truncated});
});
// File ▸ Open ▸ Project/Solution: a .sln/.slnx/.csproj (or a folder) on disk becomes the workspace.
// Open Project/Solution ▸ browse (web: the browser cannot show native paths): folders and solution / project files.
// TODO window (Rider): TODO / FIXME / HACK / BUG comments in the solution's sources, features and config.
app.get('/api/todos', async (_req, res) => {
  const ignored = new Set(ignoredDirsFor(config));
  const roots = [config.repositoryRoot, ...extraRootsOf(await fs.realpath(config.repositoryRoot).catch(() => config.repositoryRoot))];
  const out: { file: string; line: number; column: number; kind: string; text: string }[] = [];
  const re = /(?:\/\/+|#|<!--|\/\*|^\s*\*)\s*\b(TODO|FIXME|HACK|BUG)\b[:\s-]*(.*?)(?:-->|\*\/)?\s*$/i;
  const walk = async (dir: string, depth: number) => {
    if (depth > 20 || out.length >= 2000) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.') || ignored.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!/\.(cs|feature|xml|json|config|md|props|targets|csproj|ts|js)$/i.test(e.name)) continue;
      const text = await fs.readFile(full, 'utf8').catch(() => '');
      if (text.length > 2_000_000 || !/TODO|FIXME|HACK|BUG/i.test(text)) continue;
      text.split(/\r?\n/).forEach((l, i) => { const m = re.exec(l); if (m && out.length < 2000) out.push({ file: path.relative(config.repositoryRoot, full).replaceAll('\\', '/'), line: i + 1, column: (m.index ?? 0) + 1, kind: m[1].toUpperCase(), text: m[2].trim() }); });
    }
  };
  for (const r of roots) await walk(r, 0);
  res.json(out);
});
// Output window ▸ Language service.
app.get('/api/output/language', (_req, res) => res.json({ lines: lang.log }));
app.get('/api/fs/browse', async (req, res) => {
  const asked = z.string().max(1000).optional().parse(req.query.dir);
  const dir = path.resolve(asked || path.dirname(config.repositoryRoot));
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((e) => { throw new Error(`Cannot open ${dir}: ${(e as Error).message}`); });
  const kind = (n: string) => (/\.slnx?$/i.test(n) ? 'solution' : /\.csproj$/i.test(n) ? 'project' : undefined);
  const items = entries
    .filter((e) => (e.isDirectory() && !e.name.startsWith('.') && !['bin', 'obj', 'node_modules', '$RECYCLE.BIN', 'System Volume Information'].includes(e.name)) || (e.isFile() && kind(e.name)))
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), kind: e.isDirectory() ? 'folder' : kind(e.name)! }))
    .sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .slice(0, 2000);
  // Windows drives (C:\, D:\ …) for the drive list.
  const drives = process.platform === 'win32' ? (await Promise.all('CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (l) => ((await fs.stat(`${l}:\\`).then(() => true, () => false)) ? `${l}:\\` : null)))).filter(Boolean) : ['/'];
  const parent = path.dirname(dir);
  res.json({ dir, parent: parent === dir ? null : parent, drives, items });
});
app.get('/api/solution/find',async(_req,res)=>{res.json(await findSolutions(config.repositoryRoot,ignoredDirsFor(config)));});
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
  lang.stop();config=next;activate(scanned);previews.clear();
  await fs.mkdir(path.dirname(configFile),{recursive:true});
  await fs.writeFile(configFile,JSON.stringify(config,null,2));
  restoreOnOpen(next);
  res.json({config,index:publicIndex(index!)});
});
/**
 * NuGet restore on open (Visual Studio restores when a solution loads): when a project has no obj/project.assets.json
 * yet, `dotnet restore` runs in the background; the language service restarts afterwards to load the packages.
 */
export const restoreState: { status: 'idle' | 'running' | 'done' | 'failed'; target?: string; output?: string } = { status: 'idle' };
let restoring: Promise<void> = Promise.resolve();
/** Builds, test runs and debug sessions wait for a restore in progress (both would write obj/). */
const afterRestore = () => restoring;
async function restoreOnOpen(target: typeof config) {
  const what = target.solution || (target.targetProject.endsWith('.csproj') ? target.targetProject : '');
  if (!what || process.env.STUDIO_NO_RESTORE) return;
  const projects = what.endsWith('.csproj') ? [what] : (await readSolution(target.repositoryRoot, what).then((s) => s.projects.map((p) => p.file).filter((f) => /\.csproj$/i.test(f)), () => [] as string[]));
  const missing = await Promise.all(projects.map((p) => fs.stat(path.join(target.repositoryRoot, path.dirname(p), 'obj', 'project.assets.json')).then(() => false, () => true)));
  if (!missing.some(Boolean)) return;
  Object.assign(restoreState, { status: 'running', target: what, output: '' });
  const proc = spawn(dotnet, ['restore', what, '-nologo', '-v:q'], { cwd: target.repositoryRoot, windowsHide: true, env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en' } });
  restoring = new Promise<void>((done) => { proc.on('exit', () => done()); proc.on('error', () => done()); });
  proc.stdout?.on('data', (d) => { restoreState.output += d; });
  proc.stderr?.on('data', (d) => { restoreState.output += d; });
  proc.on('error', (e) => { Object.assign(restoreState, { status: 'failed', output: `${restoreState.output}${e.message}` }); });
  proc.on('exit', (code) => {
    restoreState.status = code === 0 ? 'done' : 'failed';
    if (code === 0 && config.repositoryRoot === target.repositoryRoot) lang.stop();
  });
}
app.get('/api/restore', (_req, res) => res.json(restoreState));
app.get('/api/health',(_req,res)=>res.json({ok:true,scannedAt:index?.scannedAt??null}));
app.get('/api/project/model',async(_req,res)=>{res.json(await projectModel(config,await ensure()));});
app.get('/api/project/files',async(req,res)=>{const folder=z.string().default('.').parse(req.query.folder);const dir=await confined(config.repositoryRoot,folder);const entries=await fs.readdir(dir,{withFileTypes:true});const {offset,limit}=paging.parse(req.query);const filtered=entries.filter(e=>!e.isSymbolicLink()&&!e.name.startsWith('.')&&!ignoredDirsFor(config).includes(e.name)).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));res.json({folder,items:filtered.slice(offset,offset+limit).map(e=>({name:e.name,file:path.relative(config.repositoryRoot,path.join(dir,e.name)).replaceAll('\\','/'),directory:e.isDirectory()})),total:filtered.length,hasNext:offset+limit<filtered.length});});
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
// Text files the editors can save (project files, JSON, Markdown, .http requests, scripts, …).
const editable = /\.(cs|feature|xml|csproj|props|targets|config|runsettings|resx|json|md|markdown|txt|http|rest|ya?ml|editorconfig|sln|slnx|ps1|psm1|sh|cmd|bat|js|mjs|cjs|ts|tsx|css|scss|html?|gitignore|gitattributes|env|ini|csv|sql)$/i;
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
    const before = activations;
    // Dropped when the workspace changed or a newer index was activated while this scan ran.
    scan(target).then((i) => { if (config === target && activations === before) activate(i); }).catch((e) => console.error('Rescan failed:', (e as Error).message));
  }, delay);
}
app.post('/api/file/save', async (req, res) => {
  const { file, source, baseHash } = z.object({ file: z.string().max(400).regex(editable), source: z.string().max(1_000_000), baseHash: z.string().max(80) }).parse(req.body);
  if (file.endsWith('.feature')) parseFeature(source, file, []);
  const target = await confined(config.repositoryRoot, file, false);
  const before = await fs.readFile(target, 'utf8').catch((e) => { if (e.code === 'ENOENT') return ''; throw e; });
  if (hash(before) !== baseHash) { res.status(409).json({ error: `${file} changed outside the studio. Reload it before saving.`, hash: hash(before) }); return; }
  await recordHistory(config.repositoryRoot, file, before, 'save').catch(() => {});
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
for (const op of ['complete', 'hover', 'definition', 'references', 'signature', 'implementations', 'base', 'symbolId', 'typeHierarchy', 'callers'] as const) {
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
// Problems tool window (Rider's solution-wide analysis): feature steps without (or with several) step definitions, and
// the C# compiler's errors and warnings in every project.
app.get('/api/problems', async (_req, res) => {
  const i = await ensure();
  const problems: { source: 'C#' | 'Gherkin'; file: string; line: number; column: number; severity: 'error' | 'warning'; id: string; message: string; project?: string }[] = [];
  for (const f of i.features) for (const block of [...f.backgrounds, ...f.scenarios]) for (const st of block.steps) {
    if (st.status === 'Unmatched') problems.push({ source: 'Gherkin', file: f.file, line: st.line, column: 1, severity: 'warning', id: 'TAS-UNBOUND', message: `No step definition for "${st.keyword.trim()} ${st.text}"` });
    else if (st.status === 'Ambiguous') problems.push({ source: 'Gherkin', file: f.file, line: st.line, column: 1, severity: 'error', id: 'TAS-AMBIGUOUS', message: `Several step definitions match "${st.keyword.trim()} ${st.text}"` });
  }
  let csharp: string | undefined;
  try {
    const cs = await lang.request<{ project: string; file: string; line: number; column: number; severity: 'error' | 'warning'; id: string; message: string }[]>(config.repositoryRoot, { op: 'solutionDiagnostics' }, 180_000);
    problems.push(...cs.map((d) => ({ ...d, source: 'C#' as const })));
  } catch (e) { csharp = `C# analysis unavailable: ${(e as Error).message}`; }
  res.json({ problems, csharp });
});
// Problems (Rider's solution-wide analysis): compiler errors and warnings of every project.
app.get('/api/csharp/problems', async (_req, res) => {
  res.json(await lang.request(config.repositoryRoot, { op: 'solutionDiagnostics' }, 180_000));
});
app.post('/api/csharp/outline', async (req, res) => {
  const body = z.object({ file: z.string().max(400).regex(/\.cs$/), source: z.string().max(1_000_000).optional() }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  res.json(await lang.request(config.repositoryRoot, { op: 'outline', ...body, line: 1, column: 1 }, 30_000));
});
app.post('/api/csharp/referenceCounts', async (req, res) => {
  const body = z.object({ file: z.string().max(400).regex(/\.cs$/) }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  res.json(await lang.request(config.repositoryRoot, { op: 'referenceCounts', ...body, line: 1, column: 1 }, 30_000));
});
app.post('/api/csharp/inlayHints', async (req, res) => {
  const body = z.object({ file: z.string().max(400).regex(/\.cs$/), source: z.string().max(1_000_000).optional() }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  res.json(await lang.request(config.repositoryRoot, { op: 'inlayHints', ...body, line: 1, column: 1 }, 30_000));
});
app.post('/api/csharp/organize', async (req, res) => {
  const body = z.object({ file: z.string().max(400).regex(/\.cs$/), source: z.string().max(1_000_000) }).parse(req.body);
  await confined(config.repositoryRoot, body.file, false);
  res.json(await lang.request(config.repositoryRoot, { op: 'organize', ...body }, 60_000));
});
// Git Changes: status, stage / unstage, discard (approved), commit, history, HEAD text for change markers.
const gitFiles = z.object({ files: z.array(z.string().min(1).max(400).refine((v) => !v.split(/[\\/]/).includes('..'), 'Path cannot contain ..')).min(1).max(5000) });
app.get('/api/git/status', async (_req, res) => res.json(await gitStatus(config.repositoryRoot)));
app.get('/api/git/log', async (_req, res) => res.json(await gitLog(config.repositoryRoot)));
app.get('/api/git/head', async (req, res) => {
  const file = z.string().min(1).max(400).parse(req.query.file);
  await confined(config.repositoryRoot, file, false);
  res.json(await headInfo(config.repositoryRoot, file));
});
app.get('/api/git/blame', async (req, res) => {
  const file = z.string().min(1).max(400).parse(req.query.file);
  await confined(config.repositoryRoot, file, false);
  res.json(await gitBlame(config.repositoryRoot, file));
});
app.post('/api/git/stage', async (req, res) => { await gitStage(config.repositoryRoot, gitFiles.parse(req.body).files); res.json(await gitStatus(config.repositoryRoot)); });
app.post('/api/git/unstage', async (req, res) => { await gitUnstage(config.repositoryRoot, gitFiles.parse(req.body).files); res.json(await gitStatus(config.repositoryRoot)); });
app.post('/api/git/discard', async (req, res) => {
  const { files } = gitFiles.extend({ approved: z.literal(true) }).parse(req.body);
  for (const f of files) await confined(config.repositoryRoot, f, false);
  await gitDiscard(config.repositoryRoot, files);
  lang.notify(config.repositoryRoot, files);
  rescanSoon(300);
  res.json(await gitStatus(config.repositoryRoot));
});
app.get('/api/git/branches', async (_req, res) => res.json(await gitBranches(config.repositoryRoot)));
app.post('/api/git/checkout', async (req, res) => {
  const { name, create } = z.object({ name: z.string().trim().min(1).max(200), create: z.boolean().optional() }).parse(req.body);
  if (create) await gitCreateBranch(config.repositoryRoot, name); else await gitCheckout(config.repositoryRoot, name);
  rescanSoon(300);
  res.json(await gitStatus(config.repositoryRoot));
});
app.post('/api/git/merge', async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(200) }).parse(req.body);
  const output = await gitMerge(config.repositoryRoot, name);
  rescanSoon(300);
  res.json({ output, status: await gitStatus(config.repositoryRoot) });
});
app.post('/api/git/clone', async (req, res) => {
  const { url, folder } = z.object({ url: z.string().trim().min(1).max(1000), folder: z.string().trim().min(1).max(1000) }).parse(req.body);
  if (!path.isAbsolute(folder)) throw new Error('Enter a full path for the folder, e.g. C:\\src.');
  res.json({ path: await gitClone(url, folder) });
});
app.post('/api/git/sync', async (req, res) => {
  const { action } = z.object({ action: z.enum(['fetch', 'pull', 'push']) }).parse(req.body);
  const output = await gitSync(config.repositoryRoot, action);
  if (action === 'pull') rescanSoon(300);
  res.json({ output, status: await gitStatus(config.repositoryRoot) });
});
app.post('/api/git/commit', async (req, res) => {
  const { message, all, amend } = z.object({ message: z.string().trim().min(1, 'Enter a commit message.').max(20000), all: z.boolean().optional(), amend: z.boolean().optional() }).parse(req.body);
  const summary = await gitCommit(config.repositoryRoot, message, { all, amend });
  res.json({ summary, status: await gitStatus(config.repositoryRoot) });
});
/**
 * Rename Step: new pattern for the binding at file:line; every bound feature line is re-worded with its parameter
 * values carried over. Without `apply` it is a preview; with `apply` the C# attribute and the feature files are written.
 */
app.post('/api/steps/rename', async (req, res) => {
  const { file, line, newPattern, apply } = z.object({ file: z.string().min(1).max(400), line: z.number().int().min(1), newPattern: z.string().trim().min(1).max(1000), apply: z.boolean().optional() }).parse(req.body);
  const i = await ensure();
  const b = i.stepDefinitions.find((x) => x.file === file && x.line === line);
  if (!b) throw new Error('Put the cursor on a step definition attribute ([Given], [When], [Then]).');
  if (parameterCount(newPattern) !== parameterCount(b.pattern)) throw new Error(`The new pattern needs ${parameterCount(b.pattern)} parameter${parameterCount(b.pattern) === 1 ? '' : 's'}, like the current one.`);
  const csPath = await confined(config.repositoryRoot, file);
  const csLines = (await fs.readFile(csPath, 'utf8')).split('\n');
  const attrBefore = csLines[line - 1] ?? '';
  const attrAfter = replaceAttributePattern(attrBefore, b.pattern, newPattern);
  if (attrAfter === null) throw new Error('The pattern string was not found on that line (is it built from constants?).');
  const steps: { file: string; line: number; before: string; after: string }[] = [];
  let unmatched = 0;
  for (const f of i.features) for (const block of [...f.backgrounds, ...f.scenarios]) for (const s of block.steps) {
    if (!s.candidates.includes(b.id)) continue;
    const vals = values(b.pattern, s.text);
    if (!vals) { unmatched++; continue; }
    steps.push({ file: f.file, line: s.line, before: s.text, after: render(newPattern, vals) });
  }
  if (!apply) { res.json({ binding: { file, line, before: attrBefore.trim(), after: attrAfter.trim() }, steps, unmatched }); return; }
  csLines[line - 1] = attrAfter;
  await fs.writeFile(csPath, csLines.join('\n'), 'utf8');
  const written = new Set([file]);
  const byFile = new Map<string, typeof steps>();
  for (const s of steps) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s]);
  for (const [featureFile, edits] of byFile) {
    const p = await confined(config.repositoryRoot, featureFile);
    const lines = (await fs.readFile(p, 'utf8')).split('\n');
    for (const e of edits) { const at = lines[e.line - 1]; if (at?.includes(e.before)) lines[e.line - 1] = at.replace(e.before, e.after); }
    await fs.writeFile(p, lines.join('\n'), 'utf8');
    written.add(featureFile);
  }
  lang.notify(config.repositoryRoot, [...written]);
  activate(await scan(config));
  res.json({ written: [...written], steps: steps.length, index: publicIndex(index!) });
});
// Manage NuGet Packages: installed / updates / browse (nuget.org) per project; install, update, uninstall.
const nugetProject = async (project: string) => { if (!project.endsWith('.csproj')) throw new Error('Choose a project (.csproj).'); await confined(config.repositoryRoot, project); return project; };
app.get('/api/nuget/installed', async (req, res) => res.json(await nugetInstalled(config.repositoryRoot, await nugetProject(z.string().parse(req.query.project)))));
app.get('/api/nuget/updates', async (req, res) => res.json(await nugetUpdates(config.repositoryRoot, await nugetProject(z.string().parse(req.query.project)))));
app.get('/api/nuget/search', async (req, res) => {
  const { q, prerelease } = z.object({ q: z.string().max(200).default(''), prerelease: z.enum(['true', 'false']).default('false') }).parse(req.query);
  res.json(await nugetSearch(q, prerelease === 'true'));
});
app.get('/api/nuget/versions', async (req, res) => {
  const { id, prerelease } = z.object({ id: z.string().min(1).max(100), prerelease: z.enum(['true', 'false']).default('false') }).parse(req.query);
  res.json(await nugetVersions(id, prerelease === 'true'));
});
app.post('/api/nuget/install', async (req, res) => {
  const { project, id, version } = z.object({ project: z.string().max(400), id: z.string().max(100), version: z.string().max(64).optional() }).parse(req.body);
  const output = await nugetInstall(config.repositoryRoot, await nugetProject(project), id, version);
  lang.stop();
  rescanSoon(300);
  res.json({ output, installed: await nugetInstalled(config.repositoryRoot, project) });
});
app.post('/api/nuget/uninstall', async (req, res) => {
  const { project, id } = z.object({ project: z.string().max(400), id: z.string().max(100), approved: z.literal(true) }).parse(req.body);
  const output = await nugetUninstall(config.repositoryRoot, await nugetProject(project), id);
  lang.stop();
  rescanSoon(300);
  res.json({ output, installed: await nugetInstalled(config.repositoryRoot, project) });
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
  res.json(await findInFiles(config.repositoryRoot, ignoredDirsFor(config), options));
});
app.post('/api/search/replace', async (req, res) => {
  const { replacement, files, approved: _approved, ...options } = searchOptions.extend({ replacement: z.string().max(5000), files: z.array(z.string().max(400)).max(5000).optional(), approved: z.literal(true) }).parse(req.body);
  const changed = await replaceInFiles(config.repositoryRoot, ignoredDirsFor(config), options, replacement, files);
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
  if ((await fs.stat(target)).isFile()) await recordHistory(config.repositoryRoot, file, await fs.readFile(target, 'utf8').catch(() => ''), 'delete').catch(() => {});
  await fs.rm(target, { recursive: true });
  afterFileChange([file]);
  res.json({ ok: true });
});
// Local History (Rider): earlier versions of a file the studio wrote.
app.get('/api/history', async (req, res) => { const file = z.string().min(1).max(400).parse(req.query.file); await confined(config.repositoryRoot, file, false); res.json(await historyOf(config.repositoryRoot, file)); });
app.get('/api/history/item', async (req, res) => { const { file, id } = z.object({ file: z.string().min(1).max(400), id: z.string().max(80) }).parse(req.query); await confined(config.repositoryRoot, file, false); res.json({ source: await historyItem(config.repositoryRoot, file, id) }); });
app.get('/api/source', async (req, res) => {
  const file = await confined(config.repositoryRoot, String(req.query.file));
  if (!editable.test(file)) throw new Error('Unsupported source file');
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
// Spy (GUI object recognition, like Ranorex Spy): track / select elements on a live page, tree, properties, verified selectors.
const spy = new Spy();
app.get('/api/spy', (_req, res) => res.json(spy.state()));
app.post('/api/spy/start', async (req, res) => { await spy.start(z.string().url().parse(req.body.url)); res.json(spy.state()); });
app.post('/api/spy/stop', async (_req, res) => { await spy.stop(); res.json(spy.state()); });
app.post('/api/spy/track', async (req, res) => { await spy.track(z.boolean().parse(req.body.on)); res.json(spy.state()); });
app.get('/api/spy/tree', async (_req, res) => res.json(await spy.tree()));
app.post('/api/spy/select', async (req, res) => res.json(await spy.select(z.number().int().min(1).parse(req.body.id))));
app.post('/api/spy/verify', async (req, res) => { const { type, value } = z.object({ type: z.string().max(60), value: z.string().min(1).max(2000) }).parse(req.body); res.json(await spy.verify(type, value)); });
app.post('/api/spy/snapshot', async (_req, res) => res.json(await spy.snapshot()));
app.get('/api/spy/snapshots', async (_req, res) => {
  const files = (await fs.readdir(spySnapshotsDir).catch(() => [] as string[])).filter((f) => /^[\w.-]+\.spy\.json$/.test(f));
  res.json((await Promise.all(files.map(async (name) => ({ name, modified: (await fs.stat(path.join(spySnapshotsDir, name))).mtime })))).sort((a, b) => +b.modified - +a.modified));
});
app.get('/api/spy/snapshots/:name', async (req, res) => {
  const name = z.string().regex(/^[\w.-]+\.spy\.json$/, 'Invalid snapshot name').parse(req.params.name);
  // Read directly: sendFile refuses paths through dot-folders (.local).
  const body = await fs.readFile(path.join(spySnapshotsDir, name), 'utf8').catch(() => { throw new Error(`Snapshot ${name} was not found.`); });
  if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.type('application/json').send(body);
});
app.post('/api/spy/screenshot', async (req, res) => res.json({ png: await spy.screenshot(z.number().int().min(1).parse(req.body.id)) }));
app.get('/api/recording', (_req, res) =>
  res.json({ status: recorder.status, actions: recorder.actions, ...(recorder.cdpPort ? { cdpPort: recorder.cdpPort } : {}) }),
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
 res.json(await recordingDictionary(actions,page,section,file,pageObjectFile));
});
/**
 * Save recording: one preview for the feature file (new, or the scenario appended to an existing one) and the
 * dictionary entries for the same actions. Nothing is written until each preview is approved (/api/generation/apply).
 */
// Go To Hooks (Reqnroll): the hooks that run for the scenario at a feature line, in execution order.
const HOOK_ORDER=['BeforeTestRun','BeforeFeature','BeforeScenario','BeforeScenarioBlock','BeforeStep','AfterStep','AfterScenarioBlock','AfterScenario','AfterFeature','AfterTestRun'];
app.get('/api/hooks',async(req,res)=>{
 const {file,line}=z.object({file:z.string().max(400),line:z.coerce.number().int().min(1)}).parse(req.query);
 const i=await ensure();
 const feature=i.features.find(f=>f.file===file||f.file===file.replace(/^\.\//,''));
 const scenario=feature?[...feature.scenarios].filter(s=>s.line<=line).sort((a,b)=>b.line-a.line)[0]:undefined;
 const exampleTags=((scenario?.examples??[]) as {tags?:{name:string}[]}[]).flatMap(e=>(e.tags??[]).map(t=>t.name));
 const tags=new Set([...(feature?.tags??[]),...(scenario?.tags??[]),...exampleTags].map(t=>t.replace(/^@/,'')));
 const inScope=(h:NonNullable<typeof i.hooks>[number])=>!h.scopes.length||h.scopes.some(s=>(!s.tag||tags.has(s.tag.replace(/^@/,'')))&&(!s.feature||s.feature===feature?.name)&&(!s.scenario||s.scenario===scenario?.name));
 const applies=(h:NonNullable<typeof i.hooks>[number])=>{
  if(h.kind.endsWith('TestRun'))return true;
  if(!scenario&&!h.kind.endsWith('Feature'))return false;
  // Tag filters are OR-ed: at least one of the hook's tags must be on the feature / scenario / examples.
  return (!h.tags.length||h.tags.some(t=>tags.has(t.replace(/^@/,''))))&&inScope(h);
 };
 const hooks=(i.hooks??[]).filter(applies).sort((a,b)=>HOOK_ORDER.indexOf(a.kind)-HOOK_ORDER.indexOf(b.kind)||a.order-b.order||a.file.localeCompare(b.file)||a.line-b.line);
 res.json({feature:feature?.name??null,scenario:scenario?.name??null,tags:[...tags],hooks});
});
app.post('/api/recording/save-preview',async(req,res)=>{
 const b=z.object({
  actions:z.array(actionSchema).min(1).max(500),
  accepted:z.record(z.string(),z.string().max(1000)).default({}),
  featureFile:z.string().trim().min(1).max(400).regex(/\.feature$/i,'Feature files end with .feature.'),
  featureName:z.string().trim().min(1).max(200),
  scenario:z.string().trim().min(1).max(200),
  dictionary:z.object({page:z.string().trim().min(1).max(200),section:z.string().trim().min(1).max(200),file:z.string().trim().min(5).max(400)}).optional(),
  stepDefinitions:z.boolean().default(false),
 }).parse(req.body);
 const steps=scenarioSteps(b.actions,b.accepted);
 if(!steps.length)throw new Error('The recording has no steps to save.');
 const target=await confined(config.repositoryRoot,b.featureFile,false);
 const before=await fs.readFile(target,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 const source=featureWithScenario(before,b.featureName,scenarioText(b.scenario,steps));
 parseFeature(source,b.featureFile,[]); // throws on invalid Gherkin before anything is offered
 const id=randomUUID();previews.set(id,{file:b.featureFile,source,hash:hash(before),root:config.repositoryRoot});
 const feature={id,file:b.featureFile,created:!before,changed:true,diff:createPatch(b.featureFile,before,source,'repository','proposed')};
 const dictionary=b.dictionary?await recordingDictionary(b.actions,b.dictionary.page,b.dictionary.section,b.dictionary.file):null;
 // Drafted steps the repository cannot bind yet: offer RecordedSteps.cs (generic, dictionary-driven) once.
 const i=await ensure();
 const draftFeature=parseFeature(`Feature: x\n\n${scenarioText('x',steps.filter(s=>s.drafted))}`,'draft.feature',[]);
 await matchFeatureBindings([draftFeature],i.stepDefinitions);
 const unbound=draftFeature.scenarios.flatMap(sc=>sc.steps).filter(st=>!st.candidates.length).length;
 let stepFile=null;
 if(unbound&&b.stepDefinitions){
  const counts=new Map<string,number>();for(const d of i.stepDefinitions){const dir=path.posix.dirname(d.file);counts.set(dir,(counts.get(dir)??0)+1);}
  const dir=[...counts].sort((x,y)=>y[1]-x[1])[0]?.[0]??'Steps';
  const file=path.posix.join(dir==='.'?'':dir,'RecordedSteps.cs');
  const target2=await confined(config.repositoryRoot,file,false);
  if(!(await fs.access(target2).then(()=>true,()=>false))){
   const sample=i.stepDefinitions.find(d=>path.posix.dirname(d.file)===dir);
   const sampleText=sample?await fs.readFile(path.join(config.repositoryRoot,sample.file),'utf8').catch(()=>''):'';
   const ns=/^\s*namespace\s+([\w.]+)/m.exec(sampleText)?.[1]??(path.basename(config.repositoryRoot).replace(/\W/g,'')||'Tests');
   const csprojs=(await projectModel(config,i)).files.filter(f=>f.file.endsWith('.csproj'));
   let reqnroll=/using\s+Reqnroll\s*;/.test(sampleText);
   for(const c of csprojs.slice(0,20))if(/Include="Reqnroll/i.test(await fs.readFile(path.join(config.repositoryRoot,c.file),'utf8').catch(()=>'')))reqnroll=true;
   const source=recordedStepsSource({namespace:ns,reqnroll});
   const id2=randomUUID();previews.set(id2,{file,source,hash:hash(''),root:config.repositoryRoot});
   stepFile={id:id2,file,created:true,changed:true,diff:createPatch(file,'',source,'repository','proposed')};
  }
 }
 res.json({feature,steps,drafted:steps.filter(s=>s.drafted).length,unbound,dictionary,stepFile});
});
/** Recording → dictionary entries (and optionally a dictionary-backed page object), previewed, never written here. */
async function recordingDictionary(actions:z.infer<typeof actionSchema>[],page:string,section:string,file:string,pageObjectFile?:string){
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
 return {proposals,dictionary,pageObject,skipped,reused:members.length-proposals.length};
}
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
  await recordHistory(config.repositoryRoot, p.file, before, 'change').catch(() => {});
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
  // dotfiles: the traces folder is under .local (send refuses dot-folders by default).
  res.download(path.join(tracesDir, name), name, { dotfiles: 'allow' });
});
// Debugger (Visual Studio style): breakpoints in .feature and .cs files, stepping, call stack, locals and watch.
const debug = new Debugger();
// Never leave a test host waiting for a debugger when the studio exits or reloads.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, () => { void debug.stop().finally(() => process.exit(0)); });
process.once('exit', () => { void debug.stop(); });
const repoFile = z.string().min(1).max(500).refine((v) => !v.split(/[\\/]/).includes('..'), 'Path cannot contain ..');
app.get('/api/debug', (_req, res) => res.json(debug.state));
// HTTP Client (Rider's .http files): sends one request from the editor and returns the response (body up to 1 MB).
app.post('/api/http/send', async (req, res) => {
  const b = z.object({ method: z.string().regex(/^[A-Z]{3,7}$/), url: z.string().url().max(8000).refine((u) => /^https?:\/\//i.test(u), 'Only http:// and https:// URLs.'), headers: z.record(z.string().max(200), z.string().max(8000)).default({}), body: z.string().max(5_000_000).optional() }).parse(req.body);
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try {
    const r = await fetch(b.url, { method: b.method, headers: b.headers, body: ['GET', 'HEAD'].includes(b.method) || !b.body ? undefined : b.body, signal: ctl.signal, redirect: 'follow' });
    const text = await r.text();
    res.json({ status: r.status, statusText: r.statusText, ms: Date.now() - started, headers: Object.fromEntries(r.headers.entries()), body: text.slice(0, 1_000_000), truncated: text.length > 1_000_000 });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    res.json({ error: ctl.signal.aborted ? 'No response within 60 s.' : `${err.message}${err.cause?.message ? `: ${err.cause.message}` : ''}`, ms: Date.now() - started });
  } finally { clearTimeout(timer); }
});
// Terminal tool window (Rider, Alt+F12): shell sessions in the repository folder; output streams as server-sent events.
app.post('/api/terminal/start', async (_req, res) => { res.json(startTerminal(config.repositoryRoot)); });
const termId = z.object({ id: z.string().uuid() });
const termOf = (id: string) => { const t = terminal(id); if (!t) throw Object.assign(new Error('That terminal has ended. Open a new one.'), { status: 404 }); return t; };
app.post('/api/terminal/input', (req, res) => { const b = termId.extend({ line: z.string().max(20_000) }).parse(req.body); termOf(b.id).run(b.line); res.json({ ok: true }); });
app.post('/api/terminal/interrupt', (req, res) => { termOf(termId.parse(req.body).id).interrupt(); res.json({ ok: true }); });
app.post('/api/terminal/stop', (req, res) => { stopTerminal(termId.parse(req.body).id); res.json({ ok: true }); });
app.get('/api/terminal/events', (req, res) => {
  const t = termOf(termId.parse(req.query).id);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (e: TerminalEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  for (const e of t.backlog) send(e);
  t.on('event', send);
  const ping = setInterval(() => res.write('event: ping\ndata: 1\n\n'), 10_000);
  req.on('close', () => { clearInterval(ping); t.off('event', send); });
});
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
  const spec = z.object({ line: z.number().int().min(1), condition: z.string().max(500).optional(), hitCondition: z.string().max(40).optional(), logMessage: z.string().max(1000).optional(), enabled: z.boolean().optional() });
  // `lines` is the plain form (older clients); `breakpoints` carries conditions, hit counts, log messages, enabled.
  const { file, lines, breakpoints } = z.object({ file: repoFile, lines: z.array(z.number().int().min(1)).max(500).optional(), breakpoints: z.array(spec).max(500).optional() }).parse(req.body);
  await confined(config.repositoryRoot, file);
  res.json(await debug.setBreakpoints(config.repositoryRoot, file.replaceAll('\\', '/'), breakpoints ?? (lines ?? []).map((line) => ({ line }))));
});
app.post('/api/debug/start', async (req, res) => {
  await afterRestore();
  const body = z.object({ file: repoFile.optional(), scenario: z.string().max(500).optional(), project: repoFile.optional(), filter: z.string().max(500).optional() }).parse(req.body);
  const root = config.repositoryRoot;
  if (body.file && !body.file.endsWith('.feature')) throw new Error('Choose a .feature file to debug.');
  const project = body.project ?? (body.file ? await owningProject(root, body.file) : undefined) ?? (config.targetProject.endsWith('.csproj') ? config.targetProject : undefined);
  if (!project?.endsWith('.csproj')) throw new Error('No test project (.csproj) was found for this feature. Set the target project in Workspace settings.');
  // netcoredbg debugs .NET (Core) only: a classic .NET Framework project needs Visual Studio's debugger.
  if ((await projectInfo(root, project)).legacy) throw new Error(`${project} is a classic .NET Framework project. The studio's debugger (netcoredbg) debugs .NET 6+ projects only; debug this one in Visual Studio, or migrate it to an SDK-style project targeting .NET 8 or later.`);
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
app.get('/api/debug/exceptions', (_req, res) => res.json({ breakOn: debug.breakOn }));
app.post('/api/debug/exceptions', async (req, res) => {
  const { breakOn } = z.object({ breakOn: z.enum(['unhandled', 'all', 'never']) }).parse(req.body);
  await debug.setBreakOn(breakOn);
  res.json({ breakOn });
});
app.post('/api/debug/run-to', async (req, res) => {
  const { file, line } = z.object({ file: repoFile, line: z.number().int().min(1) }).parse(req.body);
  await debug.runToCursor(file.replaceAll('\\', '/'), line);
  res.json(debug.state);
});
app.post('/api/debug/immediate', async (req, res) => {
  const { expression, frameId } = z.object({ expression: z.string().min(1).max(2000), frameId: z.number().int().optional() }).parse(req.body);
  res.json(await debug.immediate(expression, frameId));
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
  // A remembered project from another workspace falls back to the solution.
  if (project && await confined(root, project).then(() => true, () => false)) return project;
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
  await afterRestore();
  const { action, project, configuration } = z.object({ action: z.enum(['build', 'rebuild', 'clean']).default('build'), project: z.string().max(400).optional(), configuration: z.string().regex(/^[\w .|-]{1,60}$/).default('Debug') }).parse(req.body);
  const target = await buildTarget(project);
  const cfg = configuration.split('|')[0].trim();
  // Classic .NET Framework projects build with Visual Studio's MSBuild when it is installed (as in Visual Studio).
  const classic = await classicProjects(config.repositoryRoot, target);
  const vs = classic.length ? await findVisualStudio() : undefined;
  res.json(builder.start({ root: config.repositoryRoot, target, action, configuration: cfg, ...(vs ? { tool: { exe: vs.msbuild, args: msbuildArgs(target, action, cfg) } } : classic.length ? { help: CLASSIC_HELP } : {}) }));
});
app.post('/api/build/cancel', (_req, res) => res.json(builder.cancel()));
// Test Explorer: C# test methods (Roslyn) and feature scenarios, run with `dotnet test` (results from TRX).
/** Escapes a value for a vstest --filter expression. */
const vsEscape = (v: string) => v.replace(/[\\()&|=!~]/g, (c) => '\\' + c);
type DiscoveredTest = { id: string; kind: 'test' | 'scenario'; project: string; projectFile?: string; className: string; method: string; name: string; file: string; line: number; filter: string; feature?: string; cases?: number };
app.get('/api/tests', async (_req, res) => {
  const root = config.repositoryRoot;
  const i = await ensure();
  const tests: DiscoveredTest[] = [];
  let warning: string | undefined;
  try {
    const found = await lang.request<{ project: string; projectFile?: string; className: string; method: string; file: string; line: number; framework: string; cases: number }[]>(root, { op: 'tests' }, 120_000);
    for (const t of found) tests.push({ id: `cs:${t.className}.${t.method}`, kind: 'test', project: t.project, projectFile: t.projectFile, className: t.className, method: t.method, name: t.method, file: t.file, line: t.line, cases: t.cases,
      // Parameterized cases are "Method(args)": match the prefix. No "(" in the filter: NUnit's adapter parses filters
      // itself and rejects it even escaped (a sibling "MethodMore" would also run; harmless).
      filter: t.cases ? `FullyQualifiedName~${vsEscape(`${t.className}.${t.method}`)}` : `FullyQualifiedName=${vsEscape(`${t.className}.${t.method}`)}` });
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
tests.tracesDir = tracesDir;
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
  await afterRestore();
  const { filters, ids, configuration, coverage } = z.object({ filters: z.array(z.string().max(600)).max(2000).default([]), ids: z.array(z.string().max(600)).max(2000).default([]), configuration: z.string().regex(/^[\w .|-]{1,60}$/).default('Debug'), coverage: z.boolean().optional() }).parse(req.body);
  // One filter per test, or-ed; a very long filter (huge selections) runs everything instead.
  const joined = [...new Set(filters)].join('|');
  const filter = filters.length && joined.length < 8000 ? joined : undefined;
  const target = await buildTarget();
  const cfg = configuration.split('|')[0].trim();
  // Classic .NET Framework projects: Visual Studio's MSBuild + vstest.console (Test Explorer's way), or an explanation.
  const classic = await classicProjects(config.repositoryRoot, target);
  let classicRun;
  if (classic.length) {
    const vs = await findVisualStudio();
    if (!vs?.vstest) throw new Error(`${CLASSIC_HELP}\nRunning their tests also needs Visual Studio's vstest.console.exe.`);
    const packagesDir = path.join(config.repositoryRoot, path.dirname(classic[0]), 'packages');
    classicRun = { msbuild: vs.msbuild, buildArgs: msbuildArgs(target, 'build', cfg), vstest: vs.vstest, dll: await classicOutput(config.repositoryRoot, classic[0], cfg), ...(existsSync(packagesDir) ? { adapters: packagesDir } : {}) };
  }
  res.json(await tests.run({ root: config.repositoryRoot, target, filter, requested: filters.length ? ids : ['all'], configuration: cfg, coverage, classic: classicRun }));
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
