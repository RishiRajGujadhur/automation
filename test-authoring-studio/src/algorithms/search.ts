import { levenshtein, tokens } from './strings';

/* ------------------------------------------------------------------ C1 Trie */
type TrieNode = { kids: Map<string, TrieNode>; items: number[]; end: number[] };
/** Prefix trie over whole phrases (lower-cased). `complete` returns item ids whose text starts with the prefix. */
export class Trie {
  private root: TrieNode = { kids: new Map(), items: [], end: [] };
  private texts: string[] = [];
  private weights: number[] = [];
  insert(text: string, weight = 1) {
    const id = this.texts.length;
    this.texts.push(text);
    this.weights.push(weight);
    let n = this.root;
    for (const c of text.toLowerCase()) {
      let k = n.kids.get(c);
      if (!k) { k = { kids: new Map(), items: [], end: [] }; n.kids.set(c, k); }
      if (k.items.length < 400) k.items.push(id);
      n = k;
    }
    n.end.push(id);
    return id;
  }
  complete(prefix: string, limit = 10) {
    let n: TrieNode | undefined = this.root;
    for (const c of prefix.toLowerCase()) { n = n.kids.get(c); if (!n) return []; }
    const ids = prefix ? n.items : this.texts.map((_, i) => i);
    return [...new Set(ids)].sort((a, b) => this.weights[b] - this.weights[a] || this.texts[a].length - this.texts[b].length).slice(0, limit).map((i) => ({ text: this.texts[i], weight: this.weights[i] }));
  }
  get size() { return this.texts.length; }
}

/* ------------------------------------------------------------------ C2 Fuzzy subsequence (fzf-style) */
/** Score > 0 when every query char appears in order. Rewards consecutive runs and word-start hits. */
export function fuzzyScore(query: string, text: string): { score: number; positions: number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, ''), t = text.toLowerCase();
  if (!q) return { score: 1, positions: [] };
  const positions: number[] = [];
  let score = 0, ti = 0, run = 0;
  for (const c of q) {
    const at = t.indexOf(c, ti);
    if (at < 0) return null;
    const boundary = at === 0 || /[\s_\-./"(]/.test(t[at - 1]);
    run = positions.length && at === positions[positions.length - 1] + 1 ? run + 1 : 0;
    score += 1 + run * 2 + (boundary ? 3 : 0) - Math.min(3, (at - ti) * 0.1);
    positions.push(at);
    ti = at + 1;
  }
  return { score: score / Math.sqrt(t.length + 1), positions };
}

/* ------------------------------------------------------------------ C5 Inverted index, C3 BM25 */
export class InvertedIndex {
  postings = new Map<string, Map<number, number>>();
  lengths: number[] = [];
  add(doc: string[] | string) {
    const toks = typeof doc === 'string' ? tokens(doc) : doc;
    const id = this.lengths.length;
    this.lengths.push(toks.length);
    toks.forEach((t) => { const p = this.postings.get(t) ?? new Map(); p.set(id, (p.get(id) ?? 0) + 1); this.postings.set(t, p); });
    return id;
  }
  /** Ids of docs containing every term (AND). */
  lookup(terms: string[]) {
    const lists = terms.map((t) => this.postings.get(t));
    if (!lists.length || lists.some((l) => !l)) return [];
    return [...lists[0]!.keys()].filter((id) => lists.every((l) => l!.has(id)));
  }
  /** Okapi BM25 ranking (k1 = 1.2, b = 0.75). */
  bm25(query: string[] | string, limit = 20, k1 = 1.2, b = 0.75) {
    const q = typeof query === 'string' ? tokens(query) : query;
    const N = this.lengths.length, avg = this.lengths.reduce((a, x) => a + x, 0) / Math.max(1, N);
    const scores = new Map<number, number>();
    for (const term of new Set(q)) {
      const p = this.postings.get(term);
      if (!p) continue;
      const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
      p.forEach((tf, id) => scores.set(id, (scores.get(id) ?? 0) + idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * this.lengths[id]) / avg)))));
    }
    return [...scores].sort((x, y) => y[1] - x[1]).slice(0, limit).map(([id, score]) => ({ id, score }));
  }
}

