import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sortLines, reverseLines, deleteHorizontalWhiteSpace, setCase, transposeLine, transposeChars, transposeWords, cursorMatchingBracket, selectMatchingBracket, findSelected, lastEditLocation, trackEdits, insertGuid, cyclicExpandWord, gotoMember, toggleVerbatim, convertCase, reformatJson, stripTrailingSpaces, splitString, tabify, untabify, codeBlockStart, codeBlockEnd, removeDuplicateLines, removeBlankLines } from '../src/editor/textTools';

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
  it('X18 Next / Previous Member', () => {
    const cs = ['class A', '{', '    public int X { get; set; }', '    public void M()', '    {', '    }', '    private static string N(int a) => "";', '}'].join('\n');
    let line = 0;
    const at = (v: EditorView) => { line = v.state.doc.lineAt(v.state.selection.main.head).number; return true; };
    run('|' + cs, (v) => gotoMember('A.cs', 1)(v) && at(v));
    expect(line).toBe(3);
    run(cs.replace('void M()', 'void M()|'), (v) => gotoMember('A.cs', 1)(v) && at(v));
    expect(line).toBe(7);
    run('Feature: F\n  Scenario: S\n    Given x\n  Scenario: |T', (v) => gotoMember('F.feature', -1)(v) && at(v));
    expect(line).toBe(2);
  });
  it('X19 To Verbatim / Regular String', () => {
    const q = '"';
    // Regular → verbatim: \\ becomes \, \" becomes "" (doubled).
    expect(run(`[Given(${q}a \\\\d+ \\${q}x|\\${q}${q})]`, toggleVerbatim)).toBe(`[Given(@${q}a \\d+ ${q}${q}x${q}${q}${q})]`);
    // And back.
    expect(run(`[Given(@${q}a \\d+ ${q}${q}x|${q}${q}${q})]`, toggleVerbatim)).toBe(`[Given(${q}a \\\\d+ \\${q}x\\${q}${q})]`);
    // Other escapes: left alone.
    expect(run(`var s = ${q}a\\nb|${q};`, toggleVerbatim)).toBe(`var s = ${q}a\\nb${q};`);
  });
  it('X20 Convert Case', () => {
    expect(convertCase('get user name', 'camel')).toBe('getUserName');
    expect(convertCase('getUserName', 'snake')).toBe('get_user_name');
    expect(convertCase('XMLHttpRequest', 'kebab')).toBe('xml-http-request');
    expect(convertCase('the_user_signs_in', 'sentence')).toBe('The user signs in');
    expect(convertCase('user-name', 'constant')).toBe('USER_NAME');
    expect(convertCase('UserName', 'title')).toBe('User Name');
  });
  it('X24 Reformat / Minify JSON', () => {
    expect(run('|{"a":1,"b":[1,2]}', reformatJson())).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    expect(run('|{\n  "a": 1\n}\n', reformatJson(true))).toBe('{"a":1}');
    expect(run('|{nope', reformatJson())).toBe('{nope');
  });
  it('X59 Strip Trailing Spaces: the selected lines, else the whole file', () => {
    expect(run('a  \n«b \t\nc »\nd  ', stripTrailingSpaces)).toBe('a  \nb\nc\nd  ');
    expect(run('a |  \nb\t\n  ', stripTrailingSpaces)).toBe('a\nb\n');
  });
  it('X81 Split String: "…" + "…" at the caret, interpolation kept', () => {
    expect(run('    var s = "Hello |world";', splitString)).toBe('    var s = "Hello " +\n        "world";');
    expect(run('var s = $"Hi {name}|, bye";', splitString)).toBe('var s = $"Hi {name}" +\n    $", bye";');
    expect(run('var s = "a\\"b|c";', splitString)).toBe('var s = "a\\"b" +\n    "c";');
    expect(run('var |s = "abc";', splitString)).toBe('var s = "abc";');
  });
  it('X82 Tabify: leading spaces become tabs (selection, else the file)', () => {
    expect(run('«        a\n   b\n\t  c»\nd', tabify)).toBe('\t\ta\n   b\n\t  c\nd');
    expect(run('|    x\n      y', tabify)).toBe('\tx\n\t  y');
  });
  it('X83 Untabify: leading tabs become spaces of the same width', () => {
    expect(run('«\t\ta\n  \tb»\nc', untabify)).toBe('        a\n    b\nc');
  });
  it('X84 Code Block Start: the enclosing {, then the next one out', () => {
    const doc = 'class A {\n  void M() {\n    if (x) { y("{"); }\n    z|();\n  }\n}';
    const caret = (d: string, cmd: (v: EditorView) => boolean) => { const a = d.indexOf('|'); let state = EditorState.create({ doc: d.replace('|', ''), selection: { anchor: a } }); const v = { get state() { return state; }, dispatch: (s: TransactionSpec) => { state = state.update(s).state; } }; cmd(v as unknown as EditorView); return state.selection.main.head; };
    const plain = doc.replace('|', '');
    expect(caret(doc, codeBlockStart)).toBe(plain.indexOf('{\n    if'));
    const onBrace = plain.slice(0, plain.indexOf('{\n    if')) + '|' + plain.slice(plain.indexOf('{\n    if'));
    expect(caret(onBrace, codeBlockStart)).toBe(plain.indexOf('{'));
  });
  it('X85 Code Block End: the enclosing }', () => {
    const plain = 'class A {\n  void M() {\n    z();\n  }\n}';
    let state = EditorState.create({ doc: plain, selection: { anchor: plain.indexOf('z') } });
    const v = { get state() { return state; }, dispatch: (s: TransactionSpec) => { state = state.update(s).state; } };
    codeBlockEnd(v as unknown as EditorView);
    expect(state.selection.main.head).toBe(plain.indexOf('}'));
    codeBlockEnd(v as unknown as EditorView);
    expect(state.selection.main.head).toBe(plain.lastIndexOf('}'));
  });
  it('X134 Remove Duplicate Lines', () => {
    expect(run('|b\na\nb\n\n\na\nc', removeDuplicateLines)).toBe('b\na\n\n\nc');
  });
  it('X135 Remove Blank Lines', () => {
    expect(run('x\n«a\n\n  \nb»\n\ny', removeBlankLines)).toBe('x\na\nb\n\ny');
  });
  it('X136 Sort Lines Descending', () => {
    expect(run('«item2\nitem10\nItem1»', sortLines(true))).toBe('item10\nitem2\nItem1');
  });
  it('QL76 notification times read as how long ago', async () => {
    const { ago } = await import('../src/rider/NotificationsPanel');
    const now = 10_000_000;
    expect(ago(now - 5_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(ago(now - 2 * 3_600_000, now)).toBe('2 h ago');
  });
});
