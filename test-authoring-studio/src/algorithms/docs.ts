import { rollup, count, type Status } from './tags';

/* I4 Living documentation: features rendered as a browsable spec with the latest status per scenario. */
export type DocFeature = { file: string; name: string; tags: string[]; description?: string; scenarios: { name: string; keyword: string; tags: string[]; steps: { keyword: string; text: string }[]; status: Status }[] };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const icon: Record<Status, string> = { passed: '✓', failed: '✗', skipped: '○', unknown: '·' };

export function livingDocsHtml(features: DocFeature[], title = 'Living documentation', generatedAt = new Date()) {
  const all = features.flatMap((f) => f.scenarios.map((s) => s.status));
  const c = count(all);
  const byFolder = new Map<string, DocFeature[]>();
  features.forEach((f) => { const d = f.file.split('/').slice(0, -1).join('/') || '(root)'; (byFolder.get(d) ?? byFolder.set(d, []).get(d)!).push(f); });
  const nav = [...byFolder].map(([d, fs]) => `<li><strong>${esc(d)}</strong><ul>${fs.map((f) => `<li><a href="#${id(f.file)}">${status(rollup(f.scenarios.map((s) => s.status)))} ${esc(f.name)}</a></li>`).join('')}</ul></li>`).join('');
  const body = features.map((f) => `
<section class="feature" id="${id(f.file)}">
  <h2>${status(rollup(f.scenarios.map((s) => s.status)))} ${esc(f.name)}</h2>
  <p class="meta">${esc(f.file)} ${f.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>
  ${f.description ? `<p>${esc(f.description)}</p>` : ''}
  ${f.scenarios.map((s) => `
  <details class="scenario ${s.status}" ${s.status === 'failed' ? 'open' : ''}>
    <summary>${status(s.status)} <b>${esc(s.keyword)}:</b> ${esc(s.name)} ${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</summary>
    <ol>${s.steps.map((st) => `<li><b>${esc(st.keyword)}</b> ${esc(st.text)}</li>`).join('')}</ol>
  </details>`).join('')}
</section>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1d2330;--muted:#5b6474;--line:#dde2ea;--ok:#147a3d;--bad:#b42318;--skip:#8a6100}
@media (prefers-color-scheme:dark){:root{--bg:#10141c;--fg:#e7eaf0;--muted:#a3abb9;--line:#2a3140;--ok:#5fd38d;--bad:#ff8a80;--skip:#f0c060}}
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);display:grid;grid-template-columns:minmax(200px,280px) 1fr}
nav{border-right:1px solid var(--line);padding:16px;position:sticky;top:0;height:100vh;overflow:auto;box-sizing:border-box}
nav ul{list-style:none;padding-left:12px;margin:4px 0}nav a{color:inherit;text-decoration:none}main{padding:16px 24px;max-width:900px}
.meta{color:var(--muted);font-size:13px}.tag{border:1px solid var(--line);border-radius:10px;padding:0 6px;font-size:12px;color:var(--muted)}
.scenario{border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:8px 0}.scenario summary{cursor:pointer}
.s-passed{color:var(--ok)}.s-failed{color:var(--bad)}.s-skipped{color:var(--skip)}.s-unknown{color:var(--muted)}
.summary span{margin-right:12px}
@media (max-width:700px){body{display:block}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}}
@media print{nav{display:none}body{display:block}details{break-inside:avoid}details:not([open])>*:not(summary){display:block}}
</style></head><body>
<nav aria-label="Features"><h1 style="font-size:18px">${esc(title)}</h1><p class="summary"><span class="s-passed">✓ ${c.passed}</span><span class="s-failed">✗ ${c.failed}</span><span class="s-skipped">○ ${c.skipped}</span><span class="s-unknown">· ${c.unknown}</span></p><ul>${nav}</ul></nav>
<main><p class="meta">Generated ${esc(generatedAt.toISOString())} · ${features.length} features · ${all.length} scenarios</p>${body}</main>
</body></html>`;
}
export function livingDocsMarkdown(features: DocFeature[], title = 'Living documentation') {
  const lines = [`# ${title}`, ''];
  for (const f of features) {
    lines.push(`## ${icon[rollup(f.scenarios.map((s) => s.status))]} ${f.name}`, '', `\`${f.file}\` ${f.tags.join(' ')}`, '');
    for (const s of f.scenarios) {
      lines.push(`### ${icon[s.status]} ${s.keyword}: ${s.name}`, '');
      s.steps.forEach((st) => lines.push(`- **${st.keyword}** ${st.text}`));
      lines.push('');
    }
  }
  return lines.join('\n');
}
const id = (f: string) => 'f-' + f.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const status = (s: Status) => `<span class="s-${s}" aria-label="${s}">${icon[s]}</span>`;