/* ------------------------------------------------------------------ C4 BK-tree */
type BKNode = { word: string; kids: Map<number, BKNode> };
/** Burkhard–Keller tree over Levenshtein distance: "did you mean" lookups within k edits. */
export class BKTree {
  private root?: BKNode;
  add(word: string) {
    if (!this.root) { this.root = { word, kids: new Map() }; return; }
    let n = this.root;
    for (;;) {
      const d = levenshtein(word, n.word);
      if (d === 0) return;
      const k = n.kids.get(d);
      if (!k) { n.kids.set(d, { word, kids: new Map() }); return; }
      n = k;
    }
  }
  search(word: string, max = 2) {
    const out: { word: string; distance: number }[] = [];
    const stack = this.root ? [this.root] : [];
    while (stack.length) {
      const n = stack.pop()!;
      const d = levenshtein(word, n.word);
      if (d <= max) out.push({ word: n.word, distance: d });
      n.kids.forEach((k, dist) => { if (dist >= d - max && dist <= d + max) stack.push(k); });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }
}

/* ------------------------------------------------------------------ C8 Frecency */
/** Mozilla-style frecency: each use contributes a weight that decays with age (half-life in days). */
export function frecency(uses: number[], now = Date.now(), halfLifeDays = 7) {
  return uses.reduce((s, t) => s + Math.pow(0.5, (now - t) / (halfLifeDays * 864e5)), 0);
}
const FREC_KEY = 'tas:frecency';
export function recordUse(key: string) {
  try {
    const all = JSON.parse(localStorage.getItem(FREC_KEY) ?? '{}') as Record<string, number[]>;
    all[key] = [...(all[key] ?? []), Date.now()].slice(-20);
    localStorage.setItem(FREC_KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}
export function frecencyOf(key: string) {
  try { return frecency((JSON.parse(localStorage.getItem(FREC_KEY) ?? '{}') as Record<string, number[]>)[key] ?? []); } catch { return 0; }
}

/* ------------------------------------------------------------------ C9 Aho–Corasick */
/** Multi-pattern matcher: finds every occurrence of every pattern in one pass (case-insensitive). */
export class AhoCorasick {
  private goto: Map<string, number>[] = [new Map()];
  private fail: number[] = [0];
  private out: number[][] = [[]];
  constructor(private patterns: string[]) {
    patterns.forEach((p, pi) => {
      let s = 0;
      for (const c of p.toLowerCase()) {
        let n = this.goto[s].get(c);
        if (n === undefined) { n = this.goto.length; this.goto.push(new Map()); this.fail.push(0); this.out.push([]); this.goto[s].set(c, n); }
        s = n;
      }
      if (p) this.out[s].push(pi);
    });
    const queue: number[] = [];
    this.goto[0].forEach((n) => queue.push(n));
    while (queue.length) {
      const r = queue.shift()!;
      this.goto[r].forEach((u, c) => {
        queue.push(u);
        let f = this.fail[r];
        while (f && !this.goto[f].has(c)) f = this.fail[f];
        this.fail[u] = this.goto[f].get(c) ?? 0;
        if (this.fail[u] === u) this.fail[u] = 0;
        this.out[u] = [...this.out[u], ...this.out[this.fail[u]]];
      });
    }
  }
  search(text: string) {
    const hits: { start: number; end: number; pattern: number }[] = [];
    let s = 0;
    [...text.toLowerCase()].forEach((c, i) => {
      while (s && !this.goto[s].has(c)) s = this.fail[s];
      s = this.goto[s].get(c) ?? 0;
      for (const p of this.out[s]) hits.push({ start: i - this.patterns[p].length + 1, end: i + 1, pattern: p });
    });
    return hits;
  }
}
/** Non-overlapping highlight ranges, longest match first. */
export function highlightRanges(text: string, terms: string[]) {
  const words = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length > 1))];
  if (!words.length) return [];
  const hits = new AhoCorasick(words).search(text).sort((a, b) => a.start - b.start || b.end - a.end);
  const out: [number, number][] = [];
  let last = -1;
  for (const h of hits) if (h.start >= last) { out.push([h.start, h.end]); last = h.end; }
  return out;
}
