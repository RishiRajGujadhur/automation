import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cycleStepKeyword } from '../src/editor/gherkinTools';

/** Runs an editor command on `doc` with the selection between « and » (or a caret at ‸); with `caret`, the result marks the caret with ¦. */
function run(doc: string, cmd: (v: EditorView) => boolean, caret = false) {
  const a = doc.indexOf('«'), b = doc.indexOf('»'), c = doc.indexOf('‸');
  const text = doc.replace(/[«»‸]/g, '');
  const selection = a >= 0 ? { anchor: a, head: b - 1 } : { anchor: Math.max(0, c) };
  let state = EditorState.create({ doc: text, selection });
  const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
  cmd(view as unknown as EditorView);
  const out = state.doc.toString();
  const h = state.selection.main.head;
  return caret ? out.slice(0, h) + '¦' + out.slice(h) : out;
}

describe('Gherkin tools (IDE-FEATURES X49…)', () => {
  it('X49 Cycle Step Keyword: Given → When → Then → And → But → Given', () => {
    expect(run('  Given a ‸user', cycleStepKeyword)).toBe('  When a user');
    expect(run('  But x‸', cycleStepKeyword)).toBe('  Given x');
    expect(run('«  Then a\n  And b»', cycleStepKeyword)).toBe('  And a\n  But b');
    expect(run('  Feature: ‸x', cycleStepKeyword)).toBe('  Feature: x');
  });
});
