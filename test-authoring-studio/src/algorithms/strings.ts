/* String similarity, phonetics and normalization. All functions are pure and deterministic. */

/* ------------------------------------------------------------------ B1 Levenshtein */
export function levenshtein(a: string, b: string, max = Infinity) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
export const levenshteinRatio = (a: string, b: string) => (a.length || b.length ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1);

/* ------------------------------------------------------------------ B2 Damerau–Levenshtein (optimal string alignment) */
export function damerau(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/* ------------------------------------------------------------------ B3 Jaro–Winkler */
export function jaroWinkler(a: string, b: string, p = 0.1) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
    if (bm[j] || a[i] !== b[j]) continue;
    am[i] = bm[j] = true; m++; break;
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) { if (!am[i]) continue; while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let l = 0;
  while (l < 4 && a[l] === b[l]) l++;
  return jaro + l * p * (1 - jaro);
}

/* ------------------------------------------------------------------ B4 LCS */
export function lcsLength<T>(a: T[] | string, b: T[] | string) {
  const A = [...a], B = [...b];
  let prev = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    const cur = [0];
    for (let j = 1; j <= B.length; j++) cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[B.length];
}
export const lcsRatio = (a: string, b: string) => (a.length + b.length ? (2 * lcsLength(a, b)) / (a.length + b.length) : 1);

/* ------------------------------------------------------------------ tokens */
export const tokens = (s: string): string[] => s.toLowerCase().replace(/"[^"]*"|'[^']*'|<[^>]+>/g, ' _ ').match(/[a-z0-9_]+/g) ?? [];

/* ------------------------------------------------------------------ B5 Jaccard, B6 Dice */
export function jaccard(a: string[] | Set<string>, b: string[] | Set<string>) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export const bigrams = (s: string) => { const x = s.toLowerCase().replace(/\s+/g, ' '); const out: string[] = []; for (let i = 0; i < x.length - 1; i++) out.push(x.slice(i, i + 2)); return out; };
export function dice(a: string, b: string) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.length && !B.length) return 1;
  const counts = new Map<string, number>();
  A.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1));
  let inter = 0;
  for (const g of B) { const c = counts.get(g) ?? 0; if (c > 0) { inter++; counts.set(g, c - 1); } }
  return (2 * inter) / (A.length + B.length);
}

/* ------------------------------------------------------------------ B7 TF-IDF cosine */
export function tfidfVectors(docs: string[][]) {
  const df = new Map<string, number>();
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const N = docs.length;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    d.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    const v = new Map<string, number>();
    tf.forEach((n, t) => v.set(t, (n / d.length) * Math.log(1 + N / (df.get(t) ?? 1))));
    return v;
  });
}
export function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0, na = 0, nb = 0;
  a.forEach((x, k) => { na += x * x; const y = b.get(k); if (y) dot += x * y; });
  b.forEach((y) => (nb += y * y));
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/* ------------------------------------------------------------------ B8 NCD with LZW */
export function lzwLength(s: string) {
  const dict = new Map<string, number>();
  for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  let w = '', out = 0, code = 256;
  for (const c of s) {
    const wc = w + c;
    if (dict.has(wc)) w = wc;
    else { out++; dict.set(wc, code++); w = c; }
  }
  return out + (w ? 1 : 0);
}
/** Normalized compression distance: 0 = identical information, ~1 = unrelated. */
export function ncd(a: string, b: string) {
  const ca = lzwLength(a), cb = lzwLength(b), cab = lzwLength(a + b);
  return Math.max(ca, cb) ? (cab - Math.min(ca, cb)) / Math.max(ca, cb) : 0;
}

/* ------------------------------------------------------------------ hashing */
export function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/* ------------------------------------------------------------------ B9 SimHash (32-bit) */
export function simhash(toks: string[]) {
  const v = new Array(32).fill(0);
  for (const t of toks) { const h = fnv1a(t); for (let i = 0; i < 32; i++) v[i] += (h >>> i) & 1 ? 1 : -1; }
  let out = 0;
  for (let i = 0; i < 32; i++) if (v[i] > 0) out |= 1 << i;
  return out >>> 0;
}
export const hamming32 = (a: number, b: number) => { let x = (a ^ b) >>> 0, c = 0; while (x) { x &= x - 1; c++; } return c; };

