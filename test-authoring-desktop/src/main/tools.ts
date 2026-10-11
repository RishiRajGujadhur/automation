import { clipboard, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ctx } from './context';
import { dataRoot, resourcesRoot } from './paths';
import { read, type Editor } from './store';
import { notify } from './notify';

const fail = (title: string, e: unknown) => dialog.showErrorBox(title, (e as Error).message ?? String(e));
/** Starts a detached program; resolves false if it could not be started. */
function launch(cmd: string, args: string[], cwd?: string) {
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(cmd, args, { cwd, detached: true, stdio: 'ignore', shell: process.platform === 'win32', windowsHide: false });
      child.once('error', () => resolve(false));
      child.once('spawn', () => { child.unref(); resolve(true); });
    } catch { resolve(false); }
  });
}
const quote = (s: string) => (process.platform === 'win32' ? `"${s}"` : s);

export const editors: { id: Editor; label: string }[] = [
  { id: 'system', label: 'System default' },
  { id: 'vscode', label: 'Visual Studio Code' },
  { id: 'visualstudio', label: 'Visual Studio' },
  { id: 'rider', label: 'JetBrains Rider' },
  { id: 'notepadpp', label: 'Notepad++' },
];

/** F1 + F2: open a file in the preferred editor, at the line when the editor supports it. */
export async function openInPreferredEditor(abs: string, line?: number) {
  const ed = read().editor ?? 'system';
  const l = line && line > 0 ? line : undefined;
  const attempts: Record<Exclude<Editor, 'system'>, [string, string[]]> = {
    vscode: ['code', l ? ['-g', quote(`${abs}:${l}`)] : [quote(abs)]],
    visualstudio: ['devenv', ['/Edit', quote(abs)]],
    rider: ['rider', l ? ['--line', String(l), quote(abs)] : [quote(abs)]],
    notepadpp: ['notepad++', l ? [`-n${l}`, quote(abs)] : [quote(abs)]],
  };
  if (ed !== 'system') {
    const [cmd, args] = attempts[ed];
    if (await launch(cmd, args)) return abs;
  }
  const err = await shell.openPath(abs);
  if (err) throw new Error(err);
  return abs;
}

const repo = () => ctx.repository;
function needRepo() { const r = repo(); if (!r) throw new Error('No repository is open.'); return r; }
/** First folder with this name within three levels of the repository root. */
function findFolder(name: string) {
  const root = needRepo();
  const queue: [string, number][] = [[root, 0]];
  while (queue.length) {
    const [dir, depth] = queue.shift()!;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || /^(\.|bin$|obj$|node_modules$)/.test(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.name.toLowerCase() === name.toLowerCase()) return p;
      if (depth < 2) queue.push([p, depth + 1]);
    }
  }
  return undefined;
}

export const tools = {
  /** R8 */ explorer: () => { try { shell.openPath(needRepo()); } catch (e) { fail('Open in File Explorer', e); } },
  /** R9 */ terminal: async () => {
    try {
      const r = needRepo();
      const ok = process.platform === 'win32'
        ? (await launch('wt', ['-d', quote(r)])) || (await launch('cmd', ['/c', 'start', '""', '/D', quote(r), 'cmd']))
        : process.platform === 'darwin' ? await launch('open', ['-a', 'Terminal', r]) : await launch('x-terminal-emulator', [], r);
      if (!ok) throw new Error('No terminal could be started.');
    } catch (e) { fail('Open Terminal', e); }
  },
  /** R10 */ vscode: async () => { try { if (!(await launch('code', [quote(needRepo())]))) throw new Error('VS Code was not found. Install it and enable "code" on PATH.'); } catch (e) { fail('Open in VS Code', e); } },
  /** R11 */ copyRepository: () => { const r = repo(); if (r) { clipboard.writeText(r); notify('Repository path copied', r, { always: true }); } },
  /** F4 */ features: () => { try { shell.openPath(findFolder('Features') ?? needRepo()); } catch (e) { fail('Open Features folder', e); } },
  /** F5 */ dictionaries: () => { try { const d = findFolder('Dictionaries'); if (!d) throw new Error('No Dictionaries folder in this repository.'); shell.openPath(d); } catch (e) { fail('Open Dictionaries folder', e); } },
  /** F6 */ traces: () => { const d = path.join(dataRoot(), '.local/traces'); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); },
  /** F7 */ latestTrace: async () => {
    const d = path.join(dataRoot(), '.local/traces');
    const zips = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.zip')).map((f) => path.join(d, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs) : [];
    if (!zips.length) { dialog.showMessageBox({ type: 'info', message: 'No traces yet', detail: 'Enable Settings → Playwright tracing, then record and stop a workflow.' }); return; }
    const cli = path.join(resourcesRoot(), 'node_modules/playwright/cli.js');
    const child = spawn(process.execPath, [cli, 'show-trace', zips[0]], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, stdio: 'ignore' });
    child.on('error', (e) => fail('Open Trace Viewer', e));
    child.unref();
  },
  /** F8 */ settingsFile: () => openOrCreate(path.join(dataRoot(), '.local/settings.json'), '{}\n'),
  /** F9 */ workspaceFile: () => openOrCreate(path.join(dataRoot(), '.local/workspace.json'), '{}\n'),
  /** F10 */ readme: () => shell.openExternal('https://github.com/RishiRajGujadhur/automation/tree/main/test-authoring-studio#readme'),
};
function openOrCreate(file: string, initial: string) {
  if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, initial); }
  shell.openPath(file);
}
