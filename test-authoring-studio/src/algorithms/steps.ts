/* Step library: template inference, parameter types, clustering and refactoring. */

/* ------------------------------------------------------------------ D9 keyword resolution */
export type StepRef = { file: string; line: number; keyword: string; resolved: string; text: string; scenario: string };
/** And/But/* inherit the previous primary keyword; scenario/background headers reset it to Given. */
export function resolveKeywords(steps: { keyword: string; text: string }[]) {
  let last = 'Given';
  return steps.map((s) => { const k = s.keyword.trim(); const resolved = ['Given', 'When', 'Then'].includes(k) ? k : last; last = resolved; return { ...s, keyword: k, resolved }; });
}

/* ------------------------------------------------------------------ D2 parameter types */
export type ParamType = 'int' | 'float' | 'bool' | 'date' | 'email' | 'url' | 'string' | 'word';
export function inferType(values: string[]): ParamType {
  const v = values.map((x) => x.replace(/^"|"$/g, ''));
  const all = (re: RegExp) => v.length > 0 && v.every((x) => re.test(x));
  if (all(/^-?\d+$/)) return 'int';
  if (all(/^-?\d*\.\d+$|^-?\d+(\.\d+)?$/)) return 'float';
  if (all(/^(true|false|yes|no)$/i)) return 'bool';
  if (all(/^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) return 'date';
  if (all(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'email';
  if (all(/^https?:\/\/\S+$/)) return 'url';
  if (all(/^\S+$/) && !values.some((x) => x.startsWith('"'))) return 'word';
  return 'string';
}
const cucumberType: Record<ParamType, string> = { int: '{int}', float: '{float}', bool: '{word}', date: '{string}', email: '{string}', url: '{string}', string: '{string}', word: '{word}' };

/* ------------------------------------------------------------------ D1 template inference */
const split = (s: string) => s.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
/**
 * Groups steps whose token sequences have equal length and differ only in a few positions.
 * Varying positions become parameters, typed from the observed values.
 */
export function inferTemplates(texts: string[], maxVarying = 2) {
  const byShape = new Map<string, string[][]>();
  for (const t of new Set(texts)) {
    const toks = split(t);
    const key = toks.length + ':' + toks.map((x) => (/^["']|^-?\d/.test(x) ? '#' : '')).join('');
    (byShape.get(key) ?? byShape.set(key, []).get(key)!).push(toks);
  }
  const out: { template: string; cucumber: string; params: { index: number; type: ParamType; values: string[] }[]; examples: string[] }[] = [];
  for (const group of byShape.values()) {
    const used = new Set<number>();
    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;
      const members = [i];
      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;
        const diff = group[i].reduce((n, tok, k) => n + (tok !== group[j][k] ? 1 : 0), 0);
        if (diff > 0 && diff <= maxVarying) members.push(j);
      }
      if (members.length < 2) continue;
      members.forEach((m) => used.add(m));
      const rows = members.map((m) => group[m]);
      const varying = rows[0].map((_, k) => k).filter((k) => rows.some((r) => r[k] !== rows[0][k]));
      if (varying.length > maxVarying || varying.some((k) => rows.some((r) => /^(Given|When|Then|the|a|an)$/i.test(r[k])))) continue;
      const params = varying.map((k) => ({ index: k, values: [...new Set(rows.map((r) => r[k]))], type: inferType(rows.map((r) => r[k])) }));
      const template = rows[0].map((tok, k) => (varying.includes(k) ? `<${'p' + (varying.indexOf(k) + 1)}>` : tok)).join(' ');
      const cucumber = rows[0].map((tok, k) => (varying.includes(k) ? cucumberType[params[varying.indexOf(k)].type] : tok)).join(' ');
      out.push({ template, cucumber, params, examples: rows.map((r) => r.join(' ')) });
    }
  }
  return out.sort((a, b) => b.examples.length - a.examples.length);
}

/* ------------------------------------------------------------------ D3 Union-find */
export class UnionFind {
  parent: number[]; rank: number[];
  constructor(n: number) { this.parent = Array.from({ length: n }, (_, i) => i); this.rank = new Array(n).fill(0); }
  find(x: number): number { while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; } return x; }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb; else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra; else { this.parent[rb] = ra; this.rank[ra]++; }
  }
  groups() { const m = new Map<number, number[]>(); this.parent.forEach((_, i) => { const r = this.find(i); (m.get(r) ?? m.set(r, []).get(r)!).push(i); }); return [...m.values()]; }
}
export function clusterPairs(n: number, pairs: [number, number][]) {
  const uf = new UnionFind(n);
  pairs.forEach(([a, b]) => uf.union(a, b));
  return uf.groups().filter((g) => g.length > 1);
}

/* ------------------------------------------------------------------ D4 HAC (average linkage) */
export function hac(n: number, sim: (a: number, b: number) => number, threshold: number) {
  let clusters = Array.from({ length: n }, (_, i) => [i]);
  const cache = new Map<string, number>();
  const s = (a: number, b: number) => { const k = a < b ? `${a},${b}` : `${b},${a}`; let v = cache.get(k); if (v === undefined) { v = sim(a, b); cache.set(k, v); } return v; };
  const link = (x: number[], y: number[]) => { let t = 0; for (const a of x) for (const b of y) t += s(a, b); return t / (x.length * y.length); };
  for (;;) {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) { const v = link(clusters[i], clusters[j]); if (v > best) { best = v; bi = i; bj = j; } }
    if (best < threshold || bi < 0) break;
    clusters[bi] = [...clusters[bi], ...clusters[bj]];
    clusters = clusters.filter((_, k) => k !== bj);
  }
  return clusters.filter((c) => c.length > 1);
}

/* ------------------------------------------------------------------ D5 DBSCAN */
export function dbscan(n: number, dist: (a: number, b: number) => number, eps: number, minPts = 2) {
  const label = new Array<number>(n).fill(-2); // -2 unvisited, -1 noise
  let c = 0;
  const neighbours = (i: number) => Array.from({ length: n }, (_, j) => j).filter((j) => j !== i && dist(i, j) <= eps);
  for (let i = 0; i < n; i++) {
    if (label[i] !== -2) continue;
    const nb = neighbours(i);
    if (nb.length + 1 < minPts) { label[i] = -1; continue; }
    label[i] = c;
    const queue = [...nb];
    while (queue.length) {
      const j = queue.shift()!;
      if (label[j] === -1) label[j] = c;
      if (label[j] !== -2) continue;
      label[j] = c;
      const nj = neighbours(j);
      if (nj.length + 1 >= minPts) queue.push(...nj);
    }
    c++;
  }
  return Array.from({ length: c }, (_, k) => label.map((l, i) => (l === k ? i : -1)).filter((i) => i >= 0));
}

/* ------------------------------------------------------------------ D7/D8 expressions */
/** Cucumber expression → anchored regex source (supports {int} {float} {word} {string} {} and optional text). */
export function cucumberToRegex(expr: string) {
  const esc = (s: string) => s.replace(/[.*+?^$|[\]\\]/g, '\\$&');
  let out = '';
  for (const part of expr.split(/(\{[^}]*\}|\([^)]*\))/)) {
    if (!part) continue;
    if (part === '{int}') out += '(-?\\d+)';
    else if (part === '{float}') out += '(-?\\d*\\.?\\d+)';
    else if (part === '{word}') out += '([^\\s]+)';
    else if (part === '{string}') out += '"([^"]*)"';
    else if (/^\{.*\}$/.test(part)) out += '(.*)';
    else if (/^\(.*\)$/.test(part)) out += `(?:${esc(part.slice(1, -1))})?`;
    else out += part.split(/(\s+)/).map((w) => (/^[^\s/]+(\/[^\s/]+)+$/.test(w) ? `(?:${w.split('/').map(esc).join('|')})` : esc(w))).join('');
  }
  return `^${out}$`;
}
/** Regex binding pattern → Cucumber expression, when the groups map onto built-in parameter types. */
export function regexToCucumber(pattern: string) {
  return pattern
    .replace(/^\^|\$$/g, '')
    .replace(/"\(\.\*\)"|"\(\[\^"\]\*\)"|"\(\.\+\)"/g, '{string}')
    .replace(/\(-\?\\d\+\)|\(\\d\+\)/g, '{int}')
    .replace(/\(-\?\\d\*\\\.\?\\d\+\)|\(\\d\+\\\.\\d\+\)/g, '{float}')
    .replace(/\(\[\^\\s\]\+\)|\(\\w\+\)|\(\\S\+\)/g, '{word}')
    .replace(/\(\.\*\)|\(\.\+\)/g, '{}')
    .replace(/\\(.)/g, '$1');
}

