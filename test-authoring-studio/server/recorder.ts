import { chromium, type Browser, type BrowserContext } from 'playwright';
import { randomUUID } from 'node:crypto';
import type { Action } from '../src/types.js';
import { redact } from './core.js';
export class Recorder {
  browser?: Browser;
  context?: BrowserContext;
  actions: Action[] = [];
  status = 'idle';
  async start(url: string, headless = false) {
    if (this.browser) await this.stop();
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('Use an http or https URL.');
    this.actions = [];
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext();
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
    await this.context.addInitScript(() => {
      const target = (el: HTMLElement) => ({
        role:
          el.getAttribute('role') ||
          (
            { BUTTON: 'button', A: 'link', INPUT: 'textbox', SELECT: 'combobox' } as Record<
              string,
              string
            >
          )[el.tagName],
        name:
          el.getAttribute('aria-label') ||
          (el as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
          el.getAttribute('placeholder') ||
          el.textContent?.trim().slice(0, 100) ||
          el.id,
        testId: el.getAttribute('data-testid') || undefined,
      });
      const send = (a: unknown) => (window as any).__studioRecord(a).catch(() => {});
      document.addEventListener(
        'click',
        (e) => {
          const el = (e.target as HTMLElement).closest(
            'button,a,input,select,[role],[data-testid]',
          ) as HTMLElement;
          if (el) send({ action: 'click', target: target(el) });
        },
        true,
      );
      document.addEventListener(
        'input',
        (e) => {
          const el = e.target as HTMLInputElement;
          if (!('value' in el)) return;
          const sensitive =
            el.type === 'password' ||
            /password|secret|token|credential|api.?key/i.test(
              [el.name, el.id, el.autocomplete].join(' '),
            );
          send({
            action: 'fill',
            target: target(el),
            value: sensitive ? '[REDACTED]' : el.value,
            sensitive,
          });
        },
        true,
      );
      document.addEventListener(
        'keydown',
        (e) => {
          if (['Enter', 'Tab', 'Escape'].includes(e.key))
            send({ action: 'press', key: e.key, target: target(e.target as HTMLElement) });
        },
        true,
      );
    });
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
    });
    const page = await this.context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async stop() {
    this.status = 'stopped';
    await this.browser?.close();
    this.browser = undefined;
  }
}
