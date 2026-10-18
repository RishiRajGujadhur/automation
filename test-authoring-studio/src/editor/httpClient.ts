import { Prec, RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter, keymap } from '@codemirror/view';

/**
 * HTTP Client (Rider's .http / .rest files): requests separated by ###, "METHOD URL" then headers, a blank line and
 * the body. `@name = value` lines define variables used as {{name}}; {{$guid}}, {{$timestamp}}, {{$randomInt}} too.
 */
export type HttpRequest = { line: number; method: string; url: string; headers: Record<string, string>; body: string; name?: string };

const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)(?:\s+HTTP\/[\d.]+)?\s*$/i;
const BARE_URL = /^(https?:\/\/\S+)(?:\s+HTTP\/[\d.]+)?\s*$/i;

/** Every request of a file, with the variables substituted. */
export function parseHttp(source: string): HttpRequest[] {
  const lines = source.split(/\r?\n/);
  const vars: Record<string, string> = {};
  const out: HttpRequest[] = [];
  let i = 0;
  while (i < lines.length) {
    let name: string | undefined;
    // Comments, ### separators (### Name), variable definitions before a request line.
    for (; i < lines.length; i++) {
      const t = lines[i].trim();
      const v = /^@([\w.-]+)\s*=\s*(.*)$/.exec(t);
      if (v) { vars[v[1]] = v[2]; continue; }
      if (t.startsWith('###')) { name = t.slice(3).trim() || undefined; continue; }
      if (!t || t.startsWith('#') || t.startsWith('//')) { if (t.startsWith('# @name ')) name = t.slice(8).trim(); continue; }
      break;
    }
    if (i >= lines.length) break;
    const m = METHODS.exec(lines[i].trim()) ?? (BARE_URL.exec(lines[i].trim()) ? ['', 'GET', BARE_URL.exec(lines[i].trim())![1]] : null);
    if (!m) { i++; continue; }
    const req: HttpRequest = { line: i + 1, method: m[1].toUpperCase(), url: m[2], headers: {}, body: '', name };
    i++;
    for (; i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('###'); i++) {
      const h = /^([\w-]+)\s*:\s*(.*)$/.exec(lines[i].trim());
      if (h) req.headers[h[1]] = h[2];
    }
    const body: string[] = [];
    for (; i < lines.length && !lines[i].trim().startsWith('###'); i++) body.push(lines[i]);
    req.body = body.join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
    out.push(req);
  }
  const sub = (s: string): string => s.replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (all: string, k: string): string => {
    if (k === '$guid' || k === '$uuid') return crypto.randomUUID();
    if (k === '$timestamp') return String(Math.floor(Date.now() / 1000));
    if (k === '$randomInt') return String(Math.floor(Math.random() * 1000));
    if (k === '$isoTimestamp') return new Date().toISOString();
    return k in vars ? sub(vars[k]) : all;
  });
  return out.map((r) => ({ ...r, url: sub(r.url), body: sub(r.body), headers: Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, sub(v)])) }));
}
export const isHttpFile = (file: string) => /\.(http|rest)$/i.test(file);

class SendMarker extends GutterMarker {
  constructor(readonly line: number, readonly send: (line: number) => void) { super(); }
  eq(o: SendMarker) { return o.line === this.line; }
  toDOM() {
    const b = document.createElement('button');
    b.className = 'cm-http-send';
    b.title = 'Send request (Ctrl+Enter)';
    b.setAttribute('aria-label', `Send request on line ${this.line}`);
    b.textContent = '▶';
    b.onmousedown = (e) => { e.preventDefault(); this.send(this.line); };
    return b;
  }
}
const refresh = StateEffect.define<null>();

/** ▶ in the gutter beside each request; Ctrl+Enter sends the request at the caret. */
export function httpClient(send: (line: number) => void): Extension {
  const markers = StateField.define<RangeSet<GutterMarker>>({
    create: (st) => build(st.doc.toString(), st.doc),
    update: (set, tr) => (tr.docChanged || tr.effects.some((e) => e.is(refresh)) ? build(tr.state.doc.toString(), tr.state.doc) : set),
  });
  function build(text: string, doc: { line(n: number): { from: number }; lines: number }) {
    return RangeSet.of(parseHttp(text).filter((r) => r.line <= doc.lines).map((r) => new SendMarker(r.line, send).range(doc.line(r.line).from)), true);
  }
  return [
    markers,
    gutter({ class: 'cm-http-gutter', markers: (v) => v.state.field(markers) }),
    Prec.high(keymap.of([{
      key: 'Mod-Enter',
      run: (view) => {
        const line = view.state.doc.lineAt(view.state.selection.main.head).number;
        const reqs = parseHttp(view.state.doc.toString());
        const r = [...reqs].reverse().find((x) => x.line <= line) ?? reqs[0];
        if (r) send(r.line);
        return true;
      },
    }])),
    EditorView.baseTheme({
      '.cm-http-gutter .cm-gutterElement': { padding: '0 2px' },
      '.cm-http-send': { border: '0', background: 'transparent', color: '#2a9d8f', cursor: 'pointer', fontSize: '11px', padding: '0' },
    }),
  ];
}