/* ------------------------------------------------------------------ D6 rename refactor */
export type RenameEdit = { file: string; line: number; before: string; after: string };
/**
 * Rewrites every step line whose text matches `from` (a Cucumber expression or plain text with
 * {params}) to the `to` template, carrying captured arguments across by position.
 */
export function renameStep(features: { file: string; source: string }[], from: string, to: string): RenameEdit[] {
  const re = new RegExp(cucumberToRegex(from));
  const edits: RenameEdit[] = [];
  for (const f of features) {
    f.source.split(/\r?\n/).forEach((raw, i) => {
      const m = /^(\s*)(Given|When|Then|And|But|\*)(\s+)(.*?)\s*$/.exec(raw);
      if (!m) return;
      const hit = re.exec(m[4]);
      if (!hit) return;
      let n = 1;
      const text = to.replace(/\{[^}]*\}/g, (p) => { const v = hit[n++] ?? ''; return p === '{string}' ? `"${v}"` : v; });
      if (text !== m[4]) edits.push({ file: f.file, line: i + 1, before: raw, after: `${m[1]}${m[2]}${m[3]}${text}` });
    });
  }
  return edits;
}
export function applyEdits(source: string, edits: RenameEdit[]) {
  const lines = source.split(/\r?\n/);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  edits.forEach((e) => { if (lines[e.line - 1] === e.before) lines[e.line - 1] = e.after; });
  return lines.join(eol);
}
