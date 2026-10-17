import { chromium, type Browser, type BrowserContext } from 'playwright';
import { randomUUID } from 'node:crypto';
import type { Action } from '../src/types.js';
import { redact } from './core.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { tracesDir } from './settings.js';
import { createServer } from 'node:net';
const freePort = () => new Promise<number>((ok, fail) => { const srv = createServer(); srv.on('error', fail); srv.listen(0, '127.0.0.1', () => { const port = (srv.address() as { port: number }).port; srv.close(() => ok(port)); }); });
type Tracing = { enabled: boolean; screenshots: boolean; snapshots: boolean; sources: boolean };
/**
 * In-page capture script, as plain JavaScript text: a serialized TypeScript function would carry the compiler's
 * helpers (tsx adds `__name(...)` calls), which do not exist in the page and silently stop every listener.
 */
export const CAPTURE_SCRIPT = `(() => {
  const roles = { BUTTON: 'button', A: 'link', INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox' };
  const target = (el) => ({
    role: el.getAttribute('role') || (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) ? el.type : el.tagName === 'INPUT' && ['submit', 'button'].includes(el.type) ? 'button' : roles[el.tagName]),
    name: el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : '') || el.getAttribute('placeholder') || (el.tagName === 'INPUT' && el.value && ['submit', 'button'].includes(el.type) ? el.value : '') || (el.textContent || '').trim().slice(0, 100) || el.id,
    testId: el.getAttribute('data-testid') || undefined,
  });
  const send = (a) => { try { window.__studioRecord(a).catch(() => {}); } catch (e) {} };
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('button,a,input,select,textarea,[role],[data-testid]');
    // Clicking into a text field is not a step: typing into it is recorded as a fill.
    if (!el || (el.tagName === 'INPUT' && !['submit', 'button', 'checkbox', 'radio'].includes(el.type)) || el.tagName === 'TEXTAREA') return;
    send({ action: 'click', target: target(el) });
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!('value' in el) || ['checkbox', 'radio'].includes(el.type)) return;
    const sensitive = el.type === 'password' || /password|secret|token|credential|api.?key/i.test([el.name, el.id, el.autocomplete].join(' '));
    send({ action: 'fill', target: target(el), value: sensitive ? '[REDACTED]' : el.value, sensitive });
  }, true);
  document.addEventListener('keydown', (e) => {
    if (['Enter', 'Tab', 'Escape'].includes(e.key)) send({ action: 'press', key: e.key, target: target(e.target) });
  }, true);
})();`;
export class Recorder {
  browser?: Browser;
  context?: BrowserContext;
  actions: Action[] = [];
  status = 'idle';
  cdpPort?: number;
  private tracing = false;
  async start(url: string, headless = false, tracing?: Tracing) {
    if (this.browser) await this.stop();
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('Use an http or https URL.');
    this.actions = [];
    // Tests (STUDIO_RECORDER_CDP=1) drive the recording browser over CDP: headless, on a free debugging port that
    // GET /api/recording reports.
    this.cdpPort = process.env.STUDIO_RECORDER_CDP ? await freePort() : undefined;
    this.browser = await chromium.launch(this.cdpPort ? { headless: true, args: [`--remote-debugging-port=${this.cdpPort}`] } : { headless });
    this.context = await this.browser.newContext();
    this.tracing = !!tracing?.enabled;
    if (tracing?.enabled) await this.context.tracing.start({ screenshots: tracing.screenshots, snapshots: tracing.snapshots, sources: tracing.sources, title: 'TestAuthoring Studio recording' });
    this.status = 'recording';
    await this.context.exposeBinding('__studioRecord', (_, data: Omit<Action, 'id'>) => {
      if (this.status === 'recording') {
        const action = redact({ ...data, id: randomUUID() });
        const last = this.actions.at(-1);
        if (
          action.action === 'fill' &&
          last?.action === 'fill' &&
          JSON.stringify(last.target) === JSON.stringify(action.target)
        )
          this.actions[this.actions.length - 1] = action;
        else this.actions.push(action);
      }
    });
    await this.context.addInitScript({ content: CAPTURE_SCRIPT });
    this.context.on('page', (page) =>
      page.on('framenavigated', (frame) => {
        if (
          frame === page.mainFrame() &&
          this.status === 'recording' &&
          frame.url().startsWith('http')
        )
          this.actions.push(redact({ id: randomUUID(), action: 'goto', url: frame.url() }));
      }),
    );
    this.browser.on('disconnected', () => {
      this.status = 'stopped';
      this.browser = undefined;
      this.context = undefined;
    });
    const page = await this.context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  /**
   * Resolve dictionary selectors against a real page. Uses the live recording page when one is open
   * (no navigation), otherwise loads `url` in a throwaway headless browser. Read-only: counts matches only.
   */
  async verify(selectors: { type: string; value: string }[], url?: string) {
    const live = this.context?.pages().at(-1);
    let scratch: Browser | undefined;
    try {
      let page = live;
      if (!page) {
        if (!url) throw new Error('Start a recording or supply a page URL to verify selectors.');
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https URL.');
        scratch = await chromium.launch({ headless: true });
        page = await scratch.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      }
      const p = page;
      const results = [];
      for (const s of selectors) {
        const t = s.type.toLowerCase();
        const locator =
          t === 'testid' ? p.getByTestId(s.value)
          : t === 'text' ? p.getByText(s.value, { exact: true })
          : t === 'css' ? p.locator(s.value)
          : t === 'xpath' ? p.locator('xpath=' + s.value)
          : t.startsWith('ariarole.') ? p.getByRole(t.slice(9) as any, { name: s.value, exact: true })
          : undefined;
        if (!locator) { results.push({ ...s, status: 'unsupported' as const, count: 0 }); continue; }
        try {
          const count = await locator.count();
          const visible = count === 1 ? await locator.isVisible() : false;
          results.push({ ...s, count, visible, status: count === 0 ? 'none' as const : count === 1 ? 'verified' as const : 'multiple' as const });
        } catch (e) {
          results.push({ ...s, count: 0, status: 'error' as const, error: (e as Error).message.split('\n')[0] });
        }
      }
      return { url: redact({ id: 'v', action: 'goto', url: p.url() }).url, source: live ? 'live recording page' : 'headless page load', results };
    } finally {
      await scratch?.close();
    }
  }
  /** Stops recording; when tracing was on, saves a Playwright trace (.zip) and returns its path. */
  async stop(): Promise<string | undefined> {
    this.status = 'stopped';
    let trace: string | undefined;
    if (this.tracing && this.context) {
      await fs.mkdir(tracesDir, { recursive: true });
      trace = path.join(tracesDir, `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
      await this.context.tracing.stop({ path: trace }).catch(() => (trace = undefined));
      this.tracing = false;
    }
    await this.browser?.close();
    this.browser = undefined;
    this.context = undefined;
    return trace;
  }
}