/* ------------------------------------------------------------------ B10 MinHash + LSH */
export function minhash(toks: string[], k = 32) {
  const set = [...new Set(toks)];
  return Array.from({ length: k }, (_, i) => (set.length ? Math.min(...set.map((t) => fnv1a(i + ':' + t))) : 0));
}
export const minhashSimilarity = (a: number[], b: number[]) => a.filter((x, i) => x === b[i]).length / a.length;
/** LSH banding: items sharing any band hash become candidate pairs (indices i<j). */
export function lshCandidates(signatures: number[][], bands = 8) {
  const rows = Math.max(1, Math.floor((signatures[0]?.length ?? 0) / bands));
  const pairs = new Set<string>();
  for (let b = 0; b < bands; b++) {
    const buckets = new Map<string, number[]>();
    signatures.forEach((s, i) => { const key = s.slice(b * rows, b * rows + rows).join('-'); const list = buckets.get(key) ?? []; list.push(i); buckets.set(key, list); });
    buckets.forEach((ids) => { if (ids.length < 2 || ids.length > 200) return; for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) pairs.add(`${ids[x]},${ids[y]}`); });
  }
  return [...pairs].map((p) => p.split(',').map(Number) as [number, number]);
}

/* ------------------------------------------------------------------ B11 Soundex */
export function soundex(word: string) {
  const s = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const code: Record<string, string> = { B: '1', F: '1', P: '1', V: '1', C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2', D: '3', T: '3', L: '4', M: '5', N: '5', R: '6' };
  let out = s[0], last = code[s[0]] ?? '';
  for (const c of s.slice(1)) {
    const d = code[c] ?? '';
    if (d && d !== last) out += d;
    if (c !== 'H' && c !== 'W') last = d;
  }
  return (out + '000').slice(0, 4);
}

/* ------------------------------------------------------------------ B12 Metaphone (simplified original rules) */
export function metaphone(word: string) {
  let w = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!w) return '';
  w = w.replace(/^(KN|GN|PN|AE|WR)/, (m) => m[1]).replace(/^X/, 'S').replace(/^WH/, 'W').replace(/MB$/, 'M');
  const vowel = (c?: string) => !!c && 'AEIOU'.includes(c);
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1], p = w[i - 1];
    if (c === p && c !== 'C') continue;
    switch (c) {
      case 'A': case 'E': case 'I': case 'O': case 'U': if (i === 0) out += c; break;
      case 'B': out += 'B'; break;
      case 'C': if (n === 'I' && w[i + 2] === 'A') out += 'X'; else if (n === 'H') { out += 'X'; i++; } else if ('IEY'.includes(n ?? '-')) out += 'S'; else out += 'K'; break;
      case 'D': if (n === 'G' && 'EIY'.includes(w[i + 2] ?? '-')) { out += 'J'; i++; } else out += 'T'; break;
      case 'G': if (n === 'H' && !vowel(w[i + 2])) break; if (n === 'N') break; out += 'EIY'.includes(n ?? '-') ? 'J' : 'K'; break;
      case 'H': if (vowel(n) && !'CSPTG'.includes(p ?? '-')) out += 'H'; break;
      case 'K': if (p !== 'C') out += 'K'; break;
      case 'P': if (n === 'H') { out += 'F'; i++; } else out += 'P'; break;
      case 'Q': out += 'K'; break;
      case 'S': if (n === 'H') { out += 'X'; i++; } else if (n === 'I' && 'OA'.includes(w[i + 2] ?? '-')) out += 'X'; else out += 'S'; break;
      case 'T': if (n === 'H') { out += '0'; i++; } else if (n === 'I' && 'OA'.includes(w[i + 2] ?? '-')) out += 'X'; else out += 'T'; break;
      case 'V': out += 'F'; break;
      case 'W': case 'Y': if (vowel(n)) out += c; break;
      case 'X': out += 'KS'; break;
      case 'Z': out += 'S'; break;
      default: out += c;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ B13 Porter stemmer */
export function porter(word: string) {
  let w = word.toLowerCase();
  if (w.length < 3) return w;
  const cons = (s: string, i: number): boolean => { const c = s[i]; if ('aeiou'.includes(c)) return false; if (c === 'y') return i === 0 ? true : !cons(s, i - 1); return true; };
  const m = (s: string) => { let n = 0, i = 0; const L = s.length; while (i < L && cons(s, i)) i++; while (i < L) { while (i < L && !cons(s, i)) i++; if (i >= L) break; n++; while (i < L && cons(s, i)) i++; } return n; };
  const hasVowel = (s: string) => [...s].some((_, i) => !cons(s, i));
  const doubleC = (s: string) => s.length > 1 && s[s.length - 1] === s[s.length - 2] && cons(s, s.length - 1);
  const cvc = (s: string) => s.length > 2 && cons(s, s.length - 3) && !cons(s, s.length - 2) && cons(s, s.length - 1) && !'wxy'.includes(s[s.length - 1]);
  const replace = (s: string, suf: string, rep: string, cond: (stem: string) => boolean) => (s.endsWith(suf) && cond(s.slice(0, -suf.length)) ? s.slice(0, -suf.length) + rep : null);
  // 1a
  if (w.endsWith('sses')) w = w.slice(0, -2); else if (w.endsWith('ies')) w = w.slice(0, -2); else if (!w.endsWith('ss') && w.endsWith('s')) w = w.slice(0, -1);
  // 1b
  let flag = false;
  if (w.endsWith('eed')) { if (m(w.slice(0, -3)) > 0) w = w.slice(0, -1); }
  else if (w.endsWith('ed') && hasVowel(w.slice(0, -2))) { w = w.slice(0, -2); flag = true; }
  else if (w.endsWith('ing') && hasVowel(w.slice(0, -3))) { w = w.slice(0, -3); flag = true; }
  if (flag) {
    if (/(at|bl|iz)$/.test(w)) w += 'e';
    else if (doubleC(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    else if (m(w) === 1 && cvc(w)) w += 'e';
  }
  // 1c
  if (w.endsWith('y') && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + 'i';
  const step = (pairs: [string, string][], minM: number) => { for (const [s, r] of pairs) { const x = replace(w, s, r, (st) => m(st) > minM); if (x !== null) { w = x; return; } if (w.endsWith(s)) return; } };
  step([['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'], ['izer', 'ize'], ['abli', 'able'], ['alli', 'al'], ['entli', 'ent'], ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'], ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'], ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble']], 0);
  step([['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'], ['ical', 'ic'], ['ful', ''], ['ness', '']], 0);
  for (const s of ['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement', 'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize']) {
    if (!w.endsWith(s)) continue;
    const st = w.slice(0, -s.length);
    if (m(st) > 1 && (s !== 'ion' || /[st]$/.test(st))) w = st;
    break;
  }
  if (w.endsWith('e')) { const st = w.slice(0, -1); if (m(st) > 1 || (m(st) === 1 && !cvc(st))) w = st; }
  if (m(w) > 1 && doubleC(w) && w.endsWith('l')) w = w.slice(0, -1);
  return w;
}

/* ------------------------------------------------------------------ B14 Character n-grams */
export function ngrams(s: string, n = 3) {
  const x = ` ${s.toLowerCase().replace(/\s+/g, ' ')} `;
  const out: string[] = [];
  for (let i = 0; i <= x.length - n; i++) out.push(x.slice(i, i + n));
  return out;
}
export const ngramSimilarity = (a: string, b: string, n = 3) => jaccard(ngrams(a, n), ngrams(b, n));

/* ------------------------------------------------------------------ C6 stop words, C7 synonyms */
export const STOPWORDS = new Set('a an the i we they he she it is are am be was were been to of in on at for with by from and or as that this these those my our their his her its into onto then than so do does did has have had should can could will would'.split(' '));
export const removeStopwords = (toks: string[]) => toks.filter((t) => !STOPWORDS.has(t));
export const SYNONYMS: Record<string, string> = { press: 'click', tap: 'click', hit: 'click', select: 'choose', pick: 'choose', type: 'enter', input: 'enter', fill: 'enter', navigate: 'open', go: 'open', visit: 'open', browse: 'open', see: 'verify', should: 'verify', check: 'verify', assert: 'verify', expect: 'verify', login: 'signin', log: 'signin', sign: 'signin', logout: 'signout', remove: 'delete', erase: 'delete', create: 'add', insert: 'add', modify: 'update', edit: 'update', change: 'update', page: 'screen', screen: 'screen', view: 'screen' };
export const expandSynonyms = (toks: string[]) => toks.map((t) => SYNONYMS[t] ?? t);

/** Canonical form of a step for similarity work, built from the enabled normalizers. */
export function normalizeStep(text: string, opts: { stopwords?: boolean; synonyms?: boolean; stem?: boolean } = {}) {
  let t = tokens(text);
  if (opts.stopwords) t = removeStopwords(t);
  if (opts.synonyms) t = expandSynonyms(t);
  if (opts.stem) t = t.map(porter);
  return t;
}
