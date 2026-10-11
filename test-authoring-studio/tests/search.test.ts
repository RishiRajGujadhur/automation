import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findInFiles, replaceInFiles, globTest } from '../server/search';

describe('Find and Replace in Files', () => {
  let root: string;
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-search-'));
    await fs.mkdir(path.join(root, 'Steps'), { recursive: true });
    await fs.mkdir(path.join(root, 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, 'Steps/Cart.cs'), 'class Cart {\n  CartPage page; // cart\n  void Add() { page.Add(); }\n}\n');
    await fs.writeFile(path.join(root, 'Cart.feature'), 'Feature: Cart\n  Scenario: Add to cart\n');
    await fs.writeFile(path.join(root, 'bin/Cart.cs'), 'class Cart {}\n');
  });
  afterAll(() => fs.rm(root, { recursive: true, force: true }));

  it('finds case-insensitively by default, skipping build output', async () => {
    const r = await findInFiles(root, ['bin', 'obj'], { query: 'cart' });
    expect(r.files.map((f) => f.file).sort()).toEqual(['Cart.feature', 'Steps/Cart.cs']);
    expect(r.total).toBe(5); // class Cart, CartPage, // cart; Feature: Cart, Add to cart
  });
  it('honours match case, whole word, regex and include globs', async () => {
    expect((await findInFiles(root, ['bin'], { query: 'Cart', matchCase: true, wholeWord: true })).total).toBe(2);
    const re = await findInFiles(root, ['bin'], { query: 'page\\.(\\w+)', regex: true, include: '*.cs' });
    expect(re.files[0].matches[0]).toMatchObject({ line: 3, column: 16, length: 8 });
    expect(globTest('Steps/**')!('Steps/Cart.cs')).toBe(true);
    expect(globTest('*.feature')!('Steps/Cart.cs')).toBe(false);
  });
  it('replaces literally, or with regex groups', async () => {
    const changed = await replaceInFiles(root, ['bin'], { query: 'CartPage', matchCase: true }, 'BasketPage');
    expect(changed).toEqual([{ file: 'Steps/Cart.cs', count: 1 }]);
    await replaceInFiles(root, ['bin'], { query: 'page\\.(\\w+)\\(\\)', regex: true }, 'page.$1Item()');
    expect(await fs.readFile(path.join(root, 'Steps/Cart.cs'), 'utf8')).toContain('page.AddItem()');
    expect(await fs.readFile(path.join(root, 'bin/Cart.cs'), 'utf8')).toBe('class Cart {}\n');
  });
});
