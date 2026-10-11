import { evaluate, identifiers, parseTagExpression, type Expr } from './tags';
import { allTuples, combinations, coverage, makeValidator, type Param, type Row } from './combinatorial';
import { mulberry32 } from './random';

/* Logic coverage over a boolean expression such as "member and (total > 100 or coupon)". */
export type LogicRow = { values: Record<string, boolean>; outcome: boolean; note?: string };
const conds = (e: Expr | null) => [...new Set(identifiers(e))];
const rowFor = (names: string[], mask: number) => Object.fromEntries(names.map((n, i) => [n, ((mask >> (names.length - 1 - i)) & 1) === 1]));
const evalRow = (e: Expr | null, v: Record<string, boolean>) => evaluate(e, (id) => v[id] ?? false);

/** J4: every combination of condition values. */
export function multipleCondition(src: string): LogicRow[] {
  const e = parseTagExpression(src), names = conds(e);
  if (names.length > 12) throw new Error('Multiple-condition coverage is limited to 12 conditions.');
  return Array.from({ length: 1 << names.length }, (_, m) => { const values = rowFor(names, m); return { values, outcome: evalRow(e, values) }; });
}
/** J3: one row where the decision is true and one where it is false. */
export function decisionCoverage(src: string): LogicRow[] {
  const all = multipleCondition(src);
  return [all.find((r) => r.outcome), all.find((r) => !r.outcome)].filter(Boolean) as LogicRow[];
}
/** J2: every condition takes both values at least once (greedy over the truth table). */
export function conditionCoverage(src: string): LogicRow[] {
  const all = multipleCondition(src);
  const names = Object.keys(all[0]?.values ?? {});
  const need = new Set(names.flatMap((n) => [`${n}=1`, `${n}=0`]));
  const out: LogicRow[] = [];
  while (need.size) {
    const best = all.reduce((a, r) => { const g = names.filter((n) => need.has(`${n}=${r.values[n] ? 1 : 0}`)).length; return g > a.g ? { r, g } : a; }, { r: all[0], g: -1 });
    if (best.g <= 0) break;
    out.push(best.r);
    names.forEach((n) => need.delete(`${n}=${best.r.values[n] ? 1 : 0}`));
  }
  return out;
}
/**
 * J1: MC/DC (unique-cause). For each condition find a pair of rows that differ only in that condition and
 * flip the outcome, then pick a small set of rows covering one pair per condition (greedy, shared rows reused).
 */
export function mcdc(src: string): { rows: LogicRow[]; pairs: Record<string, [number, number] | null> } {
  const all = multipleCondition(src);
  const names = Object.keys(all[0]?.values ?? {});
  const n = names.length;
  const pairsFor = (i: number) => all.map((_, m) => m).filter((m) => ((m >> (n - 1 - i)) & 1) === 0).map((m) => [m, m | (1 << (n - 1 - i))] as [number, number]).filter(([a, b]) => all[a].outcome !== all[b].outcome);
  const chosen = new Set<number>();
  const pairs: Record<string, [number, number] | null> = {};
  // Conditions with the fewest options first; prefer pairs that reuse already-chosen rows.
  const order = names.map((name, i) => ({ name, i, options: pairsFor(i) })).sort((a, b) => a.options.length - b.options.length);
  for (const { name, options } of order) {
    if (!options.length) { pairs[name] = null; continue; }
    const best = options.reduce((a, p) => { const s = (chosen.has(p[0]) ? 1 : 0) + (chosen.has(p[1]) ? 1 : 0); return s > a.s ? { p, s } : a; }, { p: options[0], s: -1 }).p;
    best.forEach((m) => chosen.add(m));
    pairs[name] = best;
  }
  const rows = [...chosen].sort((a, b) => a - b);
  const index = new Map(rows.map((m, k) => [m, k]));
  return {
    rows: rows.map((m) => ({ ...all[m], note: Object.entries(pairs).filter(([, p]) => p && p.includes(m)).map(([c]) => c).join(', ') })),
    pairs: Object.fromEntries(Object.entries(pairs).map(([c, p]) => [c, p ? [index.get(p[0])!, index.get(p[1])!] : null])),
  };
}

