import { app, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { ctx } from './context';
import { IPC, type MenuCommand } from '../shared/bridge';
import { openRepository, pickAndOpenRepository, recentRepositories } from './workspace';
import { apiCall } from './server';
import { dataRoot, logFile } from './paths';
import { write } from './store';
import { autoRescanEnabled, setAutoRescan } from './watcher';
import { browsersMenu } from './browsers';

const send = (c: MenuCommand) => ctx.win?.webContents.send(IPC.menu, c);
/** Pages are deep links (#/page), so navigation needs no web-app changes. */
const go = (hash: string) => ctx.win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => {});

export function buildMenu() {
  const isMac = process.platform === 'darwin';
  const recent = recentRepositories();
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: '&File',
      submenu: [
        { label: 'Open Repository…', accelerator: 'CmdOrCtrl+Shift+O', click: () => pickAndOpenRepository().then(buildMenu) },
        {
          label: 'Open Recent',
          submenu: recent.length
            ? [...recent.map((f) => ({ label: f, click: () => openRepository(f).then(buildMenu).catch((e) => dialog.showErrorBox('Could not open the repository', (e as Error).message)) })), { type: 'separator' as const }, { label: 'Clear Recent', click: () => { write({ recent: [] }); app.clearRecentDocuments(); buildMenu(); } }]
            : [{ label: 'No recent repositories', enabled: false }],
        },
        { type: 'separator' },
        { label: 'New Feature', accelerator: 'CmdOrCtrl+N', click: () => send('new-feature') },
        { label: 'Start a Recording', accelerator: 'CmdOrCtrl+Shift+R', click: () => send('record') },
        { label: 'Rescan Repository', accelerator: 'F5', click: async () => { ctx.win?.setProgressBar(2); try { await apiCall(ctx.origin, '/scan', {}); ctx.win?.webContents.reload(); } finally { ctx.win?.setProgressBar(-1); } } },
        { type: 'separator' },
        { label: 'Workspace Settings…', click: () => send('workspace-settings') },
        { label: isMac ? 'Settings…' : 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => send('preferences') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', accelerator: 'Alt+F4' },
      ],
    },
    { label: '&Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: '&View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('palette') },
        { label: 'Toggle Basic / Advanced Mode', click: () => send('toggle-mode') },
        { label: 'Toggle Feature Explorer', click: () => send('toggle-explorer') },
        { label: 'Focus Mode', click: () => send('focus-mode') },
        { label: 'Auto-rescan When Files Change', type: 'checkbox', checked: autoRescanEnabled(), click: (item) => setAutoRescan(item.checked) },
        { type: 'separator' },
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomIn', accelerator: 'CmdOrCtrl+=', visible: false }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Go',
      submenu: [
        { label: 'Dashboard', accelerator: 'Alt+1', click: () => go('#/dashboard') },
        { label: 'Test Generator', accelerator: 'Alt+2', click: () => go('#/test-generator') },
        { label: 'Features', accelerator: 'Alt+3', click: () => go('#/features/editor') },
        { label: 'Dictionary Inspector', accelerator: 'Alt+4', click: () => go('#/dictionary-inspector') },
        { label: 'Test Design', accelerator: 'Alt+5', click: () => go('#/test-design') },
        { type: 'separator' },
        { label: 'Playwright Recorder', click: () => go('#/features/recorder') },
        { label: 'Step Catalog', click: () => go('#/step-catalog') },
        { label: 'Backgrounds', click: () => go('#/backgrounds') },
        { label: 'Selectors', click: () => go('#/selectors') },
        { label: 'Project Explorer', click: () => go('#/project-explorer') },
        { label: 'Config', click: () => go('#/config') },
        { type: 'separator' },
        { label: 'Back', accelerator: 'Alt+Left', click: () => ctx.win?.webContents.navigationHistory.goBack() },
        { label: 'Forward', accelerator: 'Alt+Right', click: () => ctx.win?.webContents.navigationHistory.goForward() },
      ],
    },
    { label: '&Window', submenu: [{ role: 'minimize' }, { role: 'zoom', visible: isMac }, ...(isMac ? [{ role: 'front' as const }] : [{ role: 'close' as const }])] },
    {
      label: '&Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'F1', click: () => send('shortcuts') },
        { label: 'Guided Tour', click: () => send('tour') },
        { type: 'separator' },
        { label: 'Playwright Browsers…', click: browsersMenu },
        { label: 'Open Data Folder', click: () => shell.openPath(dataRoot()) },
        { label: 'Open Log File', click: () => shell.openPath(logFile()) },
        { type: 'separator' },
        { label: 'About TestAuthoring Studio', click: about },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Q8: versions and data location. */
function about() {
  const v = process.versions;
  const detail = [`Version ${app.getVersion()}`, `Electron ${v.electron}`, `Chromium ${v.chrome}`, `Node.js ${v.node}`, `V8 ${v.v8}`, '', `Repository: ${ctx.repository ?? '–'}`, `Data: ${dataRoot()}`, `API: ${ctx.origin}`].join('\n');
  if (ctx.win) dialog.showMessageBox(ctx.win, { type: 'info', title: 'About', message: 'TestAuthoring Studio', detail, buttons: ['OK'] });
}
