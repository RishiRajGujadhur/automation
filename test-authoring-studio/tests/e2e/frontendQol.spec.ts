import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.setTimeout(120_000);

test('1: expands an HTML Emmet abbreviation with editable fields', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-emmet-'));
  try {
    await fs.writeFile(path.join(root, 'index.html'), 'ul>li.item*2');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'index.html', line: 1 } })));
    const editor = page.getByLabel('Source of index.html');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await editor.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Expand Emmet Abbreviation' }).click();
    await expect(editor).toContainText('<li class="item">');
    await expect(editor).toContainText('</ul>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'nav>ul>li*2' }, selection: { anchor: 'nav>ul>li*2'.length } });
      view.focus();
    });
    await page.keyboard.press('Tab');
    await expect(editor).toContainText('<nav>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Hello' }, selection: { anchor: 0, head: 5 } });
      view.focus();
    });
    page.once('dialog', (dialog) => void dialog.accept('section.card>p'));
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Wrap with Emmet Abbreviation…' }).click();
    await expect(editor).toContainText('<section class="card">');
    await expect(editor).toContainText('<p>Hello</p>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '<div><p>Hello</p></div>' }, selection: { anchor: 10 } });
      view.focus();
    });
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Select Enclosing HTML Element' }).click();
    await expect.poll(() => page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { sliceDoc(from: number, to: number): string; selection: { main: { from: number; to: number } } } } } }).__activeEditor().view;
      return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
    })).toBe('<p>Hello</p>');
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Select Enclosing HTML Element' }).click();
    await expect.poll(() => page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { sliceDoc(from: number, to: number): string; selection: { main: { from: number; to: number } } } } } }).__activeEditor().view;
      return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
    })).toBe('<div><p>Hello</p></div>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'ul>li.item*2' }, selection: { anchor: 'ul>li.item*2'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const emmetOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: 'ul>li.item*2' }) }).first();
    await expect(emmetOption).toBeVisible();
    await expect(emmetOption).toContainText('Emmet');
    await emmetOption.click();
    await expect(editor).toContainText('<li class="item">');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('3: expands a CSS Emmet property abbreviation', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-emmet-css-'));
  try {
    await fs.writeFile(path.join(root, 'style.css'), '.box { m10 }');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'style.css', line: 1 } })));
    const editor = page.getByLabel('Source of style.css');
    await expect(editor).toBeVisible();
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('m10') + 3 } });
      view.focus();
    });
    await editor.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Expand CSS Emmet Abbreviation' }).click();
    await expect(editor).toContainText('margin: 10px;');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '.box { p20 }' }, selection: { anchor: '.box { p20'.length } });
      view.focus();
    });
    await page.keyboard.press('Tab');
    await expect(editor).toContainText('padding: 20px;');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '.box { m10 }' }, selection: { anchor: '.box { m10'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const option = page.locator('.cm-tooltip-autocomplete li').filter({ hasText: 'margin: 10px;' }).first();
    await expect(option).toContainText('Emmet');
    await option.click();
    await expect(editor).toContainText('margin: 10px;');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('4: expands JSX Emmet with React className attributes', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-emmet-jsx-'));
  try {
    await fs.writeFile(path.join(root, 'component.tsx'), 'ul>li.item*2');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'component.tsx', line: 1 } })));
    const editor = page.getByLabel('Source of component.tsx');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await editor.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Expand JSX Emmet Abbreviation' }).click();
    await expect(editor).toContainText('className="item"');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'nav.links>a*2' }, selection: { anchor: 'nav.links>a*2'.length } });
      view.focus();
    });
    await page.keyboard.press('Tab');
    await expect(editor).toContainText('<nav className="links">');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Hello' }, selection: { anchor: 0, head: 5 } });
      view.focus();
    });
    page.once('dialog', (dialog) => void dialog.accept('section.card>p'));
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Wrap JSX with Emmet Abbreviation…' }).click();
    await expect(editor).toContainText('<section className="card">');
    await expect(editor).toContainText('<p>Hello</p>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'ul>li.item*2' }, selection: { anchor: 'ul>li.item*2'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const emmetOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: 'ul>li.item*2' }) }).first();
    await expect(emmetOption).toContainText('Emmet');
    await emmetOption.click();
    await expect(editor).toContainText('className="item"');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('13–14: Emmet Tab and completion can be disabled independently of the expand command', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-emmet-setting-'));
  try {
    await fs.writeFile(path.join(root, 'index.html'), 'ul>li.item*2');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => localStorage.setItem('tas:settings', JSON.stringify({ 'emmet.triggerExpansionOnTab': false, 'emmet.showExpandedAbbreviation': 'never' })));
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'index.html', line: 1 } })));
    const editor = page.getByLabel('Source of index.html');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Tab');
    await expect(editor).toContainText('ul>li.item*2');
    await expect(editor).not.toContainText('<li class="item">');
    await page.keyboard.press('Control+Space');
    await expect(page.locator('.cm-tooltip-autocomplete li').filter({ hasText: 'Emmet' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await editor.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Expand Emmet Abbreviation' }).click();
    await expect(editor).toContainText('<li class="item">');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('15: Emmet uses the configured XHTML self-closing style', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-emmet-closing-'));
  try {
    await fs.writeFile(path.join(root, 'index.html'), 'img');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => localStorage.setItem('tas:settings', JSON.stringify({ 'emmet.selfClosingStyle': 'xhtml' })));
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'index.html', line: 1 } })));
    const editor = page.getByLabel('Source of index.html');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await editor.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Expand Emmet Abbreviation' }).click();
    await expect(editor).toContainText('alt="" />');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
