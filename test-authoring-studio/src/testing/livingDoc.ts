/**
 * Living documentation (SpecFlow+ LivingDoc / Reqnroll): one self-contained HTML page with every feature, its scenarios,
 * tags and steps, and the outcome of the last test run.
 */
export type DocFeature = { file: string; name: string; tags?: string[]; scenarios: { name: string; line: number; tags?: string[]; steps: { keyword: string; text: string }[] }[] };
export type Outcome = 'passed' | 'failed' | 'skipped' | 'none';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function livingDocHtml(features: DocFeature[], outcome: (file: string, line: number, name: string) => Outcome, title = 'Living Documentation', at = new Date()) {
  const all = features.flatMap((f) => f.scenarios.map((s) => outcome(f.file, s.line, s.name)));
  const count = (o: Outcome) => all.filter((x) => x === o).length;
  const badge = (o: Outcome) => `<span class="o ${o}">${o === 'none' ? 'not run' : o}</span>`;
  const tags = (t?: string[]) => (t?.length ? `<span class="tags">${t.map((x) => esc(x.startsWith('@') ? x : `@${x}`)).join(' ')}</span>` : '');
  const body = features.map((f) => `<section><h2>${esc(f.name)} ${tags(f.tags)}</h2><p class="file">${esc(f.file)}</p>${f.scenarios.map((s) => `<details${outcome(f.file, s.line, s.name) === 'failed' ? ' open' : ''}><summary>${badge(outcome(f.file, s.line, s.name))} ${esc(s.name)} ${tags(s.tags)}</summary><ol>${s.steps.map((st) => `<li><b>${esc(st.keyword.trim())}</b> ${esc(st.text)}</li>`).join('')}</ol></details>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px auto;max-width:960px;padding:0 16px;color:#222}h1{margin:0}h2{font-size:18px;margin:24px 0 0}.file{color:#777;margin:0 0 8px;font-size:12px}details{border:1px solid #ddd;border-radius:6px;margin:6px 0;padding:6px 10px}summary{cursor:pointer}.o{display:inline-block;min-width:56px;text-align:center;border-radius:10px;font-size:11px;padding:1px 6px;color:#fff;background:#999}.o.passed{background:#2ea043}.o.failed{background:#d73a49}.o.skipped{background:#b08800}.tags{color:#6f42c1;font-size:12px}.sum{margin:8px 0 16px;color:#555}</style></head><body><h1>${esc(title)}</h1><p class="sum">${features.length} features · ${all.length} scenarios · ${count('passed')} passed · ${count('failed')} failed · ${count('skipped')} skipped · ${count('none')} not run · ${esc(at.toISOString().slice(0, 16).replace('T', ' '))} UTC</p>${body}</body></html>`;
}
