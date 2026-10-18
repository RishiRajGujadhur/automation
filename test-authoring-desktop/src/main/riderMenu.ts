import type { MenuItemConstructorOptions } from 'electron';

/**
 * JetBrains Rider features in the native menus. Each item sends `rider` with the command id; the page registers the
 * commands (test-authoring-studio/src/rider) and handles their keys, so accelerators are shown, not registered.
 * Keep the ids in sync with RiderHost.tsx.
 */
type Row = [label: string, id: string, accelerator?: string] | null;
const ROWS: Record<'edit' | 'view' | 'navigate' | 'code' | 'tools' | 'help', Row[]> = {
  edit: [
    null,
    ['Extend Selection', 'extend-selection', 'Shift+Alt+Right'],
    ['Shrink Selection', 'shrink-selection', 'Shift+Alt+Left'],
    null,
    ['Toggle Case', 'toggle-case', 'CmdOrCtrl+Shift+U'],
    ['Join Lines', 'join-lines', 'CmdOrCtrl+Shift+J'],
    null,
    ['Add Selection for Next Occurrence', 'next-occurrence', 'Alt+J'],
    ['Unselect Occurrence', 'unselect-occurrence', 'Alt+Shift+J'],
    ['Select All Occurrences', 'all-occurrences', 'CmdOrCtrl+Alt+Shift+J'],
    null,
    ['Start New Line', 'new-line', 'Shift+Enter'],
    ['Start New Line Before Current', 'new-line-before', 'CmdOrCtrl+Alt+Enter'],
    ['Add Carets to Ends of Selected Lines', 'carets-line-ends', 'Alt+Shift+G'],
    null,
    ['Paste from History…', 'paste-history', 'CmdOrCtrl+Shift+V'],
  ],
  view: [],
  navigate: [],
  code: [
    ['Insert Live Template…', 'live-template', 'CmdOrCtrl+J'],
    ['Surround With…', 'surround-with', 'CmdOrCtrl+Alt+J'],
  ],
  tools: [],
  help: [],
};

export function riderMenus(send: (id: string) => void) {
  const items = (rows: Row[]): MenuItemConstructorOptions[] => rows.map((r) => (r ? { label: r[0], ...(r[2] ? { accelerator: r[2], registerAccelerator: false } : {}), click: () => send(r[1]) } : { type: 'separator' }));
  return {
    edit: items(ROWS.edit),
    view: items(ROWS.view),
    help: items(ROWS.help),
    menus: ([['&Navigate', ROWS.navigate], ['&Code', ROWS.code], ['T&ools', ROWS.tools]] as const)
      .filter(([, rows]) => rows.length)
      .map(([label, rows]): MenuItemConstructorOptions => ({ label, submenu: items(rows as Row[]) })),
  };
}
