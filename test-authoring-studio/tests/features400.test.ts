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
import { regionEnd } from '../src/vscode/foldingMarkers';
describe('177 custom folding markers', () => {
  it('nested regions', () => {
    const s = /^\s*(\/\/|#)\s*(region\b|<editor-fold\b)/, e = /^\s*(\/\/|#)\s*(endregion\b|<\/editor-fold>)/;
    const lines = ['// region Outer', 'a', '  // <editor-fold desc="x">', 'b', '  // </editor-fold>', '// endregion', '// region open'];
    expect(regionEnd(lines, 1, s, e)).toBe(6);
    expect(regionEnd(lines, 3, s, e)).toBe(5);
    expect(regionEnd(lines, 7, s, e)).toBeNull();
  });
});
import { tagPairs } from '../src/vscode/linkedEditing';
describe('175 linked editing', () => {
  it('pairs tags, skipping comments and self-closing', () => {
    const t = '<a><!-- <x> --><b/><c x="1">t</c></a>';
    const { tags, partner } = tagPairs(t);
    expect(tags.map((x) => x.name)).toEqual(['a', 'b', 'c', 'c', 'a']);
    expect(partner.get(0)).toBe(4);
    expect(partner.get(2)).toBe(3);
    expect(partner.has(1)).toBe(false);
  });
});
import { changedLineRanges } from '../src/vscode/filesOnSave';
describe('218 changed line ranges', () => {
  it('ranges of the new text that differ', () => {
    expect(changedLineRanges('a\nb\nc\nd', 'a\nB\nc\nd')).toEqual([[2, 2]]);
    expect(changedLineRanges('a\nb\nc', 'a\nx\ny\nb\nc\nz')).toEqual([[2, 3], [6, 6]]);
    expect(changedLineRanges('same', 'same')).toEqual([]);
  });
});
import { rebaseCommits, interactiveRebase, squashCommits, rebaseTodo } from '../server/git2';
import { execFileSync } from 'node:child_process';
describe('146 / 147 interactive rebase and squash', () => {
  const repo = async () => {
    const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'tas-rebase-test-'));
    const g = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
    g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@e.com'); g('config', 'user.name', 'T'); g('config', 'core.autocrlf', 'false');
    for (const n of ['a', 'b', 'c', 'd']) { await fsp.writeFile(nodePath.join(dir, `${n}.txt`), n); g('add', '-A'); g('commit', '-q', '-m', `Add ${n}`); }
    return { dir, g };
  };
  it('todo lines', async () => {
    const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'tas-todo-'));
    const t = await rebaseTodo([{ hash: 'a1', action: 'pick' }, { hash: 'b2', action: 'reword', message: 'New' }, { hash: 'c3', action: 'fixup' }, { hash: 'd4', action: 'drop' }], dir);
    expect(t.split('\n')[0]).toBe('pick a1');
    expect(t.split('\n')[1]).toBe('pick b2');
    expect(t.split('\n')[2]).toMatch(/^exec git commit --amend --allow-empty -F ".*message-0\.txt"$/);
    expect(t.split('\n').slice(3, 5)).toEqual(['fixup c3', 'drop d4']);
  }, 30_000);
  it('reorders, rewords, drops; squashes', async () => {
    const { dir, g } = await repo();
    const list = await rebaseCommits(dir, g('rev-parse', 'HEAD~2').trim());
    expect(list.map((c) => c.subject)).toEqual(['Add b', 'Add c', 'Add d']);
    await interactiveRebase(dir, list[0].hash, [{ hash: list[2].hash, action: 'reword', message: 'Add d first' }, { hash: list[0].hash, action: 'pick' }, { hash: list[1].hash, action: 'drop' }]);
    expect(g('log', '--format=%s').trim().split('\n')).toEqual(['Add b', 'Add d first', 'Add a']);
    expect(await fsp.readFile(nodePath.join(dir, 'c.txt'), 'utf8').catch(() => null)).toBeNull();
    await squashCommits(dir, g('rev-parse', 'HEAD~1').trim(), 'B and D');
    expect(g('log', '--format=%s').trim().split('\n')).toEqual(['B and D', 'Add a']);
    expect(g('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()).toEqual(['b.txt', 'd.txt']);
    await fsp.rm(dir, { recursive: true, force: true });
  }, 60_000);
});
import { sideBySide } from '../src/rider/SideBySide';
describe('400 side-by-side diff rows', () => {
  it('pairs removed and added lines, pads the shorter side', () => {
    const rows = sideBySide('--- a\n+++ b\n@@ -1,3 +1,4 @@\n same\n-old\n+new\n+extra\n tail\n');
    expect(rows.map(([l, r]) => `${l.kind}:${l.text}|${r.kind}:${r.text}`)).toEqual(['hunk:@@ -1,3 +1,4 @@|hunk:@@ -1,3 +1,4 @@', 'same:same|same:same', 'del:old|add:new', 'empty:|add:extra', 'same:tail|same:tail']);
    expect(rows[4][0].n).toBe(3);
    expect(rows[4][1].n).toBe(4);
  });
});
import { interpolationToFormat, recordToClass, asyncDisposableFields } from '../src/editor/csharpGen';
describe('355 / 91 / 347 C# conversions', () => {
  it('interpolation to composite formatting', () => {
    expect(interpolationToFormat('$"Hello {name}, {total:F2} ({items.Count,5})"')).toBe('string.Format("Hello {0}, {1:F2} ({2,5})", name, total, items.Count)');
    expect(interpolationToFormat('$"{{literal}} {Get(a, b)}"')).toBe('string.Format("{{literal}} {0}", Get(a, b))');
    expect(interpolationToFormat('$@"C:\{dir}"')).toBe('string.Format(@"C:\{0}", dir)');
    expect(interpolationToFormat('"plain"')).toBeNull();
  });
  it('record to class', () => {
    const c = recordToClass('public record Point(int X, int Y);')!;
    expect(c).toContain('public class Point : IEquatable<Point>');
    expect(c).toContain('public int X { get; init; }');
    expect(c).toContain('public Point(int x, int y)');
    expect(c).toContain('public void Deconstruct(out int x, out int y)');
    expect(c).toContain('public override string ToString() => $"Point {{ X = {X}, Y = {Y} }}";');
    expect(recordToClass('public record Named(string Name) : Base\n{\n    public int Extra => 1;\n}')).toContain('public class Named : Base, IEquatable<Named>');
    expect(recordToClass('public class NotARecord { }')).toBeNull();
  });
  it('async disposable fields', () => {
    expect(asyncDisposableFields('private readonly HttpClient _client = new();\nprivate IBrowser? browser;\nprivate int count;\nprivate Stream stream;')).toEqual(['_client', 'browser', 'stream']);
  });
});
import { apiChanges } from '../src/rider/analysis400';
describe('124 / 125 public API changes', () => {
  it('added, removed and changed members', () => {
    const c = apiChanges(['class N.A', 'void N.A.Run(int)', 'void N.A.New()'], ['class N.A', 'void N.A.Run()', 'void N.A.Gone()']);
    expect(c.added).toEqual(['void N.A.New()']);
    expect(c.removed).toEqual(['void N.A.Gone()']);
    expect(c.changed).toEqual([{ before: 'void N.A.Run()', after: 'void N.A.Run(int)' }]);
  });
});
