import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { hunks, rollbackLines, setBase, baseOf, changeGutter } from '../src/editor/changeGutter';

function rollback(base: string, doc: string, caretAt: string) {
  let state = EditorState.create({ doc, extensions: [changeGutter()], selection: { anchor: doc.indexOf(caretAt) } });
  state = state.update({ effects: setBase.of(base) }).state;
  expect(baseOf(state)).toBe(base);
  const view = { get state() { return state; }, dispatch: (spec: Parameters<EditorState['update']>[0]) => { state = state.update(spec).state; } };
  const done = rollbackLines(view as never);
  return { done, text: state.doc.toString() };
}

describe('change hunks and Rollback Lines (J41, J42)', () => {
  const base = 'a\nb\nc\nd\n';
  it('finds modified, added and deleted regions', () => {
    const doc = EditorState.create({ doc: 'a\nB\nc\nx\n' }).doc;
    expect(hunks(base, doc)).toEqual([{ start: 2, end: 2, base: ['b'] }, { start: 4, end: 4, base: ['d'] }]);
    expect(hunks(base, EditorState.create({ doc: 'a\nc\nd\n' }).doc)).toEqual([{ start: 2, end: 1, base: ['b'] }]);
    expect(hunks(base, EditorState.create({ doc: 'a\nb\nnew\nc\nd\n' }).doc)).toEqual([{ start: 3, end: 3, base: [] }]);
  });
  it('rolls back only the region at the caret', () => {
    expect(rollback(base, 'a\nB\nc\nx\n', 'B')).toEqual({ done: true, text: 'a\nb\nc\nx\n' });
    expect(rollback(base, 'a\nb\nnew\nc\nd\n', 'new')).toEqual({ done: true, text: base });
    expect(rollback(base, 'a\nc\nd\n', 'c')).toEqual({ done: true, text: base });
    expect(rollback(base, 'a\nB\nc\nd\n', 'd').done).toBe(false);
  });
});
