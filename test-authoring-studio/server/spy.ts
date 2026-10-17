import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer } from 'node:net';
import { supportedRoles } from './dictionaries.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spySnapshotsDir } from './settings.js';

/**
 * Spy (like Ranorex Spy's GUI object recognition, for web pages): a browser the user explores with Track — hover
 * highlights an element, click selects it — plus an element tree, element properties, and selector candidates that
 * are verified against the live page (how many elements each one matches) before they go into a dictionary.
 */

const freePort = () => new Promise<number>((ok, fail) => { const s = createServer(); s.on('error', fail); s.listen(0, '127.0.0.1', () => { const port = (s.address() as { port: number }).port; s.close(() => ok(port)); }); });

export type SpyElement = {
  id: number; tag: string; role: string; name: string; text: string; testId: string; idAttr: string; classes: string[];
  attributes: { name: string; value: string }[]; visible: boolean; enabled: boolean;
  rect: { x: number; y: number; width: number; height: number }; cssPath: string; xpath: string; path: { tag: string; role: string; name: string; id: number }[];
};
export type SpyTreeNode = { id: number; tag: string; role: string; name: string; testId: string; idAttr: string; children: SpyTreeNode[] };
export type Candidate = { type: string; value: string; count: number; status: 'unique' | 'multiple' | 'none' | 'error'; note?: string };

/**
 * In-page script (plain JavaScript text — a serialized TypeScript function would carry tsx's `__name` helpers).
 * window.__tasSpy: track(on), tree(), details(id), select(id), mark(elements), el(id).
 */
