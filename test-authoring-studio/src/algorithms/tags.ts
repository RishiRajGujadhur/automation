/* Tag expressions, co-occurrence and status roll-ups. */

/* ------------------------------------------------------------------ I1 Tag expressions (shunting-yard) */
type Tok = { t: 'id'; v: string } | { t: 'op'; v: 'and' | 'or' | 'not' } | { t: '(' } | { t: ')' };
export type Expr = { op: 'id'; v: string } | { op: 'not'; a: Expr } | { op: 'and' | 'or'; a: Expr; b: Expr };
function lex(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(\(|\)|&&|\|\||!|[^\s()!&|]+)/gy;
  let m: RegExpExecArray | null, end = 0;
  while ((m = re.exec(s))) {
    end = re.lastIndex;
    const x = m[1], l = x.toLowerCase();
    if (x === '(') out.push({ t: '(' }); else if (x === ')') out.push({ t: ')' });
    else if (l === 'and' || x === '&&') out.push({ t: 'op', v: 'and' });
    else if (l === 'or' || x === '||') out.push({ t: 'op', v: 'or' });
    else if (l === 'not' || x === '!') out.push({ t: 'op', v: 'not' });
    else out.push({ t: 'id', v: x });
  }
  if (s.slice(end).trim()) throw new Error(`Unexpected "${s.slice(end).trim()}".`);
  return out;
}
/** Cucumber-style tag expression: `@smoke and not (@slow or @wip)`. Throws on syntax errors. */
export function parseTagExpression(src: string): Expr | null {
  const toks = lex(src);
  if (!toks.length) return null;
  const prec = { or: 1, and: 2, not: 3 } as const;
  const output: Expr[] = [], ops: (Tok & { t: 'op' | '(' })[] = [];
  const reduce = () => {
    const o = ops.pop()!;
    if (o.t !== 'op') throw new Error('Unbalanced parentheses.');
    if (o.v === 'not') { const a = output.pop(); if (!a) throw new Error('"not" needs an operand.'); output.push({ op: 'not', a }); }
    else { const b = output.pop(), a = output.pop(); if (!a || !b) throw new Error(`"${o.v}" needs two operands.`); output.push({ op: o.v, a, b }); }
  };
  let expectOperand = true;
  for (const t of toks) {
    if (t.t === 'id') { if (!expectOperand) throw new Error(`Missing operator before "${t.v}".`); output.push({ op: 'id', v: t.v }); expectOperand = false; }
    else if (t.t === '(') { ops.push(t); expectOperand = true; }
    else if (t.t === ')') { while (ops.length && ops[ops.length - 1].t !== '(') reduce(); if (!ops.length) throw new Error('Unbalanced parentheses.'); ops.pop(); expectOperand = false; }
    else {
      if (t.v === 'not') { if (!expectOperand) throw new Error('Missing operator before "not".'); ops.push(t); continue; }
      if (expectOperand) throw new Error(`"${t.v}" needs a left operand.`);
      while (ops.length) { const top = ops[ops.length - 1]; if (top.t === 'op' && prec[top.v] >= prec[t.v]) reduce(); else break; }
      ops.push(t); expectOperand = true;
    }
  }
  while (ops.length) reduce();
  if (output.length !== 1) throw new Error('Incomplete expression.');
  return output[0];
}
export function evaluate(e: Expr | null, has: (id: string) => boolean): boolean {
  if (!e) return true;
  switch (e.op) {
    case 'id': return has(e.v);
    case 'not': return !evaluate(e.a, has);
    case 'and': return evaluate(e.a, has) && evaluate(e.b, has);
    case 'or': return evaluate(e.a, has) || evaluate(e.b, has);
  }
}
export const matchTags = (e: Expr | null, tags: string[]) => { const set = new Set(tags.map((t) => t.toLowerCase())); return evaluate(e, (id) => set.has(id.toLowerCase())); };
export const identifiers = (e: Expr | null): string[] => (!e ? [] : e.op === 'id' ? [e.v] : e.op === 'not' ? identifiers(e.a) : [...identifiers(e.a), ...identifiers(e.b)]);

/* ------------------------------------------------------------------ I2 co-occurrence */
export function cooccurrence(tagSets: string[][]) {
  const tags = [...new Set(tagSets.flat())].sort();
  const idx = new Map(tags.map((t, i) => [t, i]));
  const m = tags.map(() => new Array(tags.length).fill(0));
  tagSets.forEach((set) => { const u = [...new Set(set)]; u.forEach((a) => u.forEach((b) => m[idx.get(a)!][idx.get(b)!]++)); });
  return { tags, matrix: m };
}

/* ------------------------------------------------------------------ I3 status roll-up */
export type Status = 'passed' | 'failed' | 'skipped' | 'unknown';
/** Worst-status-wins aggregation: failed > unknown > skipped > passed. */
export function rollup(statuses: Status[]): Status {
  if (!statuses.length) return 'unknown';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.every((s) => s === 'skipped')) return 'skipped';
  return 'passed';
}
export function rollupTree(items: { path: string; status: Status }[]) {
  const folders = new Map<string, Status[]>();
  items.forEach((i) => { const parts = i.path.split('/'); for (let k = 0; k < parts.length - 1; k++) { const key = parts.slice(0, k + 1).join('/'); (folders.get(key) ?? folders.set(key, []).get(key)!).push(i.status); } });
  return new Map([...folders].map(([k, v]) => [k, { status: rollup(v), counts: count(v) }]));
}
export const count = (v: Status[]) => ({ passed: v.filter((s) => s === 'passed').length, failed: v.filter((s) => s === 'failed').length, skipped: v.filter((s) => s === 'skipped').length, unknown: v.filter((s) => s === 'unknown').length });
