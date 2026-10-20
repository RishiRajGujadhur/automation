import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { extractInterface } from '../src/editor/textTools2';

describe('Rider C# features (RIDER-CS-15)', () => {
  it('runs', () => { expect(true).toBe(true); });
  it('RC8 Extract Interface', () => {
    const src = 'namespace Demo;\npublic class Shop : Base\n{\n    public string Name { get; set; } = "";\n    public int Count { get; private set; }\n    public Shop() { }\n    public async Task<int> Buy(string item, int n = 1) { return 1; }\n    private void Hidden() { }\n    public static void Util() { }\n}\n';
    const r = extractInterface(EditorState.create({ doc: src, selection: { anchor: 30 } }))!;
    expect(r.iface).toBe('namespace Demo;\n\npublic interface IShop\n{\n    string Name { get; set; }\n    int Count { get; }\n    Task<int> Buy(string item, int n = 1);\n}\n');
    expect(r.classText).toContain('public class Shop : Base, IShop\n{');
  });
});
