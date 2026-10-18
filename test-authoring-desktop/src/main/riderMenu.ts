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
    ['Copy Reference', 'copy-reference', 'CmdOrCtrl+Alt+Shift+C'],
    ['Compare with Clipboard', 'compare-clipboard'],
  ],
  view: [
    null,
    ['Soft-Wrap (Active Editor)', 'soft-wrap'],
    ['Show Whitespaces', 'whitespace'],
    ['Increase Font Size (Ctrl+Mouse Wheel)', 'font-bigger'],
    ['Decrease Font Size', 'font-smaller'],
    ['Reset Font Size', 'font-reset'],
    null,
    ['Structure', 'tool-structure', 'Alt+7'],
    ['Problems', 'tool-problems', 'Alt+Shift+6'],
    ['Terminal', 'tool-terminal', 'CmdOrCtrl+`'],
    ['Shelf (shelved changes)', 'tool-shelf'],
    null,
    ['Distraction-Free Mode', 'zen-mode', 'Alt+Shift+Z'],
    ['Presentation Mode', 'presentation-mode'],
    ['Hide All Tool Windows', 'hide-tools', 'CmdOrCtrl+Shift+F12'],
  ],
  navigate: [
    ['Recent Changes…', 'recent-changes', 'Alt+Shift+C'],
    ['Go to Related Files…', 'related-files', 'CmdOrCtrl+Alt+Home'],
    ['File Structure…', 'file-structure', 'CmdOrCtrl+Alt+F12'],
    ['Highlight Usages in File', 'highlight-usages', 'CmdOrCtrl+Shift+F7'],
    null,
    ['Type Hierarchy', 'type-hierarchy', 'CmdOrCtrl+H'],
    ['Call Hierarchy', 'call-hierarchy', 'CmdOrCtrl+Alt+H'],
  ],
  code: [
    ['Insert Live Template…', 'live-template', 'CmdOrCtrl+J'],
    ['Surround With…', 'surround-with', 'CmdOrCtrl+Alt+J'],
    null,
    ['Check RegExp… (step patterns)', 'check-regexp'],
    null,
    ['Comment with Block Comment', 'block-comment', 'CmdOrCtrl+Shift+/'],
    ['Move Statement Up', 'statement-up', 'CmdOrCtrl+Shift+Alt+Up'],
    ['Move Statement Down', 'statement-down', 'CmdOrCtrl+Shift+Alt+Down'],
  ],
  tools: [
    ['Run Anything… (Ctrl twice)', 'run-anything'],
    null,
    ['Evaluate Expression… (debugger)', 'evaluate-expression', 'Alt+F8'],
    ['Mute Breakpoints', 'mute-breakpoints'],
    null,
    ['Power Save Mode', 'power-save'],
  ],
  help: [
    null,
    ['Key Promoter (shortcut hints)', 'key-promoter'],
    ['Productivity Guide', 'productivity-guide'],
    ['Tip of the Day', 'tip-of-the-day'],
  ],
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
