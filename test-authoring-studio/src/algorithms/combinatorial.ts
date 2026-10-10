import { mulberry32, shuffle } from './random';

export type Param = { name: string; values: string[]; weights?: number[]; base?: number };
/** A row holds one value index per parameter; -1 is "don't care" while a covering array is being built. */
export type Row = number[];
export type Rule = { kind: 'forbid' | 'implies'; when: Literal[]; then?: Literal[] };
type Literal = { param: number; value: string; negate: boolean };

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/* ------------------------------------------------------------------ constraints */
/**
 * Parses one rule per line:
 *   `browser = Safari & os = Windows`         → that combination is forbidden
 *   `if payment = Invoice then country != US` → implication
 */
export function parseConstraints(text: string, params: Param[]): { rules: Rule[]; errors: string[] } {
  const rules: Rule[] = [], errors: string[] = [];
  const lit = (s: string, line: number): Literal | null => {
    const m = /^\s*(.+?)\s*(!=|=)\s*(.+?)\s*$/.exec(s);
    if (!m) { errors.push(`Line ${line}: expected "name = value", got "${s.trim()}".`); return null; }
    const param = params.findIndex((p) => eq(p.name, m[1]));
    if (param < 0) { errors.push(`Line ${line}: unknown parameter "${m[1]}".`); return null; }
    return { param, value: m[3], negate: m[2] === '!=' };
  };
  text.split('\n').forEach((raw, i) => {
    const s = raw.replace(/#.*$/, '').trim();
    if (!s) return;
    const imp = /^if\s+(.+?)\s+then\s+(.+)$/i.exec(s);
    const split = (x: string) => x.split(/\s*(?:&|&&|\band\b)\s*/i).map((p) => lit(p, i + 1));
    if (imp) {
      const when = split(imp[1]), then = split(imp[2]);
      if (when.every(Boolean) && then.every(Boolean)) rules.push({ kind: 'implies', when: when as Literal[], then: then as Literal[] });
    } else {
      const when = split(s);
      if (when.every(Boolean)) rules.push({ kind: 'forbid', when: when as Literal[] });
    }
  });
  return { rules, errors };
}
/** A partial row is valid unless some rule is already definitely violated by its assigned values. */
export function makeValidator(params: Param[], rules: Rule[]) {
  const holds = (l: Literal, row: Row): boolean | undefined => {
    const v = row[l.param];
    if (v === undefined || v < 0) return undefined;
    const m = eq(params[l.param].values[v], l.value);
    return l.negate ? !m : m;
  };
  return (row: Row) => {
    for (const r of rules) {
      const when = r.when.map((l) => holds(l, row));
      if (when.some((x) => x === false) || when.some((x) => x === undefined)) continue;
      if (r.kind === 'forbid') return false;
      if (r.then!.some((l) => holds(l, row) === false)) return false;
    }
    return true;
  };
}

/* ------------------------------------------------------------------ helpers */
export function combinations<T>(xs: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < xs.length; i++) { acc.push(xs[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}
const product = (sizes: number[]): number[][] => sizes.reduce<number[][]>((acc, n) => acc.flatMap((a) => Array.from({ length: n }, (_, v) => [...a, v])), [[]]);
const tupleKey = (ps: number[], vs: number[]) => ps.map((p, i) => `${p}:${vs[i]}`).join(',');
/** Every valid t-way tuple over the given parameters, keyed "p:v,p:v". */
export function allTuples(params: Param[], t: number, valid: (r: Row) => boolean = () => true) {
  const keys = new Set<string>();
  const strength = Math.min(t, params.length);
  for (const ps of combinations(params.map((_, i) => i), strength)) {
    for (const vs of product(ps.map((p) => params[p].values.length))) {
      const row: Row = params.map(() => -1);
      ps.forEach((p, i) => (row[p] = vs[i]));
      if (valid(row)) keys.add(tupleKey(ps, vs));
    }
  }
  return keys;
}
const rowTuples = (row: Row, t: number) => combinations(row.map((_, i) => i).filter((i) => row[i] >= 0), t).map((ps) => tupleKey(ps, ps.map((p) => row[p])));
/** Fills don't-care cells with the first value that keeps the row valid. */
function fill(rows: Row[], params: Param[], valid: (r: Row) => boolean) {
  return rows.map((r) => {
    const row = r.slice();
    for (let i = 0; i < row.length; i++) {
      if (row[i] >= 0) continue;
      const order = params[i].values.map((_, v) => v);
      row[i] = order.find((v) => { row[i] = v; return valid(row); }) ?? 0;
    }
    return row;
  });
}

/* ------------------------------------------------------------------ A3 Cartesian */
export const cartesianSize = (params: Param[]) => params.reduce((n, p) => n * Math.max(1, p.values.length), 1);
export function cartesian(params: Param[], valid: (r: Row) => boolean = () => true, limit = 50_000): Row[] {
  if (cartesianSize(params) > limit) throw new Error(`The full product has ${cartesianSize(params).toLocaleString()} rows (limit ${limit.toLocaleString()}).`);
  return product(params.map((p) => p.values.length)).filter(valid);
}

/* ------------------------------------------------------------------ A1 IPOG */
/** IPOG (Lei, Kacker, Kuhn et al.): grow the array one parameter at a time, horizontally then vertically. */
export function ipog(params: Param[], t = 2, valid: (r: Row) => boolean = () => true, seeds: Row[] = []): Row[] {
  const n = params.length;
  if (!n) return [];
  const strength = Math.max(1, Math.min(t, n));
  // Process the largest parameters first; that keeps the initial product small relative to the result.
  const order = params.map((_, i) => i).sort((a, b) => params[b].values.length - params[a].values.length);
  const P = order.map((i) => params[i]);
  const toLocal = (r: Row) => order.map((i) => r[i] ?? -1);
  const validLocal = (r: Row) => { const g: Row = new Array(n).fill(-1); order.forEach((orig, j) => (g[orig] = r[j] ?? -1)); return valid(g); };
  let rows: Row[] = seeds.map(toLocal).map((r) => r.map((v, j) => (v < P[j].values.length ? v : -1)));
  const initial = product(P.slice(0, strength).map((p) => p.values.length)).map((vs) => [...vs, ...new Array(n - strength).fill(-1)]).filter(validLocal);
  const have = new Set(rows.map((r) => r.slice(0, strength).join(',')));
  for (const r of initial) if (!have.has(r.slice(0, strength).join(','))) rows.push(r);
  for (let k = strength; k < n; k++) {
    // π: uncovered t-tuples that pair parameter k with t-1 earlier parameters.
    const pi = new Set<string>();
    for (const prev of combinations(Array.from({ length: k }, (_, i) => i), strength - 1)) {
      const ps = [...prev, k];
      for (const vs of product(ps.map((p) => P[p].values.length))) {
        const r: Row = new Array(n).fill(-1);
        ps.forEach((p, i) => (r[p] = vs[i]));
        if (validLocal(r)) pi.add(tupleKey(ps, vs));
      }
    }
    const coveredBy = (r: Row) => combinations(Array.from({ length: k }, (_, i) => i).filter((i) => r[i] >= 0), strength - 1).map((prev) => tupleKey([...prev, k], [...prev.map((p) => r[p]), r[k]]));
    // Horizontal growth
    for (const r of rows) {
      if (r[k] >= 0) { coveredBy(r).forEach((key) => pi.delete(key)); continue; }
      let best = -1, bestGain = -1;
      for (let v = 0; v < P[k].values.length; v++) {
        r[k] = v;
        if (!validLocal(r)) continue;
        const gain = coveredBy(r).filter((key) => pi.has(key)).length;
        if (gain > bestGain) { bestGain = gain; best = v; }
      }
      r[k] = best;
      if (best >= 0) coveredBy(r).forEach((key) => pi.delete(key));
    }
    // Vertical growth
    for (const key of [...pi]) {
      if (!pi.has(key)) continue;
      const lits = key.split(',').map((s) => s.split(':').map(Number));
      let target = rows.find((r) => lits.every(([p, v]) => r[p] === v || r[p] < 0) && validLocal(merge(r, lits)));
      if (target) Object.assign(target, merge(target, lits));
      else { target = merge(new Array(n).fill(-1), lits); rows.push(target); }
      coveredBy(target).forEach((x) => pi.delete(x));
    }
  }
  const filled = fill(rows, P, validLocal);
  return dedupe(filled.map((r) => params.map((_, orig) => r[order.indexOf(orig)])));
}
const merge = (r: Row, lits: number[][]) => { const x = r.slice(); for (const [p, v] of lits) x[p] = v; return x; };
const dedupe = (rows: Row[]) => { const seen = new Set<string>(); return rows.filter((r) => { const k = r.join(','); if (seen.has(k)) return false; seen.add(k); return true; }); };

/* ------------------------------------------------------------------ A2 AETG + A15 weights */
/** AETG (Cohen et al.): each new row is the best of M greedy candidates seeded from an uncovered tuple. */
export function aetg(params: Param[], t = 2, valid: (r: Row) => boolean = () => true, seed = 1, candidates = 30): Row[] {
  const rnd = mulberry32(seed);
  const strength = Math.min(t, params.length);
  const uncovered = allTuples(params, strength, valid);
  const rows: Row[] = [];
  const gain = (r: Row) => rowTuples(r, strength).filter((k) => uncovered.has(k)).length;
  let guard = 0;
  while (uncovered.size && guard++ < 5000) {
    let best: Row | undefined, bestGain = -1;
    const start = [...uncovered][Math.floor(rnd() * uncovered.size)];
    for (let c = 0; c < candidates; c++) {
      const row: Row = params.map(() => -1);
      for (const [p, v] of start.split(',').map((s) => s.split(':').map(Number))) row[p] = v;
      for (const p of shuffle(params.map((_, i) => i).filter((i) => row[i] < 0), rnd)) {
        let bv = -1, bg = -1;
        for (const v of weightedOrder(params[p], rnd)) {
          row[p] = v;
          if (!valid(row)) continue;
          const g = gain(row);
          if (g > bg) { bg = g; bv = v; }
        }
        row[p] = bv < 0 ? 0 : bv;
      }
      if (!valid(row)) continue;
      const g = gain(row);
      if (g > bestGain) { bestGain = g; best = row; }
    }
    if (!best || bestGain <= 0) { uncovered.delete(start); continue; }
    rows.push(best);
    rowTuples(best, strength).forEach((k) => uncovered.delete(k));
  }
  return rows;
}
/** A15: value order sampled by weight, so heavier values win ties more often. */
export function weightedOrder(p: Param, rnd: () => number) {
  const w = p.values.map((_, i) => Math.max(0.0001, p.weights?.[i] ?? 1));
  return p.values.map((_, i) => i).map((i) => ({ i, k: Math.pow(rnd(), 1 / w[i]) })).sort((a, b) => b.k - a.k).map((x) => x.i);
}

/* ------------------------------------------------------------------ A4 Each-choice, A5 Base-choice, A6 Random */
export function eachChoice(params: Param[], valid: (r: Row) => boolean = () => true): Row[] {
  const n = Math.max(0, ...params.map((p) => p.values.length));
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const row: Row = params.map((p) => i % p.values.length);
    for (let shift = 0; shift < n && !valid(row); shift++) params.forEach((p, j) => { if (!valid(row)) row[j] = (i + shift + 1) % p.values.length; });
    if (valid(row)) rows.push(row);
  }
  return dedupe(rows);
}
export function baseChoice(params: Param[], valid: (r: Row) => boolean = () => true): Row[] {
  const base: Row = params.map((p) => p.base ?? 0);
  const rows: Row[] = [base];
  params.forEach((p, j) => p.values.forEach((_, v) => { if (v !== base[j]) { const r = base.slice(); r[j] = v; if (valid(r)) rows.push(r); } }));
  return rows;
}
export function randomSample(params: Param[], count: number, seed = 1, valid: (r: Row) => boolean = () => true): Row[] {
  const rnd = mulberry32(seed);
  const rows: Row[] = [];
  const seen = new Set<string>();
  const max = Math.min(count, cartesianSize(params));
  for (let tries = 0; rows.length < max && tries < count * 50; tries++) {
    const r = params.map((p) => weightedOrder(p, rnd)[0]);
    const k = r.join(',');
    if (!seen.has(k) && valid(r)) { seen.add(k); rows.push(r); }
  }
  return rows;
}

/* ------------------------------------------------------------------ A11 coverage */
export function coverage(params: Param[], rows: Row[], t = 2, valid: (r: Row) => boolean = () => true) {
  const all = allTuples(params, t, valid);
  const got = new Set(rows.flatMap((r) => rowTuples(r, Math.min(t, params.length))));
  let covered = 0;
  for (const k of all) if (got.has(k)) covered++;
  return { covered, total: all.size, ratio: all.size ? covered / all.size : 1 };
}

/* ------------------------------------------------------------------ A7 BVA, A8 Equivalence */
/** Boundary values for an inclusive numeric range: min-1, min, min+1, nominal, max-1, max, max+1. */
export function boundaryValues(min: number, max: number, step = 1, robust = true) {
  const nominal = Math.round(((min + max) / 2) / step) * step;
  const vals = [...(robust ? [min - step] : []), min, min + step, nominal, max - step, max, ...(robust ? [max + step] : [])];
  return [...new Set(vals.map((v) => +v.toFixed(6)))].filter((v) => robust || (v >= min && v <= max)).sort((a, b) => a - b).map((value) => ({ value, valid: value >= min && value <= max }));
}
/** Equivalence classes from "0..17 | 18..64 | 65..120": one representative per class, plus invalid classes outside. */
export function equivalenceClasses(spec: string) {
  const classes = spec.split('|').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/.exec(s);
    return m ? { label: s, min: +m[1], max: +m[2] } : { label: s, min: NaN, max: NaN };
  });
  const out = classes.map((c) => ({ label: c.label, value: isNaN(c.min) ? c.label : String(Math.round((c.min + c.max) / 2)), valid: true }));
  const nums = classes.filter((c) => !isNaN(c.min));
  if (nums.length) {
    const lo = Math.min(...nums.map((c) => c.min)), hi = Math.max(...nums.map((c) => c.max));
    out.unshift({ label: `< ${lo}`, value: String(lo - 1), valid: false });
    out.push({ label: `> ${hi}`, value: String(hi + 1), valid: false });
  }
  return out;
}
/** Expands value shorthands in a parameter cell: "1..100" (boundary values) and "[0..17|18..64]" (classes). */
export function expandValues(raw: string, opts: { bva: boolean; equivalence: boolean }) {
  const s = raw.trim();
  const range = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/.exec(s);
  if (range && opts.bva) return boundaryValues(+range[1], +range[2]).map((b) => String(b.value));
  const cls = /^\[(.+)\]$/.exec(s);
  if (cls && opts.equivalence) return equivalenceClasses(cls[1]).map((c) => c.value);
  return s.split(/\s*,\s*/).filter(Boolean);
}

