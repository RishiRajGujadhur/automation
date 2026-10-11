import { app } from 'electron';
import { ctx } from './context';
import { IPC, type MenuCommand } from '../shared/bridge';
import { pickAndOpenRepository } from './workspace';

/** `--command=<name>` arguments the jump list (and the command line) may pass. */
const commands: Record<string, MenuCommand | 'open-repository' | 'test-design'> = { 'new-feature': 'new-feature', record: 'record', 'open-repository': 'open-repository', palette: 'palette', 'test-design': 'test-design' };
export const commandArg = (argv: string[]) => argv.map((a) => /^--command=([\w-]+)$/.exec(a)?.[1]).find((c) => c && commands[c]);

export function runCommand(name: string) {
  const c = commands[name];
  if (!c) return;
  if (c === 'open-repository') pickAndOpenRepository();
  else if (c === 'test-design') ctx.win?.webContents.executeJavaScript("location.hash = '#/test-design'").catch(() => {});
  else ctx.win?.webContents.send(IPC.menu, c);
}

/** D19: Windows taskbar jump list tasks. In development the app folder must be passed to electron.exe. */
export function registerTasks() {
  if (process.platform !== 'win32') return;
  const prefix = app.isPackaged ? '' : `"${app.getAppPath()}" `;
  const icon = process.execPath; // jump-list icons must be .exe/.ico
  const task = (command: string, title: string, description: string) => ({ program: process.execPath, arguments: `${prefix}--command=${command}`, iconPath: icon, iconIndex: 0, title, description });
  app.setUserTasks([
    task('new-feature', 'New feature', 'Create a feature file'),
    task('record', 'Start a recording', 'Record a Playwright workflow'),
    task('open-repository', 'Open repository…', 'Choose a repository folder'),
    task('test-design', 'Test Design', 'Combinatorial examples, flows, suite optimization'),
  ]);
}