export const SPY_SCRIPT = String.raw`(() => {
  if (window.__tasSpy) return;
  const ids = new WeakMap(); const byId = new Map(); let next = 1;
  const idOf = (el) => { let i = ids.get(el); if (!i) { i = next++; ids.set(el, i); byId.set(i, el); } return i; };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'HEAD']);
  const INPUT_ROLES = { checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button', image: 'button', range: 'slider', number: 'spinbutton', search: 'searchbox' };
  const roleOf = (el) => {
    const r = el.getAttribute('role'); if (r) return r.split(' ')[0];
    const t = el.tagName;
    if (t === 'A') return el.hasAttribute('href') ? 'link' : '';
    if (t === 'BUTTON') return 'button';
    if (t === 'INPUT') return INPUT_ROLES[(el.type || 'text').toLowerCase()] || (el.type === 'hidden' ? '' : 'textbox');
    if (t === 'TEXTAREA') return 'textbox';
    if (t === 'SELECT') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (t === 'OPTION') return 'option';
    if (t === 'IMG') return el.getAttribute('alt') === '' ? 'presentation' : 'img';
    if (/^H[1-6]$/.test(t)) return 'heading';
    return ({ NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo', UL: 'list', OL: 'list', LI: 'listitem', TABLE: 'table', TR: 'row', TD: 'cell', TH: 'columnheader', FORM: 'form', DIALOG: 'dialog', ASIDE: 'complementary', ARTICLE: 'article', SECTION: el.hasAttribute('aria-label') ? 'region' : '', LABEL: '', P: 'paragraph' })[t] || '';
  };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map((i) => clean(document.getElementById(i)?.textContent)).filter(Boolean).join(' '); if (t) return t; }
    const al = el.getAttribute('aria-label'); if (al) return clean(al);
    if (el.labels && el.labels.length) return clean(el.labels[0].textContent);
    if (el.tagName === 'IMG') return clean(el.getAttribute('alt'));
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) return clean(el.value);
    const role = roleOf(el);
    if (['button', 'link', 'heading', 'option', 'tab', 'menuitem', 'cell', 'columnheader', 'listitem', 'checkbox', 'radio'].includes(role)) { const t = clean(el.textContent); if (t) return t.slice(0, 120); }
    return clean(el.getAttribute('title') || el.getAttribute('placeholder') || '');
  };
  const testIdOf = (el) => el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-test') || el.getAttribute('data-qa') || '';
  const cssPath = (el) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) { parts.unshift('#' + CSS.escape(e.id)); break; }
      const tag = e.tagName.toLowerCase(); const p = e.parentElement;
      const same = p ? [...p.children].filter((c) => c.tagName === e.tagName) : [];
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(e) + 1) + ')' : tag);
    }
    return parts.join(' > ');
  };
  const xpath = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const p = e.parentElement; const tag = e.tagName.toLowerCase();
      const same = p ? [...p.children].filter((c) => c.tagName === e.tagName) : [e];
      parts.unshift(same.length > 1 ? tag + '[' + (same.indexOf(e) + 1) + ']' : tag);
    }
    return '/' + parts.join('/');
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const details = (el) => {
    const r = el.getBoundingClientRect();
    const path = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) path.unshift({ tag: e.tagName.toLowerCase(), role: roleOf(e), name: nameOf(e).slice(0, 60), id: idOf(e) });
    return {
      id: idOf(el), tag: el.tagName.toLowerCase(), role: roleOf(el), name: nameOf(el), text: clean(el.innerText !== undefined ? el.innerText : el.textContent).slice(0, 300),
      testId: testIdOf(el), idAttr: el.id || '', classes: [...el.classList],
      attributes: [...el.attributes].map((a) => ({ name: a.name, value: a.value.slice(0, 500) })),
      visible: visible(el), enabled: !el.disabled && el.getAttribute('aria-disabled') !== 'true',
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      cssPath: cssPath(el), xpath: xpath(el), path,
    };
  };
  // Highlight frame (Ranorex-style red rectangle) with a role / name label.
  const box = document.createElement('div');
  box.setAttribute('data-tas-spy', '');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #e5484d;background:rgba(229,72,77,.12);display:none;box-sizing:border-box;transition:all 40ms';
  const tag = document.createElement('div');
  tag.style.cssText = 'position:absolute;left:-2px;bottom:100%;background:#e5484d;color:#fff;font:600 11px system-ui;padding:1px 6px;white-space:nowrap;border-radius:2px 2px 0 0';
  box.appendChild(tag);
  const marks = [];
  const attach = () => { if (!box.isConnected && document.body) document.documentElement.appendChild(box); };
  const show = (el) => {
    attach(); const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: Math.max(r.width, 2) + 'px', height: Math.max(r.height, 2) + 'px' });
    const role = roleOf(el); const name = nameOf(el);
    tag.textContent = (role || el.tagName.toLowerCase()) + (name ? ' "' + name.slice(0, 40) + '"' : '');
  };
  const clearMarks = () => { while (marks.length) marks.pop().remove(); };
  let tracking = false; let current = null;
  const own = (el) => el && el.closest && el.closest('[data-tas-spy]');
  document.addEventListener('mousemove', (e) => { if (!tracking) return; const el = document.elementFromPoint(e.clientX, e.clientY); if (el && !own(el) && el !== current) { current = el; show(el); } }, true);
  const swallow = (e) => { if (!tracking) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'submit'].forEach((t) => document.addEventListener(t, swallow, true));
  document.addEventListener('click', (e) => {
    if (!tracking) return; swallow(e);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && !own(el)) { current = el; show(el); try { window.__tasSpyPicked(details(el)); } catch (x) {} }
  }, true);
  window.addEventListener('scroll', () => { if (current && box.style.display !== 'none') show(current); }, true);
  const tree = (el, depth, budget) => {
    const kids = [];
    for (const c of el.children) {
      if (budget.n <= 0) break;
      if (SKIP.has(c.tagName) || own(c)) continue;
      budget.n--;
      kids.push({ id: idOf(c), tag: c.tagName.toLowerCase(), role: roleOf(c), name: nameOf(c).slice(0, 80), testId: testIdOf(c), idAttr: c.id || '', children: depth < 60 && c.tagName !== 'svg' ? tree(c, depth + 1, budget) : [] });
    }
    return kids;
  };
  window.__tasSpy = {
    track: (on) => { tracking = !!on; if (!on) { box.style.display = 'none'; current = null; } document.documentElement.style.cursor = on ? 'crosshair' : ''; },
    tree: () => [{ id: idOf(document.body), tag: 'body', role: '', name: clean(document.title).slice(0, 80), testId: '', idAttr: document.body.id || '', children: tree(document.body, 0, { n: 4000 }) }],
    details: (id) => { const el = byId.get(id); return el && el.isConnected ? details(el) : null; },
    select: (id) => { const el = byId.get(id); if (!el || !el.isConnected) return null; el.scrollIntoView({ block: 'center', inline: 'nearest' }); current = el; show(el); return details(el); },
    mark: (els) => { clearMarks(); attach(); for (const el of els.slice(0, 50)) { const r = el.getBoundingClientRect(); const m = document.createElement('div'); m.setAttribute('data-tas-spy', ''); m.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px dashed #3e63dd;background:rgba(62,99,221,.10);left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.width + 'px;height:' + r.height + 'px'; document.documentElement.appendChild(m); marks.push(m); } if (els[0]) els[0].scrollIntoView({ block: 'center' }); setTimeout(clearMarks, 4000); return els.length; },
    el: (id) => byId.get(id) || null,
    // Snapshot: the element tree plus every element's properties, for offline browsing.
    snapshot: () => { const t = window.__tasSpy.tree(); const all = []; const walk = (n) => n.forEach((x) => { all.push(x.id); walk(x.children); }); walk(t); const details = {}; for (const id of all) { const el = byId.get(id); if (el) details[id] = window.__tasSpy.details(id); } return { title: document.title, tree: t, details }; },
  };
})();`;

