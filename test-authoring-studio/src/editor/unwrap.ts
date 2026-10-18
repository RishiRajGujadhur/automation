import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Unwrap / Remove (Rider, Ctrl+Shift+Delete): the blocks around the caret that can be unwrapped — their header and
 * braces go, the body stays (one level less indented).
 */
export type Unwrappable = { label: string; header: number; open: number; close: number };
const KIND = /^\s*(?:\}\s*)?(if|else if|else|while|for|foreach|using|lock|unchecked|checked|fixed)\b/;

/** Blocks enclosing the caret, innermost first (1-based lines of the header, the "{" and the "}"). */
export function unwrappable(state: EditorState, pos: number): Unwrappable[] {
  const text = state.doc.toString();
  const out: Unwrappable[] = [];
  let at = pos;
  for (let guard = 0; guard < 30; guard++) {
    // The "{" before the caret that is still open.
    let depth = 0, open = -1;
    for (let i = at - 1; i >= 0; i--) {
      if (text[i] === '}') depth++;
      else if (text[i] === '{') { if (depth === 0) { open = i; break; } depth--; }
    }
    if (open < 0) break;
    depth = 0;
    let close = -1;
    for (let i = open + 1; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { if (depth === 0) { close = i; break; } depth--; }
    }
    if (close < 0) break;
    const openLine = state.doc.lineAt(open);
    // The header is on the "{" line (K&R) or the line before it (Allman).
    const header = openLine.text.trim() === '{' && openLine.number > 1 ? state.doc.line(openLine.number - 1) : openLine;
    const m = KIND.exec(header.text);
    if (m) out.push({ label: `Unwrap '${m[1]}'`, header: header.number, open: openLine.number, close: state.doc.lineAt(close).number });
    else if (header === openLine && openLine.text.trim() === '{') out.push({ label: 'Remove braces', header: openLine.number, open: openLine.number, close: state.doc.lineAt(close).number });
    else if (/\b(class|interface|struct|record|namespace|enum)\b|\)\s*$/.test(header.text)) break; // a type or member: stop
    at = open;
  }
  return out;
}

export function unwrap(view: EditorView, u: Unwrappable) {
  const st = view.state;
  const doc = st.doc;
  const close = doc.line(u.close);
  // Only whole-line blocks: "} else {" lines are shared with the next block.
  if (close.text.trim() !== '}' || !doc.line(u.open).text.trim().endsWith('{')) return false;
  const body: string[] = [];
  for (let n = u.open + 1; n < u.close; n++) body.push(doc.line(n).text.replace(/^( {4}|\t)/, ''));
  const from = doc.line(u.header).from, to = close.to;
  view.dispatch({ changes: { from, to, insert: body.join(st.lineBreak) }, selection: { anchor: from + (/^\s*/.exec(body[0] ?? '')?.[0].length ?? 0) }, scrollIntoView: true, userEvent: 'delete.unwrap' });
  return true;
}
