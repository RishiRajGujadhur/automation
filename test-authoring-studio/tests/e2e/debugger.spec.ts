import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Debugs the runnable SpecFlow sample (samples/Calculator) in a temporary copy, with the default VS Code layout.
const debuggerExe = path.resolve(import.meta.dirname, '../../../.tools/netcoredbg/netcoredbg.exe');
test.skip(!existsSync(debuggerExe), 'netcoredbg is not installed (npm run debugger:setup).');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(240_000);

test('breakpoint on a feature line, step into the C# step, watch, step out, call stack, continue to the end', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-debug-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await page.getByRole('button', { name: 'Add.feature', exact: true }).first().click();
    const line = (text: string) => page.locator('.gherkin-editor .cm-line', { hasText: text });
    await expect(line('the two numbers are added')).toBeVisible({ timeout: 20_000 });

    // F9 on the cursor line sets a breakpoint (a red dot in the margin).
    await line('the two numbers are added').click();
    await page.keyboard.press('F9');
    await expect(page.locator('.gherkin-editor .cm-breakpoint-gutter .cm-bp:not(.pending):visible')).toBeVisible();
    await expect.poll(async () => (await (await request.get('/api/debug')).json()).breakpoints['Features/Add.feature']?.map((b: { line: number }) => b.line)).toEqual([6]);

    // F5: build, run the feature's tests under the debugger, stop on the Gherkin step.
    await page.keyboard.press('F5');
    const panel = page.getByRole('region', { name: 'Debugger' });
    await expect(panel.getByRole('status')).toHaveText(/Paused · breakpoint/, { timeout: 180_000 });
    await expect(page).toHaveTitle(/Debugging \(paused\)/); // QL98
    await expect(page.locator('.gherkin-editor .cm-exec-line')).toHaveText(/When the two numbers are added/);
    await expect(panel).toBeInViewport();
    await page.screenshot({ path: 'test-results/debugger-feature-breakpoint.png' });

    // F11: Step Into goes from the Gherkin step into its C# step definition.
    await page.keyboard.press('F11');
    await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/CalculatorSteps.cs');
    await expect(page.locator('.code-editor .cm-exec-line')).toBeVisible();
    await page.keyboard.press('F10');
    await expect(page.locator('.code-editor .cm-exec-line')).toHaveText(/result = calculator.Add\(\);/);

    // Watch window: expressions evaluate in the current frame.
    await panel.getByRole('tab', { name: 'Watch 1' }).click();
    await panel.getByLabel('Add item to watch').fill('calculator.First + calculator.Second');
    await panel.getByLabel('Add item to watch').press('Enter');
    await expect(panel.getByRole('treegrid', { name: 'Watch 1' })).toContainText('120');

    // Step Into a method, then Step Out back to the caller.
    await page.keyboard.press('F11');
    await expect(page.locator('.code-editor .cm-exec-line')).toHaveText(/\{/);
    await panel.getByRole('tab', { name: 'Call Stack' }).click();
    await expect(panel.getByRole('list', { name: 'Call Stack' })).toContainText('Calculator.Calculator.Add()');
    await expect(panel.getByRole('list', { name: 'Call Stack' })).toContainText('[External Code]');
    await page.keyboard.press('Shift+F11');
    await expect(page.locator('.code-editor .cm-exec-line')).toHaveText(/result = calculator.Add\(\);/);

    // Locals show the step class and expand on demand.
    await panel.getByRole('tab', { name: 'Locals' }).click();
    await panel.getByRole('button', { name: 'Expand this' }).click();
    await expect(panel.getByRole('treegrid', { name: 'Locals' })).toContainText('calculator');
    await expect(panel.getByRole('button', { name: 'Copy All as JSON' })).toBeVisible(); // Y57
    await page.screenshot({ path: 'test-results/debugger-step-out.png' });

    // Autos: variables of the current and previous line.
    await panel.getByRole('tab', { name: 'Autos' }).click();
    await expect(panel.getByRole('treegrid', { name: 'Autos' })).toContainText('calculator');
    // Immediate window: evaluate an expression in the paused frame.
    await panel.getByRole('tab', { name: 'Immediate' }).click();
    await panel.getByLabel('Immediate expression').fill('calculator.First * 2');
    await panel.getByLabel('Immediate expression').press('Enter');
    await expect(panel.getByRole('log', { name: 'Immediate results' })).toContainText('100');
    // Run To Cursor (Ctrl+F10): continue to the assertion of the Then step.
    await page.getByLabel('Source of Steps/CalculatorSteps.cs').locator('.cm-line', { hasText: 'Assert.That(result' }).click();
    await page.keyboard.press('Control+F10');
    await expect(page.locator('.code-editor:not([hidden]) .cm-exec-line')).toHaveText(/Assert\.That\(result/, { timeout: 30_000 });

    // F5: continue to the end; the test passes.
    await page.keyboard.press('F5');
    await expect(panel.getByRole('status')).toHaveText(/Ended · Tests passed/, { timeout: 60_000 });
    await panel.getByRole('tab', { name: 'Output' }).click();
    await expect(panel.getByLabel('Debug output')).toContainText('Passed');
  } finally {
    await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
    await request.post('/api/workspace', { data: previous });
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('Breakpoint settings: hit count (right-click in the margin), tracepoint log message, condition, disable', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-bp-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\/](bin|obj)$/.test(s) });
  const state = async () => (await (await request.get('/api/debug')).json()) as { status: string; output: string; frames: { id: number; file?: string; line: number }[] };
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(temp, 'Calculator.csproj') } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: 'CalculatorTests.cs', exact: true }).first().click();
    const editor = page.getByLabel('Source of Tests/CalculatorTests.cs');
    const caseLine = editor.locator('.cm-line', { hasText: 'var calculator = new Calculator { First = first' });
    await caseLine.click();
    await page.keyboard.press('F9');
    // Right-click the red dot: Breakpoint Settings; break on the 2nd hit only.
    const dot = page.locator('.code-editor:not([hidden]) .cm-breakpoint-gutter .cm-bp:visible');
    await dot.click({ button: 'right' });
    const settings = page.getByRole('form', { name: /Breakpoint settings for Tests\/CalculatorTests\.cs/ });
    await settings.getByLabel('Hit count').fill('2');
    await settings.getByRole('button', { name: 'Close' }).click();
    await expect(dot).toHaveClass(/conditional/);
    await expect(page.getByRole('region', { name: 'Debugger' }).getByText('hit count 2')).toBeVisible();

    // A tracepoint in Calculator.Add logs both cases and does not stop.
    const steps = 'Steps/CalculatorSteps.cs';
    const addLine = (await fs.readFile(path.join(temp, steps), 'utf8')).split(/\r?\n/).findIndex((l) => l.includes('var sum = First + Second;')) + 1;
    await request.post('/api/debug/breakpoints', { data: { file: steps, breakpoints: [{ line: addLine, logMessage: 'sum of {First} and {Second}' }] } });

    await request.post('/api/debug/start', { data: { project: 'Calculator.csproj', filter: 'FullyQualifiedName~Calculator.Tests.CalculatorTests.AddsCases' } });
    // A second start while the session runs is refused, and the server keeps running (it used to crash).
    const again = await request.post('/api/debug/start', { data: { project: 'Calculator.csproj' } });
    expect(again.status()).toBe(409);
    expect((await again.json()).error).toContain('already running');
    expect((await request.get('/api/health')).ok()).toBe(true);
    await expect.poll(async () => (await state()).status, { timeout: 240_000, intervals: [1000] }).toBe('paused');
    let s = await state();
    expect(s.frames[0]).toMatchObject({ file: 'Tests/CalculatorTests.cs' });
    // Paused on the second hit: the second case runs (first = -4); the tracepoint already logged the first case.
    const [first] = await (await request.post('/api/debug/evaluate', { data: { expressions: ['first'], frameId: s.frames[0].id } })).json();
    expect(first.result).toBe('-4');
    expect(s.output).toMatch(/\[Tracepoint\] Steps\/CalculatorSteps\.cs:\d+: sum of 1 and 1/);
    await request.post('/api/debug/control', { data: { action: 'continue' } });
    await expect.poll(async () => (await state()).status, { timeout: 60_000 }).toBe('ended');
    s = await state();
    expect(s.output).toMatch(/sum of -4 and 4/);
  } finally {
    await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('Exception Settings: break on all thrown exceptions stops on a caught one; unhandled-only runs through', async ({ request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-exc-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\/](bin|obj)$/.test(s) });
  const tests = path.join(temp, 'Tests/CalculatorTests.cs');
  await fs.writeFile(tests, (await fs.readFile(tests, 'utf8')).replace(/\}\s*$/, '\n    [Test]\n    public void CatchesInside()\n    {\n        try { throw new InvalidOperationException("boom"); } catch (InvalidOperationException) { }\n    }\n}\n'));
  const state = async () => (await (await request.get('/api/debug')).json()) as { status: string; reason?: string; exception?: string };
  const run = async () => {
    await request.post('/api/debug/start', { data: { project: 'Calculator.csproj', filter: 'FullyQualifiedName=Calculator.Tests.CalculatorTests.CatchesInside' } });
    await expect.poll(async () => (await state()).status, { timeout: 240_000, intervals: [1000] }).toMatch(/paused|ended/);
    return state();
  };
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(temp, 'Calculator.csproj') } })).ok()).toBe(true);
    await request.post('/api/debug/exceptions', { data: { breakOn: 'all' } });
    let s = await run();
    expect(s.status).toBe('paused');
    expect(s.reason).toBe('exception');
    expect(s.exception).toContain('InvalidOperationException');
    await request.post('/api/debug/control', { data: { action: 'stop' } });
    await request.post('/api/debug/exceptions', { data: { breakOn: 'unhandled' } });
    s = await run();
    expect(s.status).toBe('ended');
  } finally {
    await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
    await request.post('/api/debug/exceptions', { data: { breakOn: 'unhandled' } }).catch(() => {});
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('Z12 Temporary breakpoint: removed once the debugger stops on it', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-debug-tmp-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await page.getByRole('button', { name: 'Add.feature', exact: true }).first().click();
    const line = page.locator('.gherkin-editor .cm-line', { hasText: 'the two numbers are added' });
    await expect(line).toBeVisible({ timeout: 20_000 });
    await line.click();
    await page.getByRole('button', { name: 'Tools menu' }).click();
    await page.getByRole('menuitem', { name: /^Toggle Temporary Breakpoint/ }).click();
    const bps = async () => (await (await request.get('/api/debug')).json()).breakpoints['Features/Add.feature']?.map((b: { line: number }) => b.line) ?? [];
    await expect.poll(bps).toEqual([6]);
    await page.keyboard.press('F5');
    const panel = page.getByRole('region', { name: 'Debugger' });
    await expect(panel.getByRole('status')).toHaveText(/Paused · breakpoint/, { timeout: 180_000 });
    await expect.poll(bps).toEqual([]);
    await page.keyboard.press('F5');
    await expect.poll(async () => (await (await request.get('/api/debug')).json()).state?.status ?? (await (await request.get('/api/debug')).json()).status, { timeout: 120_000 }).toMatch(/ended|idle/);
  } finally {
    await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
    await request.post('/api/workspace', { data: previous });
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
