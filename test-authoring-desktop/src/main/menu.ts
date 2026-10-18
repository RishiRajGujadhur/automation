import { app, clipboard, dialog, globalShortcut, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ctx } from './context';
import { IPC, type MenuCommand } from '../shared/bridge';
import { openRepository, pickAndOpenRepository, pickAndOpenSolution, recentRepositories } from './workspace';
import { apiCall } from './server';
import { dataRoot, logFile, resourcesRoot } from './paths';
import { isPinned, read, removeRecent, togglePin, write, type Editor, type Shape } from './store';
import { autoRescanEnabled, setAutoRescan } from './watcher';
import { browsersMenu } from './browsers';
import { editors, tools } from './tools';
import { notify } from './notify';
import { currentPageLink } from './protocol';
import { checkHealth, copyDiagnostics, crashFolder, reportIssue, systemInfo } from './diagnostics';
import { clearWebData, exportSettings, importSettings, resetDesktopSettings, restart } from './settingsIO';
import { toggleWindow } from './tray';
import { riderMenus } from './riderMenu';

const send = (c: MenuCommand, arg?: unknown) => ctx.win?.webContents.send(IPC.menu, c, arg);
/** Pages are deep links (#/page), so navigation needs no web-app changes. */
export const go = (hash: string) => ctx.win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => {});
const pref = (patch: Record<string, string>) => send('set-pref', patch);
const failOpen = (e: unknown) => dialog.showErrorBox('Could not open the repository', (e as Error).message);
const openAndRebuild = (f: string) => openRepository(f).then(buildMenu).catch(failOpen);

const themes = [['studio', 'Studio Dark'], ['midnight', 'Midnight'], ['nord', 'Nord'], ['light', 'Light'], ['matrix', 'Matrix']];
const accentIds = ['violet', 'indigo', 'blue', 'cyan', 'teal', 'green', 'amber', 'orange', 'rose', 'pink', 'slate'];
const designTools = [['examples', 'Examples Generator'], ['logic', 'Logic & Techniques'], ['library', 'Step Library'], ['suite', 'Suite Optimizer'], ['flow', 'Flow Generator'], ['impact', 'Impact & Risk'], ['quality', 'Duplicates & Smells'], ['results', 'Results & Flakiness'], ['plans', 'Plans & Filters'], ['docs', 'Living Docs'], ['lab', 'Similarity Lab']];
// Chromium zoom level n = 1.2^n scale.
const zoomLevels: [string, number][] = [['90 %', Math.log(0.9) / Math.log(1.2)], ['100 %', 0], ['110 %', Math.log(1.1) / Math.log(1.2)], ['125 %', Math.log(1.25) / Math.log(1.2)], ['150 %', Math.log(1.5) / Math.log(1.2)]];

/** K1: optional global show/hide shortcut. */
export function applyGlobalShortcut() {
  globalShortcut.unregister('CommandOrControl+Alt+T');
  if (read().globalShortcut) globalShortcut.register('CommandOrControl+Alt+T', toggleWindow);
}

