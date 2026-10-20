import { EditorView } from '@codemirror/view';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';
import { fileOfView } from '../editor/activeEditor';

/** Linked editing (VS Code's editor.linkedEditing): typing in an XML / HTML tag name renames its matching tag too. */
export const linkedEditing = defineSetting<boolean>({ key: 'editor.linkedEditing', category: 'Text Editor', title: 'Linked Editing', type: 'boolean', default: false, description: 'Controls whether the editor has linked editing enabled: renaming an XML or HTML opening tag renames its closing tag (and the other way round).' });

export type Tag = { name: string; from: number; to: number; close: boolean; self: boolean };
/** The tags of a text with their name ranges, and each tag's partner (index) when it has one. Pure, for the unit tests. */
export function tagPairs(text: string): { tags: Tag[]; partner: Map<number, number> } {
  const tags: Tag[] = [];
  // Comments, CDATA and processing instructions are not tags.
  const masked = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, (m) => ' '.repeat(m.length));
  for (const m of masked.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)[^<>]*?(\/?)>/g)) {
    const from = m.index! + 1 + m[1].length;
    tags.push({ name: m[2], from, to: from + m[2].length, close: !!m[1], self: !!m[3] });
  }
  const partner = new Map<number, number>();
  const stack: number[] = [];
  tags.forEach((t, i) => {
    if (t.self) return;
    if (!t.close) { stack.push(i); return; }
    let j = stack.length - 1;
    while (j >= 0 && tags[stack[j]].name !== t.name) j--;
    if (j < 0) return;
    const o = stack[j];
    stack.length = j;
    partner.set(o, i);
    partner.set(i, o);
  });
  return { tags, partner };
}
const MARKUP = /\.(xml|csproj|props|targets|config|resx|runsettings|html?|xaml|svg)$/i;
settingsExtension(() => (!linkedEditing() ? [] : EditorView.updateListener.of((u) => {
  if (!u.docChanged || !u.transactions.some((t) => t.isUserEvent('input') || t.isUserEvent('delete')) || u.transactions.some((t) => t.isUserEvent('input.linked'))) return;
  if (!MARKUP.test(fileOfView(u.view) ?? '')) return;
  const before = tagPairs(u.startState.doc.toString());
  const head = u.startState.selection.main.head;
  // The tag name the caret was in (or at the end of) before the edit, and its partner.
  const i = before.tags.findIndex((t) => head >= t.from && head <= t.to);
  const j = i >= 0 ? before.partner.get(i) : undefined;
  if (i < 0 || j === undefined) return;
  const t = before.tags[i], p = before.tags[j];
  const from = u.changes.mapPos(t.from, -1), to = u.changes.mapPos(t.to, 1);
  const name = u.state.sliceDoc(from, to);
  if (!/^[A-Za-z_][\w:.-]*$/.test(name) || name === p.name) return;
  const pf = u.changes.mapPos(p.from, -1), pt = u.changes.mapPos(p.to, 1);
  if (u.state.sliceDoc(pf, pt) !== p.name) return;
  queueMicrotask(() => { try { u.view.dispatch({ changes: { from: pf, to: pt, insert: name }, userEvent: 'input.linked' }); } catch { /* destroyed */ } });
})));
