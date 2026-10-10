import { mulberry32 } from './random';

/* Model-based testing over a finite state machine. */
export type Edge = { from: string; to: string; label: string; weight: number; id: number };
export type Fsm = { states: string[]; edges: Edge[]; initial: string; finals: string[] };

/* ------------------------------------------------------------------ E1 parser */
/**
 * One transition per line:  `Cart -> Checkout : proceed to checkout [2]`
 * `start: Home`, `end: Confirmation, Cart` set initial/final states (defaults: first source / sinks).
 */
export function parseFsm(text: string): { fsm: Fsm; errors: string[] } {
  const edges: Edge[] = [], errors: string[] = [];
  let initial = '', finals: string[] = [];
  const states: string[] = [];
  const add = (s: string) => { if (!states.includes(s)) states.push(s); };
  text.split('\n').forEach((raw, i) => {
    const s = raw.replace(/#.*$/, '').trim();
    if (!s) return;
    const meta = /^(start|initial|end|final)s?\s*:\s*(.+)$/i.exec(s);
    if (meta) {
      const names = meta[2].split(',').map((x) => x.trim()).filter(Boolean);
      if (/^(start|initial)/i.test(meta[1])) { initial = names[0]; add(initial); } else { finals = names; names.forEach(add); }
      return;
    }
    const m = /^(.+?)\s*-+>\s*(.+?)(?:\s*:\s*(.+?))?(?:\s*\[(\d+(?:\.\d+)?)\])?$/.exec(s);
    if (!m) { errors.push(`Line ${i + 1}: expected "From -> To : action".`); return; }
    add(m[1]); add(m[2]);
    edges.push({ from: m[1], to: m[2], label: m[3] ?? `go to ${m[2]}`, weight: m[4] ? +m[4] : 1, id: edges.length });
  });
  if (!initial) initial = edges[0]?.from ?? states[0] ?? '';
  if (!finals.length) finals = states.filter((st) => !edges.some((e) => e.from === st));
  return { fsm: { states, edges, initial, finals }, errors };
}
const out = (g: Fsm, s: string) => g.edges.filter((e) => e.from === s);

/* ------------------------------------------------------------------ E2 BFS */
/** Fewest-transition path between two states. */
export function bfsPath(g: Fsm, from: string, to: string): Edge[] | null {
  if (from === to) return [];
  const prev = new Map<string, Edge>();
  const queue = [from], seen = new Set([from]);
  while (queue.length) {
    const s = queue.shift()!;
    for (const e of out(g, s)) {
      if (seen.has(e.to)) continue;
      seen.add(e.to); prev.set(e.to, e);
      if (e.to === to) { const path: Edge[] = []; let c = to; while (c !== from) { const pe = prev.get(c)!; path.unshift(pe); c = pe.from; } return path; }
      queue.push(e.to);
    }
  }
  return null;
}
const toFinal = (g: Fsm, from: string) => {
  if (g.finals.includes(from)) return [];
  let best: Edge[] | null = null;
  for (const f of g.finals) { const p = bfsPath(g, from, f); if (p && (!best || p.length < best.length)) best = p; }
  return best;
};

/* ------------------------------------------------------------------ E10 Dijkstra */
export function dijkstra(g: Fsm, from: string, to: string): { path: Edge[]; cost: number } | null {
  const dist = new Map(g.states.map((s) => [s, Infinity]));
  const prev = new Map<string, Edge>();
  dist.set(from, 0);
  const done = new Set<string>();
  while (done.size < g.states.length) {
    let u = '', best = Infinity;
    dist.forEach((d, s) => { if (!done.has(s) && d < best) { best = d; u = s; } });
    if (!u) break;
    done.add(u);
    if (u === to) break;
    for (const e of out(g, u)) { const nd = best + e.weight; if (nd < dist.get(e.to)!) { dist.set(e.to, nd); prev.set(e.to, e); } }
  }
  if (dist.get(to) === Infinity) return null;
  const path: Edge[] = [];
  let c = to;
  while (c !== from) { const e = prev.get(c)!; path.unshift(e); c = e.from; }
  return { path, cost: dist.get(to)! };
}

/* ------------------------------------------------------------------ E3 all simple paths */
export function simplePaths(g: Fsm, maxPaths = 200, maxLen = 12): Edge[][] {
  const res: Edge[][] = [];
  const rec = (s: string, path: Edge[], seen: Set<string>) => {
    if (res.length >= maxPaths) return;
    if (g.finals.includes(s) && path.length) { res.push(path.slice()); if (!out(g, s).length) return; }
    if (path.length >= maxLen) return;
    for (const e of out(g, s)) { if (seen.has(e.to)) continue; seen.add(e.to); path.push(e); rec(e.to, path, seen); path.pop(); seen.delete(e.to); }
  };
  rec(g.initial, [], new Set([g.initial]));
  return res;
}

/* ------------------------------------------------------------------ E4 state coverage */
/** Greedy: route to the nearest unvisited state, then on to a final state, until every reachable state is visited. */
export function stateCoverage(g: Fsm): Edge[][] {
  const reachable = reachableFrom(g, g.initial);
  const left = new Set([...reachable].filter((s) => s !== g.initial));
  const paths: Edge[][] = [];
  let guard = 0;
  while (left.size && guard++ < 500) {
    const path: Edge[] = [];
    let cur = g.initial;
    for (;;) {
      let next: Edge[] | null = null;
      for (const s of left) { const p = bfsPath(g, cur, s); if (p && (!next || p.length < next.length)) next = p; }
      if (!next) break;
      path.push(...next);
      next.forEach((e) => left.delete(e.to));
      cur = path[path.length - 1].to;
      if (!left.size) break;
    }
    const tail = toFinal(g, cur);
    if (tail) path.push(...tail);
    if (!path.length) break;
    paths.push(path);
  }
  return paths;
}

/* ------------------------------------------------------------------ E5 transition coverage */
export function transitionCoverage(g: Fsm): Edge[][] {
  const reachable = reachableFrom(g, g.initial);
  const left = new Set(g.edges.filter((e) => reachable.has(e.from)).map((e) => e.id));
  const paths: Edge[][] = [];
  let guard = 0;
  while (left.size && guard++ < 500) {
    const path: Edge[] = [];
    let cur = g.initial;
    for (let steps = 0; steps < 200; steps++) {
      const direct = out(g, cur).find((e) => left.has(e.id));
      if (direct) { path.push(direct); left.delete(direct.id); cur = direct.to; continue; }
      let best: Edge[] | null = null;
      for (const id of left) { const e = g.edges[id]; const p = bfsPath(g, cur, e.from); if (p && (!best || p.length + 1 < best.length)) best = [...p, e]; }
      if (!best) break;
      best.forEach((e) => left.delete(e.id));
      path.push(...best);
      cur = best[best.length - 1].to;
    }
    const tail = toFinal(g, cur);
    if (tail) path.push(...tail);
    if (!path.length) break;
    paths.push(path);
  }
  return paths;
}

/* ------------------------------------------------------------------ E6 N-switch (1-switch = transition pairs) */
export function nSwitchCoverage(g: Fsm, n = 1): Edge[][] {
  // Targets: every chain of n+1 consecutive transitions.
  let chains: Edge[][] = g.edges.map((e) => [e]);
  for (let k = 0; k < n; k++) chains = chains.flatMap((c) => out(g, c[c.length - 1].to).map((e) => [...c, e]));
  const key = (c: Edge[]) => c.map((e) => e.id).join('>');
  const left = new Set(chains.map(key));
  const paths: Edge[][] = [];
  const covered = (p: Edge[]) => { for (let i = 0; i + n < p.length; i++) left.delete(key(p.slice(i, i + n + 1))); };
  for (const c of chains) {
    if (!left.has(key(c))) continue;
    const head = bfsPath(g, g.initial, c[0].from);
    const tail = toFinal(g, c[c.length - 1].to);
    if (!head || !tail) { left.delete(key(c)); continue; }
    const p = [...head, ...c, ...tail];
    covered(p);
    paths.push(p);
  }
  return paths;
}

/* ------------------------------------------------------------------ E7 prime paths */
/** Prime paths (Ammann & Offutt): maximal simple paths, each extended from the initial state to a final state. */
export function primePaths(g: Fsm, limit = 300): Edge[][] {
  const simple: Edge[][] = [];
  const seen = (p: Edge[]) => new Set([p[0].from, ...p.map((e) => e.to)]);
  let frontier: Edge[][] = g.edges.map((e) => [e]);
  while (frontier.length && simple.length < limit * 4) {
    simple.push(...frontier);
    frontier = frontier.flatMap((p) => {
      const last = p[p.length - 1];
      if (last.to === p[0].from) return []; // cycle closed
      const s = seen(p);
      return out(g, last.to).filter((e) => !s.has(e.to) || e.to === p[0].from).map((e) => [...p, e]);
    });
  }
  const sub = (a: Edge[], b: Edge[]) => a.length < b.length && b.map((e) => e.id).join(',').includes(a.map((e) => e.id).join(','));
  const primes = simple.filter((p) => !simple.some((q) => sub(p, q))).slice(0, limit);
  return primes.flatMap((p) => { const head = bfsPath(g, g.initial, p[0].from), tail = toFinal(g, p[p.length - 1].to); return head && tail ? [[...head, ...p, ...tail]] : []; });
}

/* ------------------------------------------------------------------ E9 Hierholzer, E8 Chinese postman */
/** Eulerian circuit or trail over the given edge multiset (Hierholzer). Returns null if none exists. */
export function hierholzer(edges: Edge[], start: string): Edge[] | null {
  const adj = new Map<string, Edge[]>();
  edges.forEach((e) => (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e));
  const stack: { state: string; via?: Edge }[] = [{ state: start }];
  const trail: Edge[] = [];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const list = adj.get(top.state);
    if (list?.length) { const e = list.pop()!; stack.push({ state: e.to, via: e }); }
    else { stack.pop(); if (top.via) trail.unshift(top.via); }
  }
  return trail.length === edges.length ? trail : null;
}
/**
 * Directed Chinese postman: duplicate shortest paths from surplus-in to surplus-out states (greedy pairing)
 * until in/out degrees balance, then walk an Eulerian circuit from the initial state.
 */
