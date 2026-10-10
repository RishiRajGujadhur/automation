import { damerau, dice, jaccard, jaroWinkler, lcsRatio, levenshteinRatio, ncd, ngramSimilarity, normalizeStep, soundex, metaphone, tfidfVectors, cosine } from '../algorithms/strings';

export const measures = ['levenshtein', 'damerau', 'jaro-winkler', 'lcs', 'jaccard', 'dice', 'tfidf-cosine', 'ncd', 'ngram', 'soundex', 'metaphone'];
type Opts = { stopwords: boolean; synonyms: boolean; stem: boolean };

/** Pairwise similarity (0–1) over a list of step texts for the chosen measure, using enabled normalizers. */
export function similarityFor(measure: string, texts: string[], opts: Opts): (a: number, b: number) => number {
  const toks = texts.map((t) => normalizeStep(t, opts));
  const norm = toks.map((t) => t.join(' '));
  switch (measure) {
    case 'levenshtein': return (a, b) => levenshteinRatio(norm[a], norm[b]);
    case 'damerau': return (a, b) => { const m = Math.max(norm[a].length, norm[b].length); return m ? 1 - damerau(norm[a], norm[b]) / m : 1; };
    case 'jaro-winkler': return (a, b) => jaroWinkler(norm[a], norm[b]);
    case 'lcs': return (a, b) => lcsRatio(norm[a], norm[b]);
    case 'jaccard': return (a, b) => jaccard(toks[a], toks[b]);
    case 'dice': return (a, b) => dice(norm[a], norm[b]);
    case 'tfidf-cosine': { const v = tfidfVectors(toks); return (a, b) => cosine(v[a], v[b]); }
    case 'ncd': return (a, b) => 1 - ncd(norm[a], norm[b]);
    case 'ngram': return (a, b) => ngramSimilarity(norm[a], norm[b]);
    case 'soundex': { const c = toks.map((t) => t.map(soundex)); return (a, b) => jaccard(c[a], c[b]); }
    case 'metaphone': { const c = toks.map((t) => t.map(metaphone)); return (a, b) => jaccard(c[a], c[b]); }
    default: return (a, b) => (norm[a] === norm[b] ? 1 : 0);
  }
}