/** J5: cause–effect graph — causes are conditions, each effect is a boolean expression over them. */
export function causeEffect(causes: string[], effects: { name: string; when: string }[]) {
  const exprs = effects.map((e) => ({ name: e.name, expr: parseTagExpression(e.when) }));
  const unknown = exprs.flatMap((e) => identifiers(e.expr)).filter((id) => !causes.includes(id));
  if (unknown.length) throw new Error(`Unknown causes: ${[...new Set(unknown)].join(', ')}`);
  if (causes.length > 10) throw new Error('At most 10 causes.');
  const rows = Array.from({ length: 1 << causes.length }, (_, m) => { const v = rowFor(causes, m); return { values: v, effects: Object.fromEntries(exprs.map((e) => [e.name, evalRow(e.expr, v)])) }; });
  // Collapse rows with identical effects whose causes differ in one position (don't-care), repeatedly.
  type R = { values: Record<string, boolean | null>; effects: Record<string, boolean> };
  let cur: R[] = rows.map((r) => ({ values: { ...r.values }, effects: r.effects }));
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let a = 0; a < cur.length; a++) for (let b = a + 1; b < cur.length; b++) {
      const ra = cur[a], rb = cur[b];
      if (JSON.stringify(ra.effects) !== JSON.stringify(rb.effects)) continue;
      const diff = causes.filter((c) => ra.values[c] !== rb.values[c]);
      if (diff.length !== 1 || ra.values[diff[0]] === null || rb.values[diff[0]] === null) continue;
      cur = [...cur.filter((_, k) => k !== a && k !== b), { values: { ...ra.values, [diff[0]]: null }, effects: ra.effects }];
      changed = true;
      break outer;
    }
  }
  return cur;
}

/* ------------------------------------------------------------------ J6 classification tree */
export type Classification = { name: string; classes: string[] };
/**
 * Indented outline: classification lines end with ":", classes are the indented lines below.
 *   Payment:
 *     Card
 *     Invoice
 */
export function parseClassificationTree(text: string): Classification[] {
  const out: Classification[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const t = raw.trim();
    if (t.endsWith(':') && !/^\s/.test(raw)) out.push({ name: t.slice(0, -1).trim(), classes: [] });
    else if (out.length) out[out.length - 1].classes.push(t.replace(/^[-*]\s*/, ''));
  }
  return out.filter((c) => c.classes.length);
}
/** Minimal combination (every class once) or pairwise between classifications, as Param/Row for reuse. */
export const classificationParams = (tree: Classification[]): Param[] => tree.map((c) => ({ name: c.name, values: c.classes }));

/* ------------------------------------------------------------------ J7 domain testing */
/** ON point on the boundary, OFF point just across it, IN point inside, for a condition like "age >= 18". */
export function domainPoints(condition: string, epsilon = 1) {
  const m = /^\s*([\w.]+)\s*(<=|>=|<|>|==|=|!=)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(condition);
  if (!m) throw new Error('Use "variable operator number", e.g. age >= 18.');
  const [, v, op, n] = m, c = Number(n);
  const holds = (x: number) => ({ '<=': x <= c, '>=': x >= c, '<': x < c, '>': x > c, '==': x === c, '=': x === c, '!=': x !== c })[op]!;
  const on = c;
  const off = op === '<' || op === '>=' ? c - epsilon : op === '>' || op === '<=' ? c + epsilon : c + epsilon;
  const inside = [c - 10 * epsilon, c + 10 * epsilon].find(holds) ?? c;
  const outside = [c - 10 * epsilon, c + 10 * epsilon].find((x) => !holds(x)) ?? c + epsilon;
  return [
    { kind: 'ON', variable: v, value: on, satisfies: holds(on) },
    { kind: 'OFF', variable: v, value: off, satisfies: holds(off) },
    { kind: 'IN', variable: v, value: inside, satisfies: holds(inside) },
    { kind: 'OUT', variable: v, value: outside, satisfies: holds(outside) },
  ];
}

