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
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
