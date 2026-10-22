import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

// Diagnostic helper (skipped unless A11Y_REPORT=1): writes every violating node to test-results/a11y.json.
test.skip(!process.env.A11Y_REPORT, 'diagnostic only');
test('a11y report', async ({ page }) => {
  const out: unknown[] = [];
  for (const url of ['/#/dashboard', '/#/test-generator', '/#/features/editor', '/#/features/builder', '/#/features/recorder', '/#/dictionary-inspector', '/#/step-catalog', '/#/backgrounds', '/#/selectors', '/#/project-explorer', '/#/config']) {
    await page.goto(url);
    await page.getByText('Repository indexed').waitFor();
    await page.waitForTimeout(600);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    for (const v of r.violations) for (const n of v.nodes) out.push({ url, id: v.id, target: n.target.join(' '), html: n.html.slice(0, 160), summary: n.failureSummary?.slice(0, 260) });
  }
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(300);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  for (const v of r.violations) for (const n of v.nodes) out.push({ url: 'prefs', id: v.id, target: n.target.join(' '), html: n.html.slice(0, 160), summary: n.failureSummary?.slice(0, 260) });
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/a11y.json', JSON.stringify(out, null, 1));
});