/* ------------------------------------------------------------------ A12 Orthogonal arrays */
const isPrime = (n: number) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
/** L(p²) orthogonal array from mutually orthogonal Latin squares (p prime, up to p+1 factors). */
export function orthogonalArray(params: Param[]): Row[] | null {
  if (!params.length) return [];
  let p = Math.max(2, ...params.map((x) => x.values.length));
  while (!isPrime(p)) p++;
  if (params.length > p + 1) return null;
  const rows: Row[] = [];
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
    const cols = [i, j, ...Array.from({ length: p - 1 }, (_, k) => (i + (k + 1) * j) % p)];
    rows.push(params.map((x, c) => cols[c] % x.values.length));
  }
  return dedupe(rows);
}

/* ------------------------------------------------------------------ A13 Decision tables, A14 Quine–McCluskey */
/** Every combination of boolean conditions, most significant condition first. */
export const decisionTable = (conditions: string[]) => product(conditions.map(() => 2)).map((r) => r.map((v) => v === 1));
type Implicant = { bits: (0 | 1 | -1)[]; covers: number[] };
/** Quine–McCluskey: minimal sum of prime implicants for the given minterms (with Petrick-style greedy cover). */
export function quineMcCluskey(nVars: number, minterms: number[], dontCares: number[] = []): (0 | 1 | -1)[][] {
  if (!minterms.length) return [];
  const toBits = (m: number) => Array.from({ length: nVars }, (_, i) => ((m >> (nVars - 1 - i)) & 1) as 0 | 1);
  let current: Implicant[] = [...new Set([...minterms, ...dontCares])].map((m) => ({ bits: toBits(m), covers: [m] }));
  const primes: Implicant[] = [];
  while (current.length) {
    const used = new Set<number>();
    const next = new Map<string, Implicant>();
    for (let a = 0; a < current.length; a++) for (let b = a + 1; b < current.length; b++) {
      const x = current[a].bits, y = current[b].bits;
      let diff = -1, count = 0;
      for (let i = 0; i < nVars; i++) if (x[i] !== y[i]) { count++; diff = i; }
      if (count !== 1 || x[diff] === -1 || y[diff] === -1) continue;
      const bits = x.slice(); bits[diff] = -1;
      next.set(bits.join(','), { bits, covers: [...new Set([...current[a].covers, ...current[b].covers])] });
      used.add(a); used.add(b);
    }
    current.forEach((imp, i) => { if (!used.has(i) && !primes.some((p) => p.bits.join() === imp.bits.join())) primes.push(imp); });
    current = [...next.values()];
  }
  // Essential primes first, then greedy cover of what is left.
  const need = new Set(minterms);
  const chosen: Implicant[] = [];
  for (const m of minterms) {
    const covering = primes.filter((p) => p.covers.includes(m));
    if (covering.length === 1 && !chosen.includes(covering[0])) chosen.push(covering[0]);
  }
  chosen.forEach((c) => c.covers.forEach((m) => need.delete(m)));
  while (need.size) {
    const best = primes.reduce((a, b) => (b.covers.filter((m) => need.has(m)).length > a.covers.filter((m) => need.has(m)).length ? b : a));
    chosen.push(best);
    best.covers.forEach((m) => need.delete(m));
  }
  return chosen.map((c) => c.bits);
}

