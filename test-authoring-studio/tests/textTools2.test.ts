import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { mapSelections, urlEncode, urlDecode, base64Encode, base64Decode, escapeString, unescapeString, htmlEncode, htmlDecode, stepNumber, insertSequence, toggleQuotes } from '../src/editor/textTools2';

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
});
