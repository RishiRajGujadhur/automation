import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { pasteLink, toggleWrap, continueList } from '../src/editor/markdownQol';

/** Runs a command on `doc` with the selection between « and » (or a caret at ‸); the result marks the caret with ¦. */
function run(doc: string, cmd: (v: EditorView) => boolean, caret = false) {
  const a = doc.indexOf('«'), b = doc.indexOf('»'), c = doc.indexOf('‸');
  const text = doc.replace(/[«»‸]/g, '');
  let state = EditorState.create({ doc: text, selection: a >= 0 ? { anchor: a, head: b - 1 } : { anchor: Math.max(0, c) } });
  const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
  cmd(view as unknown as EditorView);
  const out = state.doc.toString(), h = state.selection.main.head;
  return caret ? out.slice(0, h) + '¦' + out.slice(h) : out;
}

describe('Markdown editing (QL51…)', () => {
  it('QL54 paste a URL over text makes a link', () => {
    expect(run('see «the docs» here', (v) => pasteLink(v, 'https://example.com/a'))).toBe('see [the docs](https://example.com/a) here');
    expect(run('see «the docs» here', (v) => pasteLink(v, 'not a url'))).toBe('see the docs here');
    expect(run('caret‸ only', (v) => pasteLink(v, 'https://example.com'))).toBe('caret only');
  });
  it('QL55 bold / italic toggles', () => {
    expect(run('a «word» b', toggleWrap('**'))).toBe('a **word** b');
    expect(run('a **«word»** b', toggleWrap('**'))).toBe('a word b');
    expect(run('a wo‸rd b', toggleWrap('*'))).toBe('a *word* b');
  });
  it('QL56 lists continue on Enter; an empty item ends the list', () => {
    expect(run('- one‸', continueList, true)).toBe('- one\n- ¦');
    expect(run('9. nine‸', continueList, true)).toBe('9. nine\n10. ¦');
    expect(run('  - [x] done‸', continueList, true)).toBe('  - [x] done\n  - [ ] ¦');
    expect(run('- one\n- ‸', continueList)).toBe('- one\n');
    expect(run('plain‸', continueList)).toBe('plain');
  });
});
