import { syllables } from './quality';
import { STOPWORDS, tokens } from './strings';

/* ------------------------------------------------------------------ N1 Gunning fog */
/** 0.4 × (words/sentence + 100 × complex words/words); complex = 3+ syllables. Each step is a sentence. */
export function gunningFog(sentences: string[]) {
  const words = sentences.flatMap((s) => s.replace(/"[^"]*"/g, 'value').match(/[A-Za-z]+/g) ?? []);
  if (!words.length) return 0;
  const complex = words.filter((w) => syllables(w) >= 3 && !/(es|ed|ing)$/i.test(w)).length;
  return 0.4 * (words.length / Math.max(1, sentences.length) + (100 * complex) / words.length);
}
/* ------------------------------------------------------------------ N2 lexical diversity */
export const typeTokenRatio = (texts: string[]) => { const t = texts.flatMap(tokens); return t.length ? new Set(t).size / t.length : 1; };

/* ------------------------------------------------------------------ N3 passive voice, N4 vague words */
const IRREGULAR = 'been|born|built|bought|caught|chosen|done|drawn|driven|eaten|fallen|found|given|gone|hidden|held|kept|known|laid|led|left|lost|made|meant|met|paid|put|read|run|said|seen|sent|set|shown|shut|sold|spent|stolen|taken|taught|thrown|told|understood|won|written';
const PASSIVE = new RegExp(`\\b(am|is|are|was|were|be|been|being|gets|got)\\s+(\\w+ly\\s+)?(\\w+ed|${IRREGULAR})\\b`, 'i');
export const isPassive = (s: string) => PASSIVE.test(s.replace(/"[^"]*"/g, ''));
/** Requirements-smell vocabulary (Femmer et al.): subjective, vague and loophole terms. */
export const VAGUE = ['appropriate', 'appropriately', 'adequate', 'as needed', 'etc', 'fast', 'quickly', 'easy', 'easily', 'user-friendly', 'properly', 'correctly', 'some', 'several', 'various', 'many', 'few', 'normal', 'usually', 'often', 'sometimes', 'possibly', 'maybe', 'if possible', 'and/or', 'reasonable', 'efficient', 'flexible', 'robust', 'seamless', 'intuitive', 'should work', 'works fine', 'as expected', 'successfully'];
export function vagueTerms(s: string) {
  const t = ' ' + s.toLowerCase().replace(/"[^"]*"/g, ' ').replace(/[^a-z/\- ]/g, ' ') + ' ';
  return VAGUE.filter((w) => t.includes(` ${w} `));
}

/* ------------------------------------------------------------------ N5 RAKE */
/** Rapid Automatic Keyword Extraction: candidate phrases split at stop words, scored by degree/frequency. */
export function rake(texts: string[], top = 10) {
  const phrases: string[][] = [];
  for (const t of texts) {
    let cur: string[] = [];
    for (const w of t.toLowerCase().replace(/"[^"]*"/g, ' | ').split(/[^a-z0-9|]+/)) {
      if (!w || w === '|' || STOPWORDS.has(w) || /^(given|when|then|and|but|user|the)$/.test(w)) { if (cur.length) phrases.push(cur); cur = []; } else cur.push(w);
    }
    if (cur.length) phrases.push(cur);
  }
  const freq = new Map<string, number>(), degree = new Map<string, number>();
  phrases.forEach((p) => p.forEach((w) => { freq.set(w, (freq.get(w) ?? 0) + 1); degree.set(w, (degree.get(w) ?? 0) + p.length - 1); }));
  const score = new Map<string, number>();
  phrases.forEach((p) => { const k = p.join(' '); score.set(k, p.reduce((s, w) => s + (degree.get(w)! + freq.get(w)!) / freq.get(w)!, 0)); });
  return [...score].sort((a, b) => b[1] - a[1]).slice(0, top).map(([phrase, s]) => ({ phrase, score: s }));
}

/* ------------------------------------------------------------------ N6 next-step model */
/** Bigram Markov model over step sequences: P(next | current) with counts. */
export function nextStepModel(sequences: string[][]) {
  const counts = new Map<string, Map<string, number>>();
  for (const seq of sequences) for (let i = 0; i < seq.length; i++) {
    const cur = i ? seq[i - 1] : '<start>';
    const m = counts.get(cur) ?? counts.set(cur, new Map()).get(cur)!;
    m.set(seq[i], (m.get(seq[i]) ?? 0) + 1);
  }
  return (current: string, k = 5) => {
    const m = counts.get(current);
    if (!m) return [];
    const total = [...m.values()].reduce((a, x) => a + x, 0);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([step, n]) => ({ step, probability: n / total, count: n }));
  };
}

/* ------------------------------------------------------------------ N7 frequent sequences */
/** Contiguous step runs (length ≥ 2) appearing in at least `minSupport` scenarios; prefix runs are Background candidates. */
export function frequentSequences(sequences: string[][], minSupport = 2, maxLen = 6) {
  const support = new Map<string, { seq: string[]; scenarios: Set<number>; prefix: number }>();
  sequences.forEach((s, si) => {
    for (let len = 2; len <= Math.min(maxLen, s.length); len++) for (let i = 0; i + len <= s.length; i++) {
      const seq = s.slice(i, i + len), key = seq.join('\u0001');
      const e = support.get(key) ?? support.set(key, { seq, scenarios: new Set(), prefix: 0 }).get(key)!;
      if (!e.scenarios.has(si) && i === 0) e.prefix++;
      e.scenarios.add(si);
    }
  });
  const rows = [...support.values()].filter((e) => e.scenarios.size >= minSupport);
  // Keep maximal sequences only (drop those contained in a longer one with the same support).
  return rows.filter((r) => !rows.some((o) => o !== r && o.seq.length > r.seq.length && o.scenarios.size === r.scenarios.size && o.seq.join('\u0001').includes(r.seq.join('\u0001'))))
    .map((r) => ({ steps: r.seq, support: r.scenarios.size, asPrefix: r.prefix }))
    .sort((a, b) => b.support * b.steps.length - a.support * a.steps.length);
}

/* ------------------------------------------------------------------ N8 Needleman–Wunsch */
/** Global alignment of two step sequences; `sim` scores a pair (0–1). Gaps cost `gap`. */
export function needlemanWunsch(a: string[], b: string[], sim: (x: string, y: string) => number, gap = -0.4) {
  const n = a.length, m = b.length;
  const S = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j * gap : j === 0 ? i * gap : 0)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) S[i][j] = Math.max(S[i - 1][j - 1] + (sim(a[i - 1], b[j - 1]) * 2 - 1), S[i - 1][j] + gap, S[i][j - 1] + gap);
  const out: { a?: string; b?: string; score?: number }[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(S[i][j] - (S[i - 1][j - 1] + (sim(a[i - 1], b[j - 1]) * 2 - 1))) < 1e-9) { out.unshift({ a: a[i - 1], b: b[j - 1], score: sim(a[i - 1], b[j - 1]) }); i--; j--; }
    else if (i > 0 && Math.abs(S[i][j] - (S[i - 1][j] + gap)) < 1e-9) { out.unshift({ a: a[i - 1] }); i--; }
    else { out.unshift({ b: b[j - 1] }); j--; }
  }
  return { alignment: out, score: S[n][m] };
}
/* ------------------------------------------------------------------ N10 Hamming over step sequences */
export const stepHamming = (a: string[], b: string[]) => (a.length === b.length ? a.reduce((d, s, i) => d + (s === b[i] ? 0 : 1), 0) : NaN);

