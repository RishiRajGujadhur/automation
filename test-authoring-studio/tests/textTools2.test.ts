import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { mapSelections } from '../src/editor/textTools2';

/** Runs an editor command on `doc` with the selection between « and » (or a caret at |). */
function run(doc: string, cmd: (v: EditorView) => boolean) {
  const a = doc.indexOf('«'), b = doc.indexOf('»'), c = doc.indexOf('|');
  const text = doc.replace(/[«»|]/g, '');
  const selection = a >= 0 ? { anchor: a, head: b - 1 } : { anchor: c >= 0 ? c : 0 };
  let state = EditorState.create({ doc: text, selection, extensions: EditorState.allowMultipleSelections.of(true) });
  const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
  cmd(view as unknown as EditorView);
  return state.doc.toString();
}

describe('text tools, fourth batch (IDE-FEATURES-4 Y1…)', () => {
  it('maps the word at the caret', () => {
    expect(run('a wo|rd b', mapSelections((t) => t.toUpperCase()))).toBe('a WORD b');
  });
});
