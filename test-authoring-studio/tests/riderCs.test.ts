import { describe, expect, it } from 'vitest';
import { findPattern, replacePattern } from '../src/search/ssr';
import { EditorState } from '@codemirror/state';
import { extractInterface, unitTestsFor } from '../src/editor/textTools2';

describe('Rider C# features (RIDER-CS-15)', () => {
  it('runs', () => { expect(true).toBe(true); });
  it('RC8 Extract Interface', () => {
    const src = 'namespace Demo;\npublic class Shop : Base\n{\n    public string Name { get; set; } = "";\n    public int Count { get; private set; }\n    public Shop() { }\n    public async Task<int> Buy(string item, int n = 1) { return 1; }\n    private void Hidden() { }\n    public static void Util() { }\n}\n';
    const r = extractInterface(EditorState.create({ doc: src, selection: { anchor: 30 } }))!;
    expect(r.iface).toBe('namespace Demo;\n\npublic interface IShop\n{\n    string Name { get; set; }\n    int Count { get; }\n    Task<int> Buy(string item, int n = 1);\n}\n');
    expect(r.classText).toContain('public class Shop : Base, IShop\n{');
  });
  it('RC9 Create Unit Tests', () => {
    const src = 'namespace Demo;\npublic class Calc\n{\n    public int Add(int a, int b) => a + b;\n    public int Add(int a) => a;\n    public void Reset() { }\n}\n';
    const r = unitTestsFor(EditorState.create({ doc: src, selection: { anchor: 30 } }), 'xunit')!;
    expect(r.name).toBe('CalcTests');
    expect(r.text).toContain('using Xunit;\n\nnamespace Demo.Tests;\n\npublic class CalcTests\n{\n    [Fact]\n    public void Add_Works()');
    expect(r.text.match(/\[Fact\]/g)).toHaveLength(2);
  });
  it('RC13 Search with Pattern', () => {
    const src = 'if (user == null) return;\nif (a.B() == null) x();\nvar s = Equals(page.Title, page.Title);\nEquals(a, b);';
    expect(findPattern(src, '$x$ == null').map((m) => m.text)).toEqual(['user == null', 'a.B() == null']);
    expect(findPattern(src, 'Equals($a$, $a$)').map((m) => m.line)).toEqual([3]);
    expect(replacePattern(src, '$x$ == null', '$x$ is null')).toEqual({ text: 'if (user is null) return;\nif (a.B() is null) x();\nvar s = Equals(page.Title, page.Title);\nEquals(a, b);', count: 2 });
  });
});
