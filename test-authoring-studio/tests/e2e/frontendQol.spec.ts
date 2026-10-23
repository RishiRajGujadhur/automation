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
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Select Nested HTML Content' }).click();
    await expect.poll(() => page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { sliceDoc(from: number, to: number): string; selection: { main: { from: number; to: number } } } } } }).__activeEditor().view;
      return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
    })).toBe('<p>Hello</p>');
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Select Nested HTML Content' }).click();
    await expect.poll(() => page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { sliceDoc(from: number, to: number): string; selection: { main: { from: number; to: number } } } } } }).__activeEditor().view;
      return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
    })).toBe('Hello');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ selection: { anchor: 2 } });
      view.focus();
    });
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Go to Matching HTML Tag' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { head: number } } } } } }).__activeEditor().view.state.selection.main.head)).toBe(19);
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Go to Matching HTML Tag' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { head: number } } } } } }).__activeEditor().view.state.selection.main.head)).toBe(1);
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
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '.box {\n  flexc\n}' }, selection: { anchor: '.box {\n  flexc'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const flexOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^flexc$/ }) }).first();
    await expect(flexOption).toContainText('Flex container');
    await flexOption.click();
    await expect(editor).toContainText('display: flex;');
    await expect(editor).toContainText('align-items: center;');
    await expect(editor).toContainText('gap: 1rem;');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '.box {\n  gridc\n}' }, selection: { anchor: '.box {\n  gridc'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const gridOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^gridc$/ }) }).first();
    await expect(gridOption).toContainText('Grid container');
    await gridOption.click();
    await expect(editor).toContainText('grid-template-columns: repeat(2, minmax(0, 1fr));');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'mediaq' }, selection: { anchor: 6 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const mediaOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^mediaq$/ }) }).first();
    await expect(mediaOption).toContainText('Responsive media query');
    await mediaOption.click();
    await expect(editor).toContainText('@media (min-width: 768px) {');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'containerq' }, selection: { anchor: 10 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const containerOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^containerq$/ }) }).first();
    await expect(containerOption).toContainText('Container query');
    await containerOption.click();
    await expect(editor).toContainText('@container (min-width: 30rem) {');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'focusv' }, selection: { anchor: 6 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const focusOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^focusv$/ }) }).first();
    await expect(focusOption).toContainText('Visible keyboard focus');
    await focusOption.click();
    await expect(editor).toContainText('.control:focus-visible {');
    await expect(editor).toContainText('outline-offset: 2px;');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '.cards {\n  autogrid\n}' }, selection: { anchor: '.cards {\n  autogrid'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const autoGridOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^autogrid$/ }) }).first();
    await expect(autoGridOption).toContainText('Responsive auto-fit grid');
    await autoGridOption.click();
    await expect(editor).toContainText('repeat(auto-fit, minmax(min(100%, 16rem), 1fr))');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'reduceMotion' }, selection: { anchor: 12 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const motionOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^reduceMotion$/ }) }).first();
    await expect(motionOption).toContainText('Reduced motion override');
    await motionOption.click();
    await expect(editor).toContainText('@media (prefers-reduced-motion: reduce)');
    await expect(editor).toContainText('transition: none;');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'darkScheme' }, selection: { anchor: 10 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const darkOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^darkScheme$/ }) }).first();
    await expect(darkOption).toContainText('System dark color scheme');
    await darkOption.click();
    await expect(editor).toContainText('@media (prefers-color-scheme: dark)');
    await expect(editor).toContainText('color-scheme: dark;');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '.heading {\n  fluidType\n}' }, selection: { anchor: '.heading {\n  fluidType'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const fluidOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^fluidType$/ }) }).first();
    await expect(fluidOption).toContainText('Fluid type scale');
    await fluidOption.click();
    await expect(editor).toContainText('font-size: clamp(1rem, calc(1rem + 1vw), 2rem);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'srOnly' }, selection: { anchor: 6 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const srOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^srOnly$/ }) }).first();
    await expect(srOption).toContainText('Screen-reader-only utility');
    await srOption.click();
    await expect(editor).toContainText('.sr-only {');
    await expect(editor).toContainText('clip: rect(0, 0, 0, 0);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '.box {\n  logicalBox\n}' }, selection: { anchor: '.box {\n  logicalBox'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const logicalOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^logicalBox$/ }) }).first();
    await expect(logicalOption).toContainText('Direction-aware spacing');
    await logicalOption.click();
    await expect(editor).toContainText('padding-inline: 1.5rem;');
    await expect(editor).toContainText('margin-inline: auto;');
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

test('18: TSX component snippet uses the file name', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-react-snippets-'));
  try {
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'UserCard.tsx'), 'rfc');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'src/UserCard.tsx', line: 1 } })));
    const editor = page.getByLabel('Source of src/UserCard.tsx');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+Space');
    const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^rfc$/ }) }).first();
    await expect(option).toContainText('React function component');
    await option.click();
    await expect(editor).toContainText('export function UserCard()');
    await expect(editor).toContainText('return <div></div>;');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'rfcp' }, selection: { anchor: 4 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const propsOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^rfcp$/ }) }).first();
    await expect(propsOption).toContainText('typed props');
    await propsOption.click();
    await expect(editor).toContainText('type UserCardProps = {');
    await expect(editor).toContainText('export function UserCard({ title }: UserCardProps)');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('31: React state snippet adds one import after use client', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-hook-snippets-'));
  try {
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'Counter.tsx'), "'use client';\nstate");
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'src/Counter.tsx', line: 1 } })));
    const editor = page.getByLabel('Source of src/Counter.tsx');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+Space');
    const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^state$/ }) }).first();
    await expect(option).toContainText('React state hook with import');
    await option.click();
    const source = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(source).toMatch(/^'use client';\nimport \{ useState \} from 'react';\n/);
    expect(source).toContain('const [value, setValue] = useState(initialValue);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\neffect" }, selection: { anchor: "'use client';\neffect".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const effectOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^effect$/ }) }).first();
    await expect(effectOption).toContainText('React effect hook with import');
    await effectOption.click();
    const effectSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(effectSource).toMatch(/^'use client';\nimport \{ useEffect \} from 'react';\n/);
    expect(effectSource).toContain('useEffect(() => {');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\nmemoValue" }, selection: { anchor: "'use client';\nmemoValue".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const memoOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^memoValue$/ }) }).first();
    await expect(memoOption).toContainText('React memoized value with import');
    await memoOption.click();
    const memoSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(memoSource).toContain("import { useMemo } from 'react';");
    expect(memoSource).toContain('const result = useMemo(() => compute(), []);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\ncallback" }, selection: { anchor: "'use client';\ncallback".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const callbackOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^callback$/ }) }).first();
    await expect(callbackOption).toContainText('React memoized callback with import');
    await callbackOption.click();
    const callbackSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(callbackSource).toContain("import { useCallback } from 'react';");
    expect(callbackSource).toContain('const handleAction = useCallback(() => {');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\ndomRef" }, selection: { anchor: "'use client';\ndomRef".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const refOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^domRef$/ }) }).first();
    await expect(refOption).toContainText('Typed React DOM ref with import');
    await refOption.click();
    const refSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(refSource).toContain("import { useRef } from 'react';");
    expect(refSource).toContain('const elementRef = useRef<HTMLDivElement | null>(null);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\nreducer" }, selection: { anchor: "'use client';\nreducer".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const reducerOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^reducer$/ }) }).first();
    await expect(reducerOption).toContainText('React reducer hook with import');
    await reducerOption.click();
    const reducerSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(reducerSource).toContain("import { useReducer } from 'react';");
    expect(reducerSource).toContain('const [state, dispatch] = useReducer(reducer, initialState);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\nstableId" }, selection: { anchor: "'use client';\nstableId".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const idOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^stableId$/ }) }).first();
    await expect(idOption).toContainText('React accessible ID with import');
    await idOption.click();
    const idSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(idSource).toContain("import { useId } from 'react';");
    expect(idSource).toContain('const id = useId();');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\ntransition" }, selection: { anchor: "'use client';\ntransition".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const transitionOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^transition$/ }) }).first();
    await expect(transitionOption).toContainText('React transition state with import');
    await transitionOption.click();
    const transitionSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(transitionSource).toContain("import { useTransition } from 'react';");
    expect(transitionSource).toContain('const [isPending, startTransition] = useTransition();');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\ndeferredValue" }, selection: { anchor: "'use client';\ndeferredValue".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const deferredOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^deferredValue$/ }) }).first();
    await expect(deferredOption).toContainText('React deferred value with import');
    await deferredOption.click();
    const deferredSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(deferredSource).toContain("import { useDeferredValue } from 'react';");
    expect(deferredSource).toContain('const deferredValue = useDeferredValue(value);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "'use client';\ncontextValue" }, selection: { anchor: "'use client';\ncontextValue".length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const contextOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^contextValue$/ }) }).first();
    await expect(contextOption).toContainText('React context value with import');
    await contextOption.click();
    const contextSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(contextSource).toContain("import { useContext } from 'react';");
    expect(contextSource).toContain('const value = useContext(Context);');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('41: React hook snippet extends an existing named React import', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-hook-merge-'));
  try {
    await fs.writeFile(path.join(root, 'Counter.tsx'), "import { useState } from 'react';\neffect");
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'Counter.tsx', line: 1 } })));
    const editor = page.getByLabel('Source of Counter.tsx');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+Space');
    await page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^effect$/ }) }).first().click();
    const source = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(source).toMatch(/^import \{ useState, useEffect \} from 'react';\n/);
    expect(source).toContain('useEffect(() => {');
    expect(source.match(/from 'react'/g)).toHaveLength(1);
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      const next = "import { useState, } from 'react';\neffect";
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: next.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    await page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^effect$/ }) }).first().click();
    const trailingCommaSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(trailingCommaSource).toMatch(/^import \{ useState, useEffect \} from 'react';\n/);
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      const next = "import { type useEffect as EffectType } from 'react';\neffect";
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: next.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    await page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^effect$/ }) }).first().click();
    const typeOnlySource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(typeOnlySource).toMatch(/^import \{ type useEffect as EffectType, useEffect \} from 'react';\n/);
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('44: layout effect snippet inserts hook and import', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-layout-effect-'));
  try {
    await fs.writeFile(path.join(root, 'Measure.tsx'), "'use client';\nlayoutEffect");
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'Measure.tsx', line: 1 } })));
    const editor = page.getByLabel('Source of Measure.tsx');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+Space');
    const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^layoutEffect$/ }) }).first();
    await expect(option).toContainText('React layout effect with import');
    await option.click();
    const source = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(source).toMatch(/^'use client';\nimport \{ useLayoutEffect \} from 'react';\n/);
    expect(source).toContain('useLayoutEffect(() => {');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'externalStore' }, selection: { anchor: 13 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const storeOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^externalStore$/ }) }).first();
    await expect(storeOption).toContainText('external store subscription');
    await storeOption.click();
    const storeSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(storeSource).toContain("import { useSyncExternalStore } from 'react';");
    expect(storeSource).toContain('useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'listItems' }, selection: { anchor: 9 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const listOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^listItems$/ }) }).first();
    await expect(listOption).toContainText('keyed React list');
    await listOption.click();
    const listSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(listSource).toContain('{items.map((item) => (');
    expect(listSource).toContain('<li key={item.id}>{item.name}</li>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'emptyState' }, selection: { anchor: 10 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const emptyOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^emptyState$/ }) }).first();
    await expect(emptyOption).toContainText('List with empty state');
    await emptyOption.click();
    const emptySource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(emptySource).toContain('items.length === 0 ?');
    expect(emptySource).toContain('<p>No items yet</p>');
    expect(emptySource).toContain('<li key={item.id}>{item.name}</li>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'labeledInput' }, selection: { anchor: 12 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const inputOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^labeledInput$/ }) }).first();
    await expect(inputOption).toContainText('Accessible React label');
    await inputOption.click();
    const inputSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(inputSource).toContain('<label htmlFor="field">Label</label>');
    expect(inputSource).toContain('<input id="field" name="field" type="text" />');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'pendingButton' }, selection: { anchor: 13 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const buttonOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^pendingButton$/ }) }).first();
    await expect(buttonOption).toContainText('pending and busy states');
    await buttonOption.click();
    const buttonSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(buttonSource).toContain('disabled={isPending} aria-busy={isPending}');
    expect(buttonSource).toContain('isPending ? "Saving…" : "Save"');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'responsiveImage' }, selection: { anchor: 15 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const imageOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^responsiveImage$/ }) }).first();
    await expect(imageOption).toContainText('Responsive React picture');
    await imageOption.click();
    const imageSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(imageSource).toContain('<source media="(min-width: 768px)" srcSet="/images/large.webp" />');
    expect(imageSource).toContain('alt="Describe the image" loading="lazy" decoding="async"');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'validatedInput' }, selection: { anchor: 14 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const validationOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^validatedInput$/ }) }).first();
    await expect(validationOption).toContainText('linked to validation message');
    await validationOption.click();
    const validationSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(validationSource).toContain('aria-invalid={hasError}');
    expect(validationSource).toContain('aria-describedby={hasError ? "field-error" : undefined}');
    expect(validationSource).toContain('<p id="field-error" role="alert">Error message</p>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'actionState' }, selection: { anchor: 11 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const actionOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^actionState$/ }) }).first();
    await expect(actionOption).toContainText('action state and pending');
    await actionOption.click();
    const actionSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(actionSource).toContain("import { useActionState } from 'react';");
    expect(actionSource).toContain('const [state, dispatchAction, isPending] = useActionState(action, initialState);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'optimisticState' }, selection: { anchor: 15 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const optimisticOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^optimisticState$/ }) }).first();
    await expect(optimisticOption).toContainText('optimistic UI state');
    await optimisticOption.click();
    const optimisticSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(optimisticSource).toContain("import { useOptimistic } from 'react';");
    expect(optimisticSource).toContain('const [optimisticValue, setOptimisticValue] = useOptimistic(value);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'formStatus' }, selection: { anchor: 10 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const formOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^formStatus$/ }) }).first();
    await expect(formOption).toContainText('form pending status');
    await formOption.click();
    const formSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(formSource).toContain("import { useFormStatus } from 'react-dom';");
    expect(formSource).toContain('const { pending } = useFormStatus();');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'lazyComponent' }, selection: { anchor: 13 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const lazyOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^lazyComponent$/ }) }).first();
    await expect(lazyOption).toContainText('Lazy-load a React component');
    await lazyOption.click();
    const lazySource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(lazySource).toContain("import { lazy } from 'react';");
    expect(lazySource).toContain('const DetailsPanel = lazy(() => import("./DetailsPanel"));');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'suspenseBoundary' }, selection: { anchor: 16 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const suspenseOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^suspenseBoundary$/ }) }).first();
    await expect(suspenseOption).toContainText('loading boundary');
    await suspenseOption.click();
    const suspenseSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(suspenseSource).toContain("import { Suspense } from 'react';");
    expect(suspenseSource).toContain('<Suspense fallback={<p role="status">Loading…</p>}>');
    expect(suspenseSource).toContain('<DetailsPanel />');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('48: CSS safe-area snippet preserves viewport insets', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-css-layout-snippets-'));
  try {
    await fs.writeFile(path.join(root, 'layout.css'), 'safeArea');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'layout.css', line: 1 } })));
    const editor = page.getByLabel('Source of layout.css');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+Space');
    const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^safeArea$/ }) }).first();
    await expect(option).toContainText('Viewport safe-area padding');
    await option.click();
    const source = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(source).toContain('env(safe-area-inset-top)');
    expect(source).toContain('env(safe-area-inset-right)');
    expect(source).toContain('env(safe-area-inset-bottom)');
    expect(source).toContain('env(safe-area-inset-left)');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'stickyHeader' }, selection: { anchor: 12 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const stickyOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^stickyHeader$/ }) }).first();
    await expect(stickyOption).toContainText('Sticky header');
    await stickyOption.click();
    const stickySource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(stickySource).toContain('position: sticky;');
    expect(stickySource).toContain('z-index: 10;');
    expect(stickySource).toContain('background: var(--surface, #fff);');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'supportsFeature' }, selection: { anchor: 15 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const supportsOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^supportsFeature$/ }) }).first();
    await expect(supportsOption).toContainText('CSS feature query');
    await supportsOption.click();
    const supportsSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(supportsSource).toContain('@supports (display: grid) {');
    expect(supportsSource).toContain('.selector {');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'scrollSnap' }, selection: { anchor: 10 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const snapOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^scrollSnap$/ }) }).first();
    await expect(snapOption).toContainText('scroll-snap container and items');
    await snapOption.click();
    const snapSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(snapSource).toContain('scroll-snap-type: x mandatory;');
    expect(snapSource).toContain('scroll-snap-align: start;');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('61: HTML disclosure snippet appears in markup completion', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-html-snippets-'));
  try {
    await fs.writeFile(path.join(root, 'index.html'), 'detailsDisclosure');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'index.html', line: 1 } })));
    const editor = page.getByLabel('Source of index.html');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+Space');
    const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^detailsDisclosure$/ }) }).first();
    await expect(option).toContainText('Native accessible disclosure');
    await option.click();
    await expect(editor).toContainText('<summary>More information</summary>');
    await expect(editor).toContainText('<p>Details go here.</p>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'nativeDialog' }, selection: { anchor: 12 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const dialogOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^nativeDialog$/ }) }).first();
    await expect(dialogOption).toContainText('Labeled native dialog');
    await dialogOption.click();
    await expect(editor).toContainText('aria-labelledby="details-dialog-title"');
    await expect(editor).toContainText('<form method="dialog">');
    await expect(editor).toContainText('<button type="submit">Close</button>');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'skipLink' }, selection: { anchor: 8 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const skipOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^skipLink$/ }) }).first();
    await expect(skipOption).toContainText('Keyboard skip link');
    await skipOption.click();
    await expect(editor).toContainText('href="#main-content"');
    await expect(editor).toContainText('<main id="main-content">');
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'radioGroup' }, selection: { anchor: 10 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const radioOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^radioGroup$/ }) }).first();
    await expect(radioOption).toContainText('Labeled radio group');
    await radioOption.click();
    await expect(editor).toContainText('<legend>Choose an option</legend>');
    const radioSource = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
    expect(radioSource.match(/name="choice"/g)).toHaveLength(2);
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'pictureSources' }, selection: { anchor: 14 } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const pictureOption = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^pictureSources$/ }) }).first();
    await expect(pictureOption).toContainText('Modern image formats');
    await pictureOption.click();
    await expect(editor).toContainText('type="image/avif"');
    await expect(editor).toContainText('type="image/webp"');
    await expect(editor).toContainText('width="800" height="600" loading="lazy"');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
