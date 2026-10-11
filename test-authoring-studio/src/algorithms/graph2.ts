import { bfsPath, dijkstra, reachableFrom, tarjan, type Edge, type Fsm } from './graph';

const toFinal = (g: Fsm, s: string) => {
  if (g.finals.includes(s)) return [];
  let best: Edge[] | null = null;
  for (const f of g.finals) { const p = bfsPath(g, s, f); if (p && (!best || p.length < best.length)) best = p; }
  return best;
};

/* ------------------------------------------------------------------ K1 Floyd–Warshall */
export function floydWarshall(g: Fsm) {
  const n = g.states.length, idx = new Map(g.states.map((s, i) => [s, i]));
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  g.edges.forEach((e) => { const a = idx.get(e.from)!, b = idx.get(e.to)!; d[a][b] = Math.min(d[a][b], e.weight); });
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
  return { states: g.states, distance: d };
}

/* ------------------------------------------------------------------ K2 cyclomatic complexity */
/** M = E − N + 2P over the reachable part of the model (P = weakly connected components). */
export function cyclomatic(g: Fsm) {
  const reach = reachableFrom(g, g.initial);
  const edges = g.edges.filter((e) => reach.has(e.from));
  const nodes = [...reach];
  // weakly connected components
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  edges.forEach((e) => parent.set(find(e.from), find(e.to)));
  const p = new Set(nodes.map(find)).size;
  return edges.length - nodes.length + 2 * p;
}

/* ------------------------------------------------------------------ K3 basis paths */
/** McCabe basis set: a BFS spanning tree from the start, plus one path through each non-tree edge, extended to an end state. */
export function basisPaths(g: Fsm): Edge[][] {
  const reach = reachableFrom(g, g.initial);
  const tree = new Map<string, Edge>(); // state → edge that first reached it
  const q = [g.initial], seen = new Set([g.initial]);
  while (q.length) { const s = q.shift()!; for (const e of g.edges.filter((x) => x.from === s)) if (!seen.has(e.to)) { seen.add(e.to); tree.set(e.to, e); q.push(e.to); } }
  const treeIds = new Set([...tree.values()].map((e) => e.id));
  const pathTo = (s: string) => { const p: Edge[] = []; let c = s; while (c !== g.initial) { const e = tree.get(c); if (!e) break; p.unshift(e); c = e.from; } return p; };
  const out: Edge[][] = [];
  const base = toFinal(g, g.initial);
  if (base) out.push(base);
  for (const e of g.edges) {
    if (treeIds.has(e.id) || !reach.has(e.from)) continue;
    const tail = toFinal(g, e.to);
    if (tail) out.push([...pathTo(e.from), e, ...tail]);
  }
  // Tree edges not yet on any path (leaves that are not final) still need a path.
  const covered = new Set(out.flat().map((e) => e.id));
  for (const e of tree.values()) if (!covered.has(e.id)) { const tail = toFinal(g, e.to); if (tail) { const p = [...pathTo(e.to), ...tail]; out.push(p); p.forEach((x) => covered.add(x.id)); } }
  return out;
}

/* ------------------------------------------------------------------ K4 Yen's k shortest paths */
export function yenKShortest(g: Fsm, from: string, to: string, k = 3): { path: Edge[]; cost: number }[] {
  const first = dijkstra(g, from, to);
  if (!first) return [];
  const A = [first];
  const B: { path: Edge[]; cost: number }[] = [];
  const key = (p: Edge[]) => p.map((e) => e.id).join(',');
  for (let i = 1; i < k; i++) {
    const prev = A[i - 1].path;
    for (let j = 0; j < prev.length; j++) {
      const spurNode = j === 0 ? from : prev[j - 1].to;
      const root = prev.slice(0, j);
      const removed = new Set<number>();
      A.forEach((a) => { if (key(a.path.slice(0, j)) === key(root) && a.path[j]) removed.add(a.path[j].id); });
      const rootStates = new Set([from, ...root.map((e) => e.to)]);
      rootStates.delete(spurNode);
      const sub: Fsm = { ...g, edges: g.edges.filter((e) => !removed.has(e.id) && !rootStates.has(e.from) && !rootStates.has(e.to)) };
      const spur = dijkstra(sub, spurNode, to);
      if (!spur) continue;
      const total = [...root, ...spur.path];
      if (![...A, ...B].some((x) => key(x.path) === key(total))) B.push({ path: total, cost: total.reduce((s, e) => s + e.weight, 0) });
    }
    if (!B.length) break;
    B.sort((a, b) => a.cost - b.cost || a.path.length - b.path.length);
    A.push(B.shift()!);
  }
  return A;
}