/** W6: zoom percentage in the studio's own notification area. */
export function zoomToast() {
  const pct = Math.round(Math.pow(1.2, ctx.win?.webContents.getZoomLevel() ?? 0) * 100);
  ctx.win?.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('tas:desktop-notice', { detail: ${JSON.stringify(`Zoom ${pct}%`)} }))`).catch(() => {});
}

function recentMenu(): MenuItemConstructorOptions[] {
  const pinned = (read().pinned ?? []).filter((f) => fs.existsSync(f));
  const recent = recentRepositories().filter((f) => !pinned.some((p) => p.toLowerCase() === f.toLowerCase()));
  const entry = (f: string): MenuItemConstructorOptions => ({ label: path.basename(f) || f, sublabel: f, toolTip: f, click: () => openAndRebuild(f) });
  const items: MenuItemConstructorOptions[] = [];
  if (pinned.length) items.push({ label: 'Pinned', enabled: false }, ...pinned.map(entry), { type: 'separator' });
  items.push(...(recent.length ? recent.map(entry) : [{ label: 'No recent repositories', enabled: false }]));
  if (recent.length) items.push({ type: 'separator' }, { label: 'Remove from Recent', submenu: recent.map((f) => ({ label: f, click: () => { removeRecent(f); buildMenu(); } })) });
  items.push({
    label: 'Clear Recent…', enabled: recent.length > 0, click: async () => {
      if (!ctx.win) return;
      const r = await dialog.showMessageBox(ctx.win, { type: 'question', buttons: ['Clear', 'Cancel'], cancelId: 1, message: 'Clear recent repositories?', detail: 'Pinned repositories are kept.' });
      if (r.response === 0) { write({ recent: [] }); app.clearRecentDocuments(); buildMenu(); }
    },
  });
  return items;
}

export function buildMenu() {
  const isMac = process.platform === 'darwin';
  const s = read();
  const toggle = (label: string, key: keyof Shape, after?: (v: boolean) => void, def = false): MenuItemConstructorOptions => ({ label, type: 'checkbox', checked: (s[key] as boolean | undefined) ?? def, click: (i) => { write({ [key]: i.checked } as Partial<Shape>); after?.(i.checked); buildMenu(); } });
  const rider = riderMenus((id) => send('rider', id));
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: '&File',
      submenu: [
        { label: 'Open Project/Solution…', accelerator: 'CmdOrCtrl+Shift+O', click: () => pickAndOpenSolution().then(buildMenu) },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+Alt+O', click: () => pickAndOpenRepository().then(buildMenu) },
        { label: 'Open Recent', submenu: recentMenu() },
        { label: 'Reopen Last Closed Repository', accelerator: 'CmdOrCtrl+Shift+T', enabled: !!s.lastClosed && fs.existsSync(s.lastClosed), click: () => { if (s.lastClosed) openAndRebuild(s.lastClosed); } },
        { label: 'Open Sample Repository', click: () => openAndRebuild(path.join(resourcesRoot(), 'fixtures')) },
        { label: isPinned(ctx.repository) ? 'Unpin Repository' : 'Pin Repository', enabled: !!ctx.repository, click: () => { if (ctx.repository) togglePin(ctx.repository); buildMenu(); } },
        { type: 'separator' },
        { label: 'New Feature', accelerator: 'CmdOrCtrl+N', click: () => send('new-feature') },
        { label: 'Start a Recording', accelerator: 'CmdOrCtrl+Shift+R', click: () => send('record') },
        { label: 'Run Tests…', click: () => send('run-tests') },
        { type: 'separator' },
        // Handled by the page (the focused editor saves itself), so the keys are shown but not registered here.
        { label: 'Save', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: () => send('save') },
        { label: 'Save All', accelerator: 'CmdOrCtrl+Alt+S', registerAccelerator: false, click: () => send('save-all') },
        { label: 'Close Editor', accelerator: 'CmdOrCtrl+W', registerAccelerator: false, click: () => send('close-editor') },
        { label: 'Close All Editors', click: () => send('close-all-editors') },
        { label: 'Rescan Repository', accelerator: 'CmdOrCtrl+Alt+R', click: () => rescan() },
        { type: 'separator' },
        {
          label: 'Repository',
          submenu: [
            { label: 'Open in File Explorer', click: tools.explorer },
            { label: 'Open Terminal Here', click: tools.terminal },
            { label: 'Open in VS Code', click: tools.vscode },
            { label: 'Copy Repository Path', click: tools.copyRepository },
            { type: 'separator' },
            { label: 'Open Features Folder', click: tools.features },
            { label: 'Open Dictionaries Folder', click: tools.dictionaries },
          ],
        },
        { label: 'Playwright Traces', submenu: [{ label: 'Open Latest Trace in Viewer', click: tools.latestTrace }, { label: 'Open Traces Folder', click: tools.traces }] },
        { type: 'separator' },
        { label: 'Workspace Settings…', click: () => send('workspace-settings') },
        { label: isMac ? 'Settings…' : 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => send('preferences') },
        {
          label: 'Desktop Settings',
          submenu: [
            { label: 'Open Files With', submenu: editors.map((e) => ({ label: e.label, type: 'radio' as const, checked: (s.editor ?? 'system') === e.id, click: () => { write({ editor: e.id as Editor }); buildMenu(); } })) },
            { type: 'separator' },
            { label: 'Launch at Login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
            toggle('Minimize to Tray', 'minimizeToTray'),
            toggle('Close to Tray', 'closeToTray'),
            toggle('Show/Hide Shortcut (Ctrl+Alt+T)', 'globalShortcut', applyGlobalShortcut),
            toggle('Do Not Disturb', 'doNotDisturb'),
            toggle('Spellcheck', 'spellcheck', (v) => ctx.win?.webContents.session.setSpellCheckerEnabled(v), true),
            toggle('Hardware Acceleration (after restart)', 'hardwareAcceleration', undefined, true),
            { type: 'separator' },
            { label: 'Export Settings…', click: exportSettings },
            { label: 'Import Settings…', click: importSettings },
            { label: 'Open Studio Settings File', click: tools.settingsFile },
            { label: 'Open Workspace File', click: tools.workspaceFile },
            { type: 'separator' },
            { label: 'Clear Web Storage and Cache…', click: clearWebData },
            { label: 'Reset Desktop Settings…', click: resetDesktopSettings },
          ],
        },
        { type: 'separator' },
        { label: 'Restart', click: restart },
        isMac ? { role: 'close' } : { label: 'Exit', accelerator: 'Alt+F4', click: () => { ctx.quitting = true; app.quit(); } },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { label: 'Paste as Plain Text', click: async () => { ctx.win?.webContents.insertText(await clipboard.readText()); } },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Go to All…', accelerator: 'CmdOrCtrl+T', registerAccelerator: false, click: () => send('go-to-all') },
        { label: 'Find in Files', accelerator: 'CmdOrCtrl+Shift+F', registerAccelerator: false, click: () => send('find-in-files') },
        { label: 'Replace in Files', accelerator: 'CmdOrCtrl+Shift+H', registerAccelerator: false, click: () => send('replace-in-files') },
        { type: 'separator' },
        { label: 'Copy Link to This Page', accelerator: 'CmdOrCtrl+L', click: () => { const l = currentPageLink(); clipboard.writeText(l); notify('Link copied', l, { always: true }); } },
        ...rider.edit,
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('palette') },
        { label: 'Toggle Basic / Advanced Mode', click: () => send('toggle-mode') },
        { label: 'Toggle Feature Explorer', click: () => send('toggle-explorer') },
        { label: 'Focus Mode', click: () => send('focus-mode') },
        { type: 'separator' },
        { label: 'Theme', submenu: themes.map(([id, label]) => ({ label, click: () => pref({ theme: id }) })) },
        { label: 'Accent', submenu: accentIds.map((id) => ({ label: id[0].toUpperCase() + id.slice(1), click: () => pref({ accent: id }) })) },
        { label: 'Layout', submenu: [{ label: 'VS Code', click: () => pref({ layout: 'vscode' }) }, { label: 'Classic (tabs)', click: () => pref({ layout: 'classic' }) }] },
        { label: 'Algorithm Preset', submenu: [['essentials', 'Essentials'], ['bdd-authoring', 'BDD authoring'], ['combinatorial', 'Combinatorial & logic'], ['model-based', 'Model-based'], ['regression', 'Regression & CI'], ['minimal', 'Minimal'], ['everything', 'Everything'], ['custom', 'Custom…']].map(([id, label]) => ({ label, click: () => { pref({ algorithmPreset: id }); if (id === 'custom') send('preferences'); } })) },
        { label: 'Density', submenu: [{ label: 'Comfortable', click: () => pref({ density: 'comfortable' }) }, { label: 'Compact', click: () => pref({ density: 'compact' }) }] },
        { label: 'Text Size', submenu: [{ label: 'Small (A−)', click: () => pref({ textSize: 'small' }) }, { label: 'Medium (A)', click: () => pref({ textSize: 'medium' }) }, { label: 'Large (A+)', click: () => pref({ textSize: 'large' }) }] },
        { label: 'Reduce Motion', click: () => ctx.win?.webContents.executeJavaScript('document.documentElement.dataset.motion').then((m) => pref({ motion: m === 'reduce' ? 'system' : 'reduce' })) },
        { label: 'High Contrast', click: () => ctx.win?.webContents.executeJavaScript('document.documentElement.dataset.contrast').then((c) => pref({ contrast: c === 'high' ? 'normal' : 'high' })) },
        { type: 'separator' },
        {
          label: 'Zoom',
          submenu: [
            ...zoomLevels.map(([label, level]) => ({ label, click: () => { ctx.win?.webContents.setZoomLevel(level); write({ zoom: level }); zoomToast(); } })),
            { type: 'separator' as const }, { role: 'resetZoom' as const }, { role: 'zoomIn' as const }, { role: 'zoomIn' as const, accelerator: 'CmdOrCtrl+=', visible: false }, { role: 'zoomOut' as const },
          ],
        },
        // F11 is Step Into (Visual Studio); full screen uses Visual Studio's Shift+Alt+Enter.
        { role: 'togglefullscreen', accelerator: 'Shift+Alt+Enter' },
        toggle('Always on Top', 'alwaysOnTop', (v) => ctx.win?.setAlwaysOnTop(v)),
        toggle('Auto-hide Menu Bar', 'autoHideMenu', (v) => { ctx.win?.setAutoHideMenuBar(v); ctx.win?.setMenuBarVisibility(!v); }),
        { label: 'Auto-rescan When Files Change', type: 'checkbox', checked: autoRescanEnabled(), click: (item) => setAutoRescan(item.checked) },
        { type: 'separator' },
        ...rider.view,
        { type: 'separator' },
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      ],
    },
    ...rider.menus,
    {
      label: 'Gi&t',
      submenu: [
        { label: 'Git Changes', click: () => send('git-changes') },
      ],
    },
    {
      label: '&Build',
      submenu: [
        // Handled by the page (it owns the build state), so the keys are shown but not registered here.
        { label: 'Build Solution', accelerator: 'CmdOrCtrl+Shift+B', registerAccelerator: false, click: () => send('build') },
        { label: 'Rebuild Solution', click: () => send('rebuild') },
        { label: 'Clean Solution', click: () => send('clean') },
        { type: 'separator' },
        { label: 'Manage NuGet Packages…', click: () => send('nuget') },
        { type: 'separator' },
        { label: 'Cancel', accelerator: 'CmdOrCtrl+Pause', registerAccelerator: false, click: () => send('cancel-build') },
        { type: 'separator' },
        { label: 'Error List and Output', click: () => send('build-windows') },
        { label: 'Output', accelerator: 'CmdOrCtrl+Alt+O', registerAccelerator: false, click: () => send('output') },
        { label: 'TODO', accelerator: 'Alt+6', registerAccelerator: false, click: () => send('todo') },
      ],
    },
    {
      label: '&Test',
      submenu: [
        { label: 'Run All Tests', click: () => send('run-all-tests') },
        { label: 'Find Unused Step Definitions', click: () => send('unused-steps') },
        { type: 'separator' },
        { label: 'Spy (find elements and selectors)…', click: () => send('spy') },
        { type: 'separator' },
        { label: 'Test Explorer', click: () => send('test-explorer') },
      ],
    },
    {
      // Visual Studio's Debug menu. The page handles the keys itself (the editor needs F9 at the cursor), so the
      // accelerators are shown but not registered here.
      label: '&Debug',
      submenu: [
        ...([
          ['Start Debugging / Continue', 'F5', 'start'],
          ['Stop Debugging', 'Shift+F5', 'stop'],
          ['Restart', 'CmdOrCtrl+Shift+F5', 'restart'],
          ['Break All', 'CmdOrCtrl+Alt+Pause', 'pause'],
          null,
          ['Step Into', 'F11', 'stepIn'],
          ['Step Over', 'F10', 'next'],
          ['Step Out', 'Shift+F11', 'stepOut'],
          null,
          ['Toggle Breakpoint', 'F9', 'toggleBreakpoint'],
          ['Delete All Breakpoints', 'CmdOrCtrl+Shift+F9', 'deleteAllBreakpoints'],
          null,
          ['Windows (Locals, Watch, Call Stack)', undefined, 'windows'],
        ] as const).map((row): MenuItemConstructorOptions => (row ? { label: row[0], accelerator: row[1], registerAccelerator: false, click: () => send('debug', row[2]) } : { type: 'separator' })),
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
        { label: 'Test Design Tools', submenu: designTools.map(([id, label]) => ({ label, click: () => send('design-tool', id) })) },
        { label: 'Continue Test Generator Draft', click: () => send('continue-draft') },
        { type: 'separator' },
        { label: 'Playwright Recorder', click: () => go('#/features/recorder') },
        { label: 'Step Catalog', click: () => go('#/step-catalog') },
        { label: 'Backgrounds', click: () => go('#/backgrounds') },
        { label: 'Selectors', click: () => go('#/selectors') },
        { label: 'Project Explorer', click: () => go('#/project-explorer') },
        { label: 'Config', click: () => go('#/config') },
        { type: 'separator' },
        { label: 'Back', accelerator: 'Alt+Left', click: navigateBack },
        { label: 'Previous Page', accelerator: 'CmdOrCtrl+Alt+Left', click: navigateBack },
        { label: 'Forward', accelerator: 'Alt+Right', click: navigateForward },
      ],
    },
    {
      label: '&Window',
      submenu: [
        { role: 'minimize' },
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => ctx.newWindow?.() },
        { label: 'Center Window', click: () => ctx.win?.center() },
        { label: 'Reset Window Size', click: () => { const w = ctx.win; if (!w) return; if (w.isMaximized()) w.unmaximize(); w.setSize(1440, 920); w.center(); } },
        { role: 'zoom', visible: isMac },
        ...(isMac ? [{ role: 'front' as const }] : [{ role: 'close' as const, accelerator: 'CmdOrCtrl+Shift+W' }]),
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'F1', click: () => send('shortcuts') },
        { label: 'Desktop Shortcuts', click: desktopShortcuts },
        { label: 'Guided Tour', click: () => send('tour') },
        ...rider.help,
        { label: 'User Guide', click: tools.readme },
        { type: 'separator' },
        { label: 'Index Diagnostics', click: () => send('diagnostics') },
        { label: 'Check API Health', click: checkHealth },
        { label: 'Playwright Browsers…', click: browsersMenu },
        { label: 'System Information', click: systemInfo },
        { label: 'Copy Diagnostics', click: () => { copyDiagnostics(); notify('Diagnostics copied', 'Paste them into an issue or message.', { always: true }); } },
        { type: 'separator' },
        { label: 'Open Data Folder', click: () => shell.openPath(dataRoot()) },
        { label: 'Open Log File', click: () => shell.openPath(logFile()) },
        { label: 'Open Crash Reports Folder', click: crashFolder },
        { label: 'Report an Issue…', click: reportIssue },
        { type: 'separator' },
        { label: 'About TestAuthoring Studio', click: about },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** File → Rescan; R12 reports counts (and what changed) in a background notification. */
export async function rescan() {
  ctx.win?.setProgressBar(2);
  try {
    const before = await apiCall<{ index: { stats: Record<string, number> } }>(ctx.origin, '/workspace').catch(() => undefined);
    const r = await apiCall<{ stats?: Record<string, number> }>(ctx.origin, '/scan', {});
    ctx.win?.webContents.reload();
    const st = r.stats;
    if (st) notify('Repository rescanned', `${st.features} features · ${st.scenarios} scenarios · ${st.steps} step bindings${before ? diffText(before.index.stats, st) : ''}`);
  } catch (e) {
    dialog.showErrorBox('Rescan failed', (e as Error).message);
  } finally {
    ctx.win?.setProgressBar(-1);
  }
}
export const diffText = (a: Record<string, number>, b: Record<string, number>) => {
  const d = ['features', 'scenarios', 'steps'].map((k) => [k, (b[k] ?? 0) - (a[k] ?? 0)] as const).filter(([, n]) => n);
  return d.length ? ` (${d.map(([k, n]) => `${n > 0 ? '+' : ''}${n} ${k}`).join(', ')})` : '';
};
export function navigateBack() { const h = ctx.win?.webContents.navigationHistory; if (h?.canGoBack()) h.goBack(); }
export function navigateForward() { const h = ctx.win?.webContents.navigationHistory; if (h?.canGoForward()) h.goForward(); }

/** K6 */
function desktopShortcuts() {
  const rows = [
    ['Ctrl+Shift+O', 'Open repository'], ['Ctrl+Shift+T', 'Reopen last closed repository'], ['Ctrl+N', 'New feature'], ['Ctrl+Shift+R', 'Start a recording'],
    ['F5 / F10 / F11', 'Debug: continue / step over / step into'], ['Ctrl+Alt+R', 'Rescan repository'], ['Ctrl+,', 'Preferences'], ['Ctrl+Shift+P', 'Command palette'], ['Ctrl+L', 'Copy link to this page'], ['Ctrl+Shift+V', 'Paste as plain text'],
    ['Alt+1…5', 'Pages'], ['Alt+← / Alt+→', 'Back / forward (also mouse buttons)'], ['Ctrl+Shift+N', 'New window'], ['Ctrl + / − / 0', 'Zoom'], ['Shift+Alt+Enter', 'Full screen (Esc leaves)'],
    ['Ctrl+Alt+T', 'Show/hide the app (when enabled)'], ['F1', 'Studio shortcuts'],
  ];
  if (ctx.win) dialog.showMessageBox(ctx.win, { type: 'info', title: 'Desktop shortcuts', message: 'Desktop shortcuts', detail: rows.map(([k, d]) => `${k.padEnd(18)} ${d}`).join('\n') });
}

/** Q8: versions and data location. */
function about() {
  const v = process.versions;
  const detail = [`Version ${app.getVersion()}`, `Electron ${v.electron}`, `Chromium ${v.chrome}`, `Node.js ${v.node}`, `V8 ${v.v8}`, '', `Repository: ${ctx.repository ?? '–'}`, `Data: ${dataRoot()}`, `API: ${ctx.origin}`].join('\n');
  if (ctx.win) dialog.showMessageBox(ctx.win, { type: 'info', title: 'About', message: 'TestAuthoring Studio', detail, buttons: ['OK'] });
}
