import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { sortLines, reverseLines } from '../src/editor/textTools';

/** Runs an editor command on `doc` with the selection between the markers « and » (or a caret at |). */
export function run(doc: string, cmd: (v: EditorView) => boolean) {
  const a = doc.indexOf('«'), b = doc.indexOf('»'), c = doc.indexOf('|');
  const text = doc.replace(/[«»|]/g, '');
  const selection = a >= 0 ? { anchor: a, head: b - 1 } : { anchor: c >= 0 ? c : 0 };
  let state = EditorState.create({ doc: text, selection });
  const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
  cmd(view as unknown as EditorView);
  return state.doc.toString();
}

describe('text tools (IDE-FEATURES X1…)', () => {
  it('X1 Sort Lines: the selected lines, natural order; the whole file without a selection', () => {
    expect(run('b\n«item10\nItem2\nitem1»\na', sortLines())).toBe('b\nitem1\nItem2\nitem10\na');
    expect(run('|c\n\nb\na', sortLines())).toBe('a\nb\nc\n');
  });
  it('X2 Reverse Lines', () => {
    expect(run('x\n«a\nb\nc»\ny', reverseLines)).toBe('x\nc\nb\na\ny');
  });
});