export function chinesePostman(g: Fsm): Edge[] | null {
  const reach = reachableFrom(g, g.initial);
  const edges = g.edges.filter((e) => reach.has(e.from));
  if (!edges.length) return [];
  const delta = new Map<string, number>();
  edges.forEach((e) => { delta.set(e.from, (delta.get(e.from) ?? 0) + 1); delta.set(e.to, (delta.get(e.to) ?? 0) - 1); });
  const needOut: string[] = [], needIn: string[] = [];
  delta.forEach((d, s) => { for (let i = 0; i < Math.abs(d); i++) (d < 0 ? needOut : needIn).push(s); });
  const extra: Edge[] = [];
  for (const from of needOut) {
    let best = -1, bestPath: Edge[] | null = null;
    needIn.forEach((to, i) => { const p = dijkstra(g, from, to); if (p && (!bestPath || p.path.length < bestPath.length)) { best = i; bestPath = p.path; } });
    if (!bestPath) return null; // not strongly connected
    extra.push(...(bestPath as Edge[]));
    needIn.splice(best, 1);
  }
  return hierholzer([...edges, ...extra], g.initial);
}

/* ------------------------------------------------------------------ E11 Tarjan SCC */
export function tarjan(g: Fsm): string[][] {
  let idx = 0;
  const index = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>(), stack: string[] = [], res: string[][] = [];
  const strong = (v: string) => {
    index.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v);
    for (const e of out(g, v)) {
      if (!index.has(e.to)) { strong(e.to); low.set(v, Math.min(low.get(v)!, low.get(e.to)!)); }
      else if (on.has(e.to)) low.set(v, Math.min(low.get(v)!, index.get(e.to)!));
    }
    if (low.get(v) === index.get(v)) { const c: string[] = []; let w: string; do { w = stack.pop()!; on.delete(w); c.push(w); } while (w !== v); res.push(c); }
  };
  g.states.forEach((s) => { if (!index.has(s)) strong(s); });
  return res;
}