export class Spy {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  status: 'idle' | 'running' = 'idle';
  tracking = false;
  selected?: { element: SpyElement; candidates: Candidate[] };
  version = 0;
  cdpPort?: number;

  async start(url: string) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https URL.');
    await this.stop();
    // Tests (STUDIO_RECORDER_CDP=1) drive the Spy browser over CDP: headless on a free debugging port.
    this.cdpPort = process.env.STUDIO_RECORDER_CDP ? await freePort() : undefined;
    this.browser = await chromium.launch(this.cdpPort ? { headless: true, args: [`--remote-debugging-port=${this.cdpPort}`] } : { headless: false });
    this.context = await this.browser.newContext({ viewport: null });
    await this.context.exposeBinding('__tasSpyPicked', async (_src, d: SpyElement) => {
      this.selected = { element: d, candidates: await this.candidates(d) };
      this.version++;
    });
    await this.context.addInitScript({ content: SPY_SCRIPT });
    this.context.on('page', (p) => { this.page = p; p.on('load', () => void this.applyTracking()); });
    this.browser.on('disconnected', () => { this.status = 'idle'; this.browser = undefined; this.context = undefined; this.page = undefined; this.version++; });
    this.page = await this.context.newPage();
    this.page.on('load', () => void this.applyTracking());
    this.status = 'running';
    this.tracking = true;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.applyTracking();
    this.version++;
  }
  async stop() {
    const b = this.browser;
    this.browser = undefined; this.context = undefined; this.page = undefined; this.status = 'idle'; this.tracking = false;
    await b?.close().catch(() => {});
    this.version++;
  }
  private live() {
    const p = this.context?.pages().at(-1) ?? this.page;
    if (!p || p.isClosed()) throw new Error('Start Spy on a page first.');
    return p;
  }
  private async applyTracking() { try { await this.live().evaluate(`window.__tasSpy && window.__tasSpy.track(${this.tracking})`); } catch { /* navigating */ } }
  async track(on: boolean) { this.tracking = on; await this.applyTracking(); this.version++; }
  async tree(): Promise<SpyTreeNode[]> { return (await this.live().evaluate('window.__tasSpy ? window.__tasSpy.tree() : []')) as SpyTreeNode[]; }
  async select(id: number) {
    const d = (await this.live().evaluate(`window.__tasSpy.select(${Number(id)})`)) as SpyElement | null;
    if (!d) throw new Error('That element is no longer on the page. Refresh the element tree.');
    this.selected = { element: d, candidates: await this.candidates(d) };
    this.version++;
    return this.selected;
  }

  private locator(type: string, value: string) {
    const p = this.live();
    const t = type.toLowerCase();
    if (t === 'testid') return p.getByTestId(value);
    if (t === 'text') return p.getByText(value, { exact: true });
    if (t === 'css') return p.locator(value);
    if (t === 'xpath') return p.locator('xpath=' + value);
    if (t.startsWith('ariarole.')) return p.getByRole(t.slice(9) as never, { name: value, exact: true });
    return undefined;
  }
  /** How many elements a selector matches on the live page (and highlights them for a few seconds). */
  async verify(type: string, value: string, highlight = true): Promise<Candidate> {
    const loc = this.locator(type, value);
    if (!loc) return { type, value, count: 0, status: 'error', note: 'Unsupported selector type.' };
    try {
      const count = await loc.count();
      if (highlight) await loc.evaluateAll('(els) => window.__tasSpy.mark(els)').catch(() => {});
      return { type, value, count, status: count === 0 ? 'none' : count === 1 ? 'unique' : 'multiple' };
    } catch (e) {
      return { type, value, count: 0, status: 'error', note: (e as Error).message.split('\n')[0] };
    }
  }
  /**
   * Selector candidates in the dictionary's order of robustness — test id, role + accessible name, text, id / CSS
   * path, XPath — each verified against the page. Unique ones first.
   */
  async candidates(d: SpyElement): Promise<Candidate[]> {
    const list: { type: string; value: string }[] = [];
    if (d.testId) list.push({ type: 'testid', value: d.testId });
    if (d.role && d.name && supportedRoles.includes(d.role)) list.push({ type: `ariarole.${d.role}`, value: d.name });
    const text = d.text || d.name;
    if (text && text.length <= 60 && !['input', 'textarea', 'select'].includes(d.tag)) list.push({ type: 'text', value: text });
    if (d.cssPath) list.push({ type: 'css', value: d.cssPath });
    if (d.xpath) list.push({ type: 'xpath', value: d.xpath });
    const out: Candidate[] = [];
    for (const c of list) out.push(await this.verify(c.type, c.value, false));
    const rank = { unique: 0, multiple: 1, none: 2, error: 3 };
    return out.map((c, i) => ({ c, i })).sort((a, b) => rank[a.c.status] - rank[b.c.status] || a.i - b.i).map((x) => x.c);
  }
  async screenshot(id: number) {
    const handle = await this.live().evaluateHandle(`window.__tasSpy.el(${Number(id)})`);
    const el = handle.asElement() as import('playwright').ElementHandle | null;
    if (!el) throw new Error('That element is no longer on the page.');
    return (await el.screenshot({ timeout: 10_000 })).toString('base64');
  }
  /** Saves the page's element tree, every element's properties and a screenshot (JSON) for offline browsing. */
  async snapshot() {
    const p = this.live();
    const data = (await p.evaluate('window.__tasSpy.snapshot()')) as { title: string; tree: SpyTreeNode[]; details: Record<string, SpyElement> };
    const screenshot = (await p.screenshot({ type: 'jpeg', quality: 70 }).catch(() => undefined))?.toString('base64');
    const host = (() => { try { return new URL(p.url()).hostname.replace(/[^\w.-]+/g, '_') || 'page'; } catch { return 'page'; } })();
    const name = `${host}-${new Date().toISOString().replace(/[:.]/g, '-')}.spy.json`;
    await fs.mkdir(spySnapshotsDir, { recursive: true });
    await fs.writeFile(path.join(spySnapshotsDir, name), JSON.stringify({ format: 'tas-spy-snapshot/1', url: p.url(), takenAt: new Date().toISOString(), ...data, screenshot }));
    return { name, elements: Object.keys(data.details).length };
  }
  state() {
    return { status: this.status, tracking: this.tracking, url: this.page && !this.page.isClosed() ? this.page.url() : null, selected: this.selected ?? null, version: this.version, ...(this.cdpPort ? { cdpPort: this.cdpPort } : {}) };
  }
}
