import { activeEditor } from '../editor/activeEditor';
import { registerRider } from '../rider/commands';

/**
 * VS Code's Focus Next Part (F6) / Focus Previous Part (Shift+F6) (VSCODE-250.md W56): the editor, the panel, the
 * status bar, the activity bar and the side bar in turn.
 */
const PARTS: { name: string; selector: string; focus: (el: HTMLElement) => void }[] = [
  { name: 'editor', selector: 'main.main-content', focus: (el) => { const a = activeEditor(); if (a && el.contains(a.view.dom)) a.view.focus(); else first(el)?.focus(); } },
  { name: 'panel', selector: '.dock:not([hidden])', focus: (el) => first(el)?.focus() },
  { name: 'status bar', selector: 'footer.status-bar', focus: (el) => first(el)?.focus() },
  { name: 'activity bar', selector: 'nav.activity-bar', focus: (el) => (el.querySelector<HTMLElement>('.activity-item.active') ?? first(el))?.focus() },
  { name: 'side bar', selector: '#feature-sidebar', focus: (el) => first(el)?.focus() },
];
const first = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"], [contenteditable="true"]')].find((x) => x.getClientRects().length > 0 && !x.hasAttribute('disabled'));
const visible = () => PARTS.map((p) => ({ ...p, el: document.querySelector<HTMLElement>(p.selector) })).filter((p): p is (typeof p & { el: HTMLElement }) => !!p.el && p.el.getClientRects().length > 0);

export function focusPart(step: 1 | -1) {
  const parts = visible();
  if (!parts.length) return;
  // The panel sits inside the editor area: check it first so it is not taken for the editor.
  const at = document.activeElement;
  const cur = [...parts].sort((a, b) => (a.name === 'panel' ? -1 : b.name === 'panel' ? 1 : 0)).find((p) => at && p.el.contains(at));
  const i = cur ? parts.indexOf(cur) : -1;
  const next = parts[(i + step + parts.length) % parts.length];
  next.focus(next.el);
}

registerRider([
  { id: 'focus-next-part', label: 'View: Focus Next Part', menu: 'View', shortcut: 'F6', run: () => focusPart(1) },
  { id: 'focus-previous-part', label: 'View: Focus Previous Part', menu: 'View', shortcut: 'Shift+F6', run: () => focusPart(-1) },
]);
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if (e.key !== 'F6' || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  focusPart(e.shiftKey ? -1 : 1);
}, true);