/* ------------------------------------------------------------------ E12 Kahn topological sort */
export function kahn(nodes: string[], deps: [string, string][]): { order: string[]; cycle: string[] } {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  deps.forEach(([, b]) => indeg.set(b, (indeg.get(b) ?? 0) + 1));
  const queue = nodes.filter((n) => !indeg.get(n));
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    deps.filter(([a]) => a === n).forEach(([, b]) => { indeg.set(b, indeg.get(b)! - 1); if (!indeg.get(b)) queue.push(b); });
  }
  return { order, cycle: nodes.filter((n) => !order.includes(n)) };
}

/* ------------------------------------------------------------------ E13 reachability */
export function reachableFrom(g: Fsm, s: string) {
  const seen = new Set([s]), q = [s];
  while (q.length) for (const e of out(g, q.shift()!)) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
  return seen;
}
/** Unreachable states, and dead states (reachable, not final, and unable to reach any final state). */
export function deadStates(g: Fsm) {
  const reach = reachableFrom(g, g.initial);
  const unreachable = g.states.filter((s) => !reach.has(s));
  const dead = [...reach].filter((s) => !g.finals.includes(s) && ![...reachableFrom(g, s)].some((x) => g.finals.includes(x)));
  return { unreachable, dead };
}

/* ------------------------------------------------------------------ E14 random walk */
export function randomWalks(g: Fsm, count = 5, seed = 1, maxLen = 15): Edge[][] {
  const rnd = mulberry32(seed);
  const res: Edge[][] = [];
  for (let i = 0; i < count; i++) {
    const p: Edge[] = [];
    let cur = g.initial;
    while (p.length < maxLen) {
      const opts = out(g, cur);
      if (!opts.length || (g.finals.includes(cur) && rnd() < 0.35)) break;
      const e = opts[Math.floor(rnd() * opts.length)];
      p.push(e); cur = e.to;
    }
    const tail = toFinal(g, cur);
    if (tail) p.push(...tail);
    if (p.length && !res.some((r) => r.map((e) => e.id).join() === p.map((e) => e.id).join())) res.push(p);
  }
  return res;
}

/* ------------------------------------------------------------------ output */
export function pathsToGherkin(g: Fsm, paths: Edge[][], title = 'Flow') {
  return paths.map((p, i) => {
    const lines = [`  Scenario: ${title} ${i + 1}: ${[p[0]?.from ?? g.initial, ...p.map((e) => e.to)].join(' → ')}`, `    Given the user is on the ${g.initial} screen`];
    p.forEach((e, k) => lines.push(`    ${k === 0 ? 'When' : 'And'} the user ${e.label}`));
    lines.push(`    Then the user is on the ${p.length ? p[p.length - 1].to : g.initial} screen`);
    return lines.join('\n');
  }).join('\n\n');
}
export const edgeCoverage = (g: Fsm, paths: Edge[][]) => { const ids = new Set(paths.flat().map((e) => e.id)); return { covered: ids.size, total: g.edges.length }; };
export const stateCoverageOf = (g: Fsm, paths: Edge[][]) => { const s = new Set([g.initial, ...paths.flat().map((e) => e.to)]); return { covered: s.size, total: g.states.length }; };