/* ------------------------------------------------------------------ output */
export function toExamples(params: Param[], rows: Row[]) {
  const head = params.map((p) => p.name);
  const body = rows.map((r) => r.map((v, i) => params[i].values[v] ?? ''));
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  return [line(head), ...body.map(line)].join('\n');
}
export const toCsv = (params: Param[], rows: Row[]) => [params.map((p) => csvCell(p.name)).join(','), ...rows.map((r) => r.map((v, i) => csvCell(params[i].values[v] ?? '')).join(','))].join('\n');
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** Parses CSV where each column is a parameter and each non-empty cell below the header is a value. */
export function paramsFromCsv(text: string): Param[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  return rows[0].map((name, i) => ({ name: name.trim() || `param${i + 1}`, values: [...new Set(rows.slice(1).map((r) => (r[i] ?? '').trim()).filter(Boolean))] })).filter((p) => p.values.length);
}
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
/** Reads an existing Examples table back into seed rows (A10). Unknown values are ignored. */
export function seedsFromExamples(table: string, params: Param[]): Row[] {
  const lines = table.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (lines.length < 2) return [];
  const cells = (l: string) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]);
  return lines.slice(1).map((l) => {
    const c = cells(l);
    return params.map((p) => { const h = head.findIndex((x) => eq(x, p.name)); return h < 0 ? -1 : p.values.findIndex((v) => eq(v, c[h] ?? '')); });
  }).filter((r) => r.some((v) => v >= 0));
}
