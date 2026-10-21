import { activeEditor } from '../editor/activeEditor';
import { setViewOptions, viewOptions } from '../editor/viewOptions';
import { runRider } from '../rider/commands';
import { openQuickPick } from './store';

/** The indentation a text uses most: tabs, or the commonest step between indented lines (VS Code's guess). */
export function detectIndentation(text: string): { tabs: boolean; size: number } | undefined {
  let tabs = 0, spaces = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = /^[\t ]*/.exec(line)![0];
    if (m.startsWith('\t')) { tabs++; continue; }
    const n = m.length;
    if (n > 0) spaces++;
    const d = Math.abs(n - prev);
    if (d >= 2 && d <= 8) steps.set(d, (steps.get(d) ?? 0) + 1);
    prev = n;
  }
  if (!tabs && !spaces) return undefined;
  if (tabs > spaces) return { tabs: true, size: viewOptions().indent?.size ?? 4 };
  const size = [...steps.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 4;
  return { tabs: false, size };
}

const sizes = (title: string, tabs: boolean) => openQuickPick({
  placeholder: title, activeId: String(viewOptions().indent?.size ?? 4),
  items: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: String(n), label: String(n), description: n === (viewOptions().indent?.size ?? 4) ? 'Configured Tab Size' : undefined, accept: () => setViewOptions({ indent: { tabs, size: n } }) })),
});

/** W28 the indentation item: VS Code's Select Action list. */
export function selectIndentation() {
  const cur = viewOptions().indent;
  openQuickPick({
    placeholder: 'Select Action',
    items: [
      { id: 'spaces', label: 'Indent Using Spaces', description: 'change view', accept: () => setTimeout(() => sizes('Select Tab Size for the Current File', false)) },
      { id: 'tabs', label: 'Indent Using Tabs', description: 'change view', accept: () => setTimeout(() => sizes('Select Tab Size for the Current File', true)) },
      { id: 'size', label: 'Change Tab Display Size', description: 'change view', accept: () => setTimeout(() => sizes('Select Tab Size for the Current File', !!cur?.tabs)) },
      { id: 'detect', label: 'Detect Indentation from Content', description: 'change view', accept: () => { const a = activeEditor(); const d = a && detectIndentation(a.view.state.doc.toString()); if (d) setViewOptions({ indent: d }); } },
      { id: 'to-spaces', label: 'Convert Indentation to Spaces', description: 'convert file', separator: '', accept: () => runRider('untabify', 'menu') },
      { id: 'to-tabs', label: 'Convert Indentation to Tabs', description: 'convert file', accept: () => runRider('tabify', 'menu') },
    ],
  });
}
