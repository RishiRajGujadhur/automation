import { describe, expect, it } from 'vitest';
import { changedLines } from '../src/editor/quickPreview';

// Unit tests for RIDER-VSCODE-FEATURES.md.
describe('117 Quick Actions preview', () => {
  it('changed lines with context', () => {
    expect(changedLines('a\nb\nc\nd\ne', 'a\nb\nX\nd\ne', 1)).toEqual([{ kind: ' ', text: 'b' }, { kind: '-', text: 'c' }, { kind: '+', text: 'X' }, { kind: ' ', text: 'd' }]);
    expect(changedLines('same', 'same')).toEqual([]);
    expect(changedLines('a\r\nb', 'a\nb\nc', 0)).toEqual([{ kind: '+', text: 'c' }]);
  });
});
import { todoPositions, stepTo } from '../src/editor/navTools';
describe('324 TODO navigation', () => {
  it('finds TODO keywords in comments only', () => {
    const t = 'var todo = 1; // TODO: a\n# FIXME b\nstring s = "TODO not";\n/* HACK c */\n * BUG d';
    const at = todoPositions(t, ['TODO', 'FIXME', 'HACK', 'BUG']);
    expect(at.map((i) => t.slice(i, i + 4))).toEqual(['TODO', 'FIXM', 'HACK', 'BUG ']);
    expect(stepTo([5, 20, 40], 20, 1)).toBe(40);
    expect(stepTo([5, 20, 40], 41, 1)).toBe(5);
    expect(stepTo([5, 20, 40], 5, -1)).toBe(40);
    expect(stepTo([], 0, 1)).toBe(-1);
  });
});
import { preserveCase, findInFiles, replaceInFiles, multiline } from '../server/search';
import fsp from 'node:fs/promises';
import os from 'node:os';
import nodePath from 'node:path';
describe('206 / 340 / 338 search', () => {
  it('preserve case', () => {
    expect(preserveCase('foo', 'bar')).toBe('bar');
    expect(preserveCase('Foo', 'bar')).toBe('Bar');
    expect(preserveCase('FOO', 'bar')).toBe('BAR');
    expect(preserveCase('fooBar', 'BazQux')).toBe('bazQux');
    expect(preserveCase('FooBar', 'bazQux')).toBe('BazQux');
  });
  it('multiline regex, CRLF kept, ignored folders', async () => {
    const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'tas-search-'));
    await fsp.writeFile(nodePath.join(dir, 'a.cs'), 'int a;\r\n// end\r\nint b;\r\n');
    await fsp.mkdir(nodePath.join(dir, 'bin'));
    await fsp.writeFile(nodePath.join(dir, 'bin', 'x.cs'), 'hidden token');
    expect(multiline({ query: String.raw`a;\n//`, regex: true })).toBe(true);
    expect(multiline({ query: String.raw`a;\n//`, regex: false })).toBe(false);
    const r = await findInFiles(dir, ['bin'], { query: String.raw`a;\n// end`, regex: true });
    expect(r.files[0].matches[0]).toMatchObject({ line: 1, column: 5 });
    await replaceInFiles(dir, ['bin'], { query: String.raw`a;\n// end\n`, regex: true }, 'a;\n');
    expect(await fsp.readFile(nodePath.join(dir, 'a.cs'), 'utf8')).toBe('int a;\r\nint b;\r\n');
    expect((await findInFiles(dir, ['bin'], { query: 'hidden' })).total).toBe(0);
    expect((await findInFiles(dir, ['.git'], { query: 'hidden' })).total).toBe(1);
    await fsp.rm(dir, { recursive: true, force: true });
  });
});
import { searchEditorText, parseSearchEditor, searchEditorName } from '../server/search';
import { searchEditorLocation } from '../src/search/searchEditor';
describe('203 / 204 search editor', () => {
  it('writes, reads back and locates', () => {
    const o = { query: 'foo', regex: true, matchCase: true, include: '*.cs' };
    const text = searchEditorText(o, { files: [{ file: 'Steps/A.cs', matches: [{ line: 3, column: 1, length: 3, preview: 'foo();' }] }], total: 1, truncated: false });
    expect(text).toContain('# Query: foo\n# Flags: CaseSensitive RegExp\n# Including: *.cs\n\n1 result - 1 file\n\nSteps/A.cs:\n  3: foo();');
    expect(parseSearchEditor(text)).toMatchObject({ query: 'foo', regex: true, matchCase: true, wholeWord: false, include: '*.cs' });
    const lines = text.split('\n');
    expect(searchEditorLocation(lines, lines.indexOf('  3: foo();'))).toEqual({ file: 'Steps/A.cs', line: 3 });
    expect(searchEditorLocation(lines, 0)).toBeNull();
    expect(searchEditorName('a b/c?')).toBe('a-b-c.code-search');
  });
});
import { unicodeHits } from '../src/vscode/unicode';
describe('207 unicode highlighting', () => {
  const o = { invisible: true, ambiguous: true, nonBasic: false, comments: false };
  it('invisible, look-alikes in mixed words, comments skipped', () => {
    expect(unicodeHits('var a​ = 1;', o).map((h) => h.kind)).toEqual(['invisible']);
    expect(unicodeHits('var аdmin = "x";', o)).toEqual([{ at: 4, char: 'а', kind: 'ambiguous', like: 'a' }]);
    expect(unicodeHits('Given привет мир', o)).toEqual([]);
    expect(unicodeHits('x = 1; // аdmin', o)).toEqual([]);
    expect(unicodeHits('x = 1; // аdmin', { ...o, comments: true })).toHaveLength(1);
    expect(unicodeHits('café', { ...o, nonBasic: true }).map((h) => h.char)).toEqual(['é']);
    expect(unicodeHits('say “hi”', o).map((h) => h.like)).toEqual(['"', '"']);
  });
});
import { bracketPairs } from '../src/vscode/bracketGuides';
describe('211 bracket pair guides', () => {
  it('multi-line pairs with the closing column and depth, strings skipped', () => {
    const t = 'class A\n{\n    void M()\n    {\n        var s = "}";\n    }\n}\n';
    expect(bracketPairs(t).map((p) => [p.openLine, p.closeLine, p.column, p.depth])).toEqual([[4, 6, 4, 1], [2, 7, 0, 0]]);
    expect(bracketPairs('f(a,\n  b)')).toHaveLength(1);
    expect(bracketPairs('x = [1, 2]; // {')).toHaveLength(0);
  });
});