/* ------------------------------------------------------------------ N9 Apriori association rules */
export function associationRules(transactions: string[][], minSupport = 0.1, minConfidence = 0.6) {
  const n = transactions.length;
  if (!n) return [];
  const sets = transactions.map((t) => new Set(t));
  const sup = (items: string[]) => sets.filter((s) => items.every((i) => s.has(i))).length / n;
  let level = [...new Set(transactions.flat())].map((i) => [i]).filter((c) => sup(c) >= minSupport);
  const frequent: string[][] = [...level];
  for (let k = 2; level.length && k <= 4; k++) {
    const cands = new Map<string, string[]>();
    for (let a = 0; a < level.length; a++) for (let b = a + 1; b < level.length; b++) {
      const u = [...new Set([...level[a], ...level[b]])].sort();
      if (u.length === k) cands.set(u.join('|'), u);
    }
    level = [...cands.values()].filter((c) => sup(c) >= minSupport);
    frequent.push(...level);
  }
  const rules: { if: string[]; then: string[]; support: number; confidence: number; lift: number }[] = [];
  for (const f of frequent.filter((x) => x.length > 1)) {
    const s = sup(f);
    for (const item of f) {
      const lhs = f.filter((x) => x !== item);
      const conf = s / sup(lhs);
      if (conf >= minConfidence) rules.push({ if: lhs, then: [item], support: s, confidence: conf, lift: conf / sup([item]) });
    }
  }
  return rules.sort((a, b) => b.lift - a.lift || b.confidence - a.confidence);
}
/* ------------------------------------------------------------------ N11 tag entropy */
/** Normalised Shannon entropy of tag usage: 1 = tags spread evenly, near 0 = one tag dominates. */
export function tagEntropy(tagSets: string[][]) {
  const counts = new Map<string, number>();
  tagSets.flat().forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  const total = [...counts.values()].reduce((a, x) => a + x, 0);
  if (counts.size < 2) return 0;
  const h = -[...counts.values()].reduce((a, c) => a + (c / total) * Math.log2(c / total), 0);
  return h / Math.log2(counts.size);
}
