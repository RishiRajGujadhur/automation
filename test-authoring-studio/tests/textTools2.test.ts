import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { mapSelections, urlEncode, urlDecode, base64Encode, base64Decode, escapeString, unescapeString, htmlEncode, htmlDecode, stepNumber, insertSequence, toggleQuotes, joinWith, splitAt, alignAssignments, swapSelections, countOccurrences, trimLines, stamp, insertText, LOREM, shuffleLines, formatXml, minifyXml, jsonEscape, jsonUnescape } from '../src/editor/textTools2';

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
  it('Y1 URL Encode / Decode', () => {
    expect(run('«a b&c=d/é»', urlEncode)).toBe('a%20b%26c%3Dd%2F%C3%A9');
    expect(run('«a%20b+c%26»', urlDecode)).toBe('a b c&');
  });
  it('Y2 Base64 Encode / Decode (UTF-8)', () => {
    expect(run('«héllo»', base64Encode)).toBe('aMOpbGxv');
    expect(run('«aMOpbGxv»', base64Decode)).toBe('héllo');
    expect(run('«not base64!»', base64Decode)).toBe('not base64!');
  });
  it('Y3 Escape / Unescape C# String', () => {
    expect(run('«say "hi"\\path»', escapeString)).toBe('say \\"hi\\"\\\\path');
    expect(run('«a\\tb\\n\\"c\\" \\u0041»', unescapeString)).toBe('a\tb\n"c" A');
  });
  it('Y4 HTML Encode / Decode', () => {
    expect(run('«<a href="x">Tom & Jerry</a>»', htmlEncode)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;');
    expect(run('«&lt;b&gt; &#39;x&#39; &#x41;»', htmlDecode)).toBe("<b> 'x' A");
  });
  it('Y5 Increment / Decrement Number at the caret, zero padding kept', () => {
    expect(run('id = 4|1;', stepNumber(1))).toBe('id = 42;');
    expect(run('v|009', stepNumber(1))).toBe('v010');
    expect(run('x = |0', stepNumber(-1))).toBe('x = -1');
    expect(run('no |number', stepNumber(1))).toBe('no number');
  });
  it('Y6 Insert Sequence at several carets', () => {
    let state = EditorState.create({ doc: 'a\nb\nc', selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3), EditorSelection.cursor(5)]), extensions: EditorState.allowMultipleSelections.of(true) });
    const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
    expect(insertSequence(view as unknown as EditorView)).toBe(true);
    expect(state.doc.toString()).toBe('a1\nb2\nc3');
  });
  it('Y7 Toggle Quotes', () => {
    expect(run('x = "it|\'s";', toggleQuotes)).toBe("x = 'it\\'s';");
    expect(run("x = 'a|b';", toggleQuotes)).toBe('x = "ab";');
    expect(run('no| quotes', toggleQuotes)).toBe('no quotes');
  });
  it('Y8 Join Lines with Separator', () => {
    expect(run('«  a\n  b\n\n  c»', joinWith(', '))).toBe('  a, b, c');
    expect(run('a|\nb', joinWith(', '))).toBe('a\nb');
  });
  it('Y9 Split at Separator', () => {
    expect(run('  a, b,c|', splitAt(','))).toBe('  a\n  b\n  c');
    expect(run('«x;y\nz»', splitAt(';'))).toBe('x\ny\nz');
  });
  it('Y10 Align Assignments around the caret', () => {
    expect(run('var a = 1;\nvar long|Name=2;\nif (a == b) x += 3;\n\nz = 0;', alignAssignments)).toBe('var a        = 1;\nvar longName = 2;\nif (a == b) x += 3;\n\nz = 0;');
  });
  it('Y11 Swap Selections', () => {
    let state = EditorState.create({ doc: 'left = right;', selection: EditorSelection.create([EditorSelection.range(0, 4), EditorSelection.range(7, 12)]), extensions: EditorState.allowMultipleSelections.of(true) });
    const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
    expect(swapSelections(view as unknown as EditorView)).toBe(true);
    expect(state.doc.toString()).toBe('right = left;');
  });
  it('Y12 Count Occurrences of the word at the caret', () => {
    const state = EditorState.create({ doc: 'user a user\nb\nuser', selection: { anchor: 1 } });
    expect(countOccurrences(state)).toEqual({ needle: 'user', count: 3, lines: 2 });
  });
  it('Y13 Trim Lines', () => {
    expect(run('«  a  \n\tb »\n  c', trimLines)).toBe('a\nb\n  c');
  });
  it('Y14 Insert Date and Time', () => {
    expect(stamp(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07');
    expect(run('at |now', insertText(() => 'X'))).toBe('at Xnow');
  });
  it('Y15 Lorem Ipsum', () => {
    expect(run('"|"', insertText(() => LOREM))).toBe(`"${LOREM}"`);
  });
  it('Y16 Shuffle Lines (seeded)', () => {
    expect(run('«a\nb\nc»', shuffleLines(() => 0))).toBe('b\nc\na');
    expect(run('a|\nb', shuffleLines())).toBe('a\nb');
  });
  it('Y17 Reformat XML', () => {
    expect(formatXml('<?xml version="1.0"?><a x="1"><!-- c --><b>text</b><c/><d></d></a>')).toBe('<?xml version="1.0"?>\n<a x="1">\n  <!-- c -->\n  <b>text</b>\n  <c/>\n  <d></d>\n</a>');
    expect(formatXml('<a><b></a>')).toBe(null);
    expect(formatXml('not xml')).toBe(null);
  });
  it('Y18 Minify XML', () => {
    expect(run('|<a>\n  <b>x</b>\n</a>', minifyXml)).toBe('<a><b>x</b></a>');
  });
  it('Y19 Escape / Unescape JSON String', () => {
    expect(run('«{"a": 1}\n»', jsonEscape)).toBe('{\\"a\\": 1}\\n');
    expect(run('«{\\"a\\": \\u00e9}»', jsonUnescape)).toBe('{"a": é}');
  });
});