/* ------------------------------------------------------------------ K5 Markov usage model */
/** Edge weights are read as relative usage frequencies; probabilities are normalised per state. */
export function transitionProbabilities(g: Fsm) {
  const p = new Map<number, number>();
  for (const s of g.states) {
    const out = g.edges.filter((e) => e.from === s);
    const total = out.reduce((a, e) => a + e.weight, 0) || 1;
    out.forEach((e) => p.set(e.id, e.weight / total));
  }
  return p;
}
/** Most probable start-to-end paths (best-first search on −log p). */
export function mostProbablePaths(g: Fsm, k = 5, maxLen = 15): { path: Edge[]; probability: number }[] {
  const prob = transitionProbabilities(g);
  const out: { path: Edge[]; probability: number }[] = [];
  const frontier: { state: string; path: Edge[]; p: number }[] = [{ state: g.initial, path: [], p: 1 }];
  let guard = 0;
  while (frontier.length && out.length < k && guard++ < 20000) {
    frontier.sort((a, b) => b.p - a.p);
    const cur = frontier.shift()!;
    if (g.finals.includes(cur.state) && cur.path.length) { out.push({ path: cur.path, probability: cur.p }); continue; }
    if (cur.path.length >= maxLen) continue;
    for (const e of g.edges.filter((x) => x.from === cur.state)) frontier.push({ state: e.to, path: [...cur.path, e], p: cur.p * (prob.get(e.id) ?? 0) });
  }
  return out;
}
/** Long-run share of time in each state (power iteration; final states restart at the initial state). */
export function stationaryDistribution(g: Fsm, iterations = 200) {
  const prob = transitionProbabilities(g);
  let v = new Map(g.states.map((s) => [s, s === g.initial ? 1 : 0]));
  for (let i = 0; i < iterations; i++) {
    const next = new Map(g.states.map((s) => [s, 0]));
    for (const s of g.states) {
      const mass = v.get(s)!;
      const out = g.edges.filter((e) => e.from === s);
      if (!out.length) next.set(g.initial, next.get(g.initial)! + mass);
      else out.forEach((e) => next.set(e.to, next.get(e.to)! + mass * (prob.get(e.id) ?? 0)));
    }
    v = next;
  }
  return v;
}

/* ------------------------------------------------------------------ K6 PageRank */
export function pageRank(g: Fsm, damping = 0.85, iterations = 60) {
  const n = g.states.length || 1;
  let r = new Map(g.states.map((s) => [s, 1 / n]));
  for (let i = 0; i < iterations; i++) {
    const next = new Map(g.states.map((s) => [s, (1 - damping) / n]));
    for (const s of g.states) {
      const out = g.edges.filter((e) => e.from === s);
      if (!out.length) g.states.forEach((t) => next.set(t, next.get(t)! + (damping * r.get(s)!) / n));
      else out.forEach((e) => next.set(e.to, next.get(e.to)! + (damping * r.get(s)!) / out.length));
    }
    r = next;
  }
  return [...r].sort((a, b) => b[1] - a[1]);
}

/* ------------------------------------------------------------------ J12 sneak paths */
/** State × action pairs the model does not define: each should be rejected (negative tests). */
export function sneakPaths(g: Fsm) {
  const actions = [...new Set(g.edges.map((e) => e.label))];
  const reach = reachableFrom(g, g.initial);
  return [...reach].flatMap((s) => actions.filter((a) => !g.edges.some((e) => e.from === s && e.label === a)).map((action) => ({ state: s, action, path: bfsPath(g, g.initial, s) ?? [] })));
}
export const hubStates = (g: Fsm) => tarjan(g).filter((c) => c.length > 1);