/* ------------------------------------------------------------------ J8 value catalogue */
export const valueCatalog: Record<string, string[]> = {
  string: ['""', '" "', '"a"', '"Ünïcödé ✓"', '"<script>alert(1)</script>"', `"O'Brien"`, '"Robert\'); DROP TABLE Students;--"', '"' + 'x'.repeat(256) + '"', '"  leading and trailing  "', '"null"'],
  int: ['0', '1', '-1', '2147483647', '-2147483648', '2147483648', '00042', '1e3'],
  float: ['0.0', '-0.0', '0.1', '1.005', '3.4028235E38', 'NaN', 'Infinity', '1,5'],
  email: ['a@b.co', 'first.last+tag@example.com', 'no-at-sign.example.com', 'a@b', '"quoted"@example.com', 'a@xn--bcher-kva.example'],
  date: ['2024-02-29', '2023-02-29', '1970-01-01', '9999-12-31', '2026-03-29T02:30', '31/12/2026', ''],
  url: ['https://example.com', 'http://localhost:8080/path?q=1#x', 'ftp://example.com', 'example.com', 'https://例え.テスト', ''],
  bool: ['true', 'false', 'TRUE', '1', '0', 'yes', ''],
};

/* ------------------------------------------------------------------ J9 simulated-annealing covering arrays */
/** Cohen et al.: for N = start..down, anneal a random N-row array to cover every t-tuple; keep the smallest success. */
export function annealCoveringArray(params: Param[], t = 2, start?: number, seed = 1, iterations = 20000): Row[] {
  const rnd = mulberry32(seed);
  const strength = Math.min(t, params.length);
  const tuples = [...allTuples(params, strength)];
  const sets = combinations(params.map((_, i) => i), strength);
  const uncovered = (rows: Row[]) => {
    const got = new Set<string>();
    for (const r of rows) for (const ps of sets) got.add(ps.map((p) => `${p}:${r[p]}`).join(','));
    return tuples.filter((k) => !got.has(k)).length;
  };
  const lower = Math.max(...params.map((p) => p.values.length)) ** Math.min(2, strength);
  let best: Row[] | null = null;
  for (let n = start ?? Math.max(lower, Math.ceil(lower * 1.6)); n >= lower; n--) {
    let rows = Array.from({ length: n }, () => params.map((p) => Math.floor(rnd() * p.values.length)));
    let cost = uncovered(rows);
    for (let k = 0; k < iterations && cost > 0; k++) {
      const T = 1.5 * (1 - k / iterations) + 0.01;
      const r = Math.floor(rnd() * n), c = Math.floor(rnd() * params.length);
      const old = rows[r][c];
      rows[r][c] = Math.floor(rnd() * params[c].values.length);
      const next = uncovered(rows);
      if (next <= cost || rnd() < Math.exp((cost - next) / T)) cost = next; else rows[r][c] = old;
    }
    if (cost === 0) best = rows.map((r) => r.slice()); else break;
  }
  return best ?? [];
}

/* ------------------------------------------------------------------ J10, J11 */
/** Drops rows whose t-way combinations are all covered by the remaining rows (reverse greedy). */
export function reduceTable(params: Param[], rows: Row[], t = 2) {
  const strength = Math.min(t, params.length);
  const sets = combinations(params.map((_, i) => i), strength);
  const keys = (r: Row) => sets.map((ps) => ps.map((p) => `${p}:${r[p]}`).join(','));
  const count = new Map<string, number>();
  rows.forEach((r) => keys(r).forEach((k) => count.set(k, (count.get(k) ?? 0) + 1)));
  const keep: Row[] = [];
  // Try to drop rows contributing the fewest unique combinations first.
  const order = rows.map((r, i) => ({ r, i, unique: keys(r).filter((k) => count.get(k) === 1).length })).sort((a, b) => a.unique - b.unique);
  const dropped = new Set<number>();
  for (const { r, i } of order) {
    if (keys(r).every((k) => (count.get(k) ?? 0) > 1)) { keys(r).forEach((k) => count.set(k, count.get(k)! - 1)); dropped.add(i); }
  }
  rows.forEach((r, i) => { if (!dropped.has(i)) keep.push(r); });
  return keep;
}
/** Every valid t-way combination the table misses, as readable labels. */
export function missingCombinations(params: Param[], rows: Row[], t = 2, valid: (r: Row) => boolean = makeValidator(params, [])) {
  const strength = Math.min(t, params.length);
  const all = allTuples(params, strength, valid);
  const got = new Set(rows.flatMap((r) => combinations(params.map((_, i) => i), strength).map((ps) => ps.map((p) => `${p}:${r[p]}`).join(','))));
  const missing = [...all].filter((k) => !got.has(k));
  return { missing: missing.map((k) => k.split(',').map((s) => { const [p, v] = s.split(':').map(Number); return `${params[p].name}=${params[p].values[v]}`; }).join(' & ')), ratio: coverage(params, rows, strength, valid).ratio };
}
