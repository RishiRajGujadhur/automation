import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { expectedNamespace, setNamespace, firstTypeName, toggleIgnore } from '../src/editor/csharpTools';

const apply = (doc: string, cmd: (v: EditorView) => boolean) => {
  let state = EditorState.create({ doc });
  const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
  const ok = cmd(view as unknown as EditorView);
  return { ok, doc: state.doc.toString() };
};

describe('C# file tools (X79…)', () => {
  it('X79 Sync Namespace with Folder', () => {
    expect(expectedNamespace('src/App.Tests/Steps/Login/Auth.cs', 'src/App.Tests', 'App.Tests')).toBe('App.Tests.Steps.Login');
    expect(expectedNamespace('Steps/Auth.cs', '', 'Fixtures')).toBe('Fixtures.Steps');
    expect(expectedNamespace('My-Project/2fa/X.cs', 'My-Project', 'My-Project')).toBe('My_Project._2fa');
    expect(apply('using X;\nnamespace Wrong.Name;\nclass A {}', (v) => setNamespace(v, 'Right.Ns'))).toEqual({ ok: true, doc: 'using X;\nnamespace Right.Ns;\nclass A {}' });
    expect(apply('namespace Right.Ns\n{\n}', (v) => setNamespace(v, 'Right.Ns')).ok).toBe(false);
    expect(apply('class A {}', (v) => setNamespace(v, 'X')).ok).toBe(false);
  });
  it('X80 Rename File to Match Type: the first type', () => {
    expect(firstTypeName('// class Old\nnamespace N;\n/* struct X */ var s = "class Y";\npublic sealed partial class Clock<T> : IClock {}\nclass Second {}')).toBe('Clock');
    expect(firstTypeName('public record Point(int X, int Y);')).toBe('Point');
    expect(firstTypeName('var x = 1;')).toBeUndefined();
  });
  it('X176 Toggle Ignore Test', () => {
    const doc = 'class T\n{\n    [Test]\n    public void Adds()\n    {\n        Assert.Pass();\n    }\n}';
    const on = apply(doc.replace('Assert.Pass', 'Assert.Pass'), (v) => { v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf('Assert') } }); return toggleIgnore(v, 'flaky'); });
    expect(on.doc).toBe('class T\n{\n    [Test]\n    [Ignore("flaky")]\n    public void Adds()\n    {\n        Assert.Pass();\n    }\n}');
    const off = apply(on.doc, (v) => { v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf('Assert') } }); return toggleIgnore(v); });
    expect(off.doc).toBe(doc);
    expect(apply('class T\n{\n    public void Helper() { }\n}', (v) => { v.dispatch({ selection: { anchor: 20 } }); return toggleIgnore(v); }).ok).toBe(false);
  });
});
