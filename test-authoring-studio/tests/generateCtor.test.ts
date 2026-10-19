import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { generateConstructor } from '../src/editor/generateCtor';

describe('Generate Constructor (X22)', () => {
  it('takes readonly fields and get-only properties, after the last of them', () => {
    const src = ['public class LoginPage', '{', '    private readonly IPage _page;', '    private readonly string url;', '    public string Title { get; }', '    public int Count { get; set; }', '', '    public void Open() { }', '}'].join('\n');
    let state = EditorState.create({ doc: src, selection: { anchor: src.indexOf('Open') } });
    const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } } as unknown as EditorView;
    expect(generateConstructor(view)).toBeNull();
    expect(state.doc.toString()).toContain(['    public string Title { get; }', '', '    public LoginPage(IPage page, string url, string title)', '    {', '        _page = page;', '        this.url = url;', '        Title = title;', '    }', '    public int Count'].join('\n'));
  });
  it('explains when there is nothing to initialize', () => {
    let state = EditorState.create({ doc: 'class A { void M() { } }', selection: { anchor: 12 } });
    const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } } as unknown as EditorView;
    expect(generateConstructor(view)).toMatch(/no readonly fields/);
  });
});
