import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sortLines, reverseLines, deleteHorizontalWhiteSpace, setCase, transposeLine, transposeChars, transposeWords, cursorMatchingBracket, selectMatchingBracket, findSelected, lastEditLocation, trackEdits, insertGuid, cyclicExpandWord } from '../src/editor/textTools';

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
  it('X3 Delete Horizontal White Space: around the caret; collapsed in a selection, indentation kept', () => {
    expect(run('a   |   b', deleteHorizontalWhiteSpace)).toBe('ab');
    expect(run('«    x   =    1;\n    y  = 2;»', deleteHorizontalWhiteSpace)).toBe('    x = 1;\n    y = 2;');
  });
  it('X4 Make Uppercase', () => {
    expect(run('a Wo|rd b', setCase(true))).toBe('a WORD b');
  });
  it('X5 Make Lowercase', () => {
    expect(run('a WO|RD b', setCase(false))).toBe('a word b');
  });
  it('X6 Transpose Line', () => {
    expect(run('a|1\nb2\nc3', transposeLine)).toBe('b2\na1\nc3');
  });
  it('X7 Transpose Characters', () => {
    expect(run('te|h x', transposeChars)).toBe('the x');
    expect(run('ab|cd', transposeChars)).toBe('acbd');
  });
  it('X8 Transpose Words', () => {
    expect(run('Given us|er the logs in', transposeWords)).toBe('Given the user logs in');
  });
  it('X9 Go to Matching Brace', () => {
    let at = -1;
    run('if (|(a) && b) { }', (v) => { const r = cursorMatchingBracket(v); at = v.state.selection.main.head; return r; });
    expect(at).toBe(7); // after the ) that matches the ( at the caret
  });
  it('X10 Select to Matching Brace', () => {
    let sel = '';
    run('x |{ a; } y', (v) => { const r = selectMatchingBracket(v); sel = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to); return r; });
    expect(sel).toBe('{ a; }');
  });
  it('X11 Find Next Selected (wraps)', () => {
    let at = -1;
    run('foo bar |foo baz foo', (v) => { const r = findSelected(1)(v); at = v.state.selection.main.from; return r; });
    expect(at).toBe(16);
  });
  it('X12 Find Previous Selected', () => {
    let at = -1;
    run('foo bar |foo baz foo', (v) => { const r = findSelected(-1)(v); at = v.state.selection.main.from; return r; });
    expect(at).toBe(0);
  });
  it('X13 Go to Last Edit Location: records the last typing position per file', () => {
    let state = EditorState.create({ doc: 'abc\ndef', extensions: [trackEdits('A.cs')] });
    const tr = state.update({ changes: { from: 5, insert: 'X' }, selection: { anchor: 6 }, userEvent: 'input.type' });
    // The listener runs on views; call it the way a view would.
    const listeners = tr.startState.facet(EditorView.updateListener);
    for (const l of listeners) l({ docChanged: true, transactions: [tr], state: tr.state } as never);
    state = tr.state;
    expect(lastEditLocation()).toEqual({ file: 'A.cs', pos: 6, line: 2, column: 3 });
  });
  it('X14 Insert GUID', () => {
    expect(run('id = "|"', insertGuid)).toMatch(/^id = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"$/);
  });
  it('X15 Cyclic Expand Word: nearest match first, again for the next', () => {
    let state = EditorState.create({ doc: 'calculator calcResult cal', selection: { anchor: 25 } });
    const view = { get state() { return state; }, dispatch: (...specs: TransactionSpec[]) => { state = state.update(...specs).state; } } as unknown as EditorView;
    cyclicExpandWord(view);
    expect(state.doc.toString()).toBe('calculator calcResult calcResult');
    cyclicExpandWord(view);
    expect(state.doc.toString()).toBe('calculator calcResult calculator');
  });
});
