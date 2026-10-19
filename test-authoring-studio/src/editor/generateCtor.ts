import type { EditorView } from '@codemirror/view';

/**
 * Generate Constructor (Rider's Alt+Insert ▸ Constructor, Visual Studio's Quick Action): for the class around the
 * caret, a constructor taking its readonly fields and get-only properties, assigning each.
 */
export type Member = { name: string; type: string; field: boolean };
export function classAround(text: string, pos: number) {
  const re = /\b(class|record|struct)\s+(\w+)[^{;]*\{/g;
  let best: { name: string; open: number; close: number } | null = null;
  for (const m of text.matchAll(re)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0, close = -1;
    for (let i = open; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) { close = i; break; } }
    if (close > pos && open < pos && (!best || open > best.open)) best = { name: m[2], open, close };
  }
  return best;
}
export function constructorMembers(body: string): Member[] {
  const out: Member[] = [];
  // Only the class's own level (nested braces skipped).
  let depth = 0, top = '';
  for (const c of body) { if (c === '{') depth++; if (depth === 0) top += c; else if (c === '\n') top += '\n'; if (c === '}') depth--; }
  for (const m of top.matchAll(/^\s*(?:private|protected|internal|public)?\s*readonly\s+([\w<>\[\],.? ]+?)\s+(\w+)\s*;/gm)) out.push({ type: m[1].trim(), name: m[2], field: true });
  for (const m of body.matchAll(/^\s*public\s+([\w<>\[\],.? ]+?)\s+(\w+)\s*\{\s*get;\s*(?:init;\s*)?\}/gm)) out.push({ type: m[1].trim(), name: m[2], field: false });
  return out;
}
const paramName = (m: Member) => { const n = m.name.replace(/^_+/, ''); const p = n.charAt(0).toLowerCase() + n.slice(1); return /^(class|event|object|string|int|params|base|this|new|operator)$/.test(p) ? `@${p}` : p; };
export function constructorText(cls: string, members: Member[], indent: string) {
  const assign = members.map((m) => { const p = paramName(m); const target = m.name === p ? `this.${m.name}` : m.name; return `${indent}    ${target} = ${p};`; });
  return [`${indent}public ${cls}(${members.map((m) => `${m.type} ${paramName(m)}`).join(', ')})`, `${indent}{`, ...assign, `${indent}}`].join('\n');
}
export function generateConstructor(view: EditorView): string | null {
  const st = view.state;
  const text = st.doc.toString();
  const c = classAround(text, st.selection.main.head);
  if (!c) return 'Put the caret inside a class.';
  const body = text.slice(c.open + 1, c.close);
  const members = constructorMembers(body);
  if (!members.length) return `${c.name} has no readonly fields or get-only properties to initialize.`;
  // After the last field / property line, indented like the members.
  const lines = text.slice(0, c.close).split('\n');
  const startLine = text.slice(0, c.open).split('\n').length;
  let after = startLine;
  for (let i = startLine; i < lines.length; i++) if (/\breadonly\b|\{\s*get;/.test(lines[i])) after = i + 1;
  const indent = /^\s*/.exec(lines[after - 1] ?? '    ')![0] || '    ';
  const at = st.doc.line(after).to;
  const insert = `\n\n${constructorText(c.name, members, indent)}`;
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, scrollIntoView: true, userEvent: 'input.generate' });
  return null;
}
