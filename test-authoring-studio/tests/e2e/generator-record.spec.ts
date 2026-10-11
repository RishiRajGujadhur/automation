import { test, expect } from '@playwright/test';

// The real browser capture is covered by tests/recorder.test.ts; here the recording API is stubbed.
test('Record steps in the Test Generator appends Gherkin and offers selector changes', async ({ page }) => {
  let state = 'idle';
  const actions = [
    { id: 'a1', action: 'goto', url: 'https://shop.test/' },
    { id: 'a2', action: 'click', target: { role: 'button', name: 'Place order', testId: 'place-order' } },
  ];
  await page.route('**/api/recording/clear', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/recording/start', (r) => { state = 'recording'; return r.fulfill({ json: { status: state } }); });
  await page.route('**/api/recording/stop', (r) => { state = 'stopped'; return r.fulfill({ json: { status: state, trace: null } }); });
  await page.route('**/api/recording', (r) => r.fulfill({ json: { status: state, actions: state === 'idle' ? [] : actions } }));
  await page.route('**/api/recording/match', (r) => r.fulfill({ json: actions.map((a) => ({ action: a, candidates: [] })) }));
  await page.goto('/#/test-generator');
  await page.getByRole('tab', { name: /Step 1: Scenario steps/ }).click();
  await page.getByRole('button', { name: 'Record steps with Playwright' }).click();
  await page.getByLabel('Start URL').fill('https://shop.test/');
  await page.getByRole('region', { name: 'Record steps with Playwright' }).getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByRole('button', { name: /^Stop/ }).click();
  const editor = page.getByLabel('Scenario text');
  await expect(editor).toContainText('And the user opens "https://shop.test/"');
  await expect(editor).toContainText('When the user clicks the "Place order" button');
  await expect(page.getByText('Selectors from this recording')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Existing \(\d+\)/ })).toBeVisible();
  await expect(page.locator('.step-lint')).toContainText('needs binding');
});
