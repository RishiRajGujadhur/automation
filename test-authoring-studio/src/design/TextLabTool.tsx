import { FlaskConical } from 'lucide-react';
import { useAlgorithms } from '../radix2';
import { useLocalState } from '../ui';
import { algorithmById } from '../algorithms/registry';
import { metaphone, normalizeStep, porter, simhash, hamming32, minhash, minhashSimilarity, soundex, tokens, levenshtein } from '../algorithms/strings';
import { inferType } from '../algorithms/steps';
import { similarityFor, measures } from './similarity';
import { pct } from './shared';

/** Compare two steps with every enabled similarity measure, phonetic code and normalizer. */
export default function TextLabTool() {
  const { on } = useAlgorithms();
  const [a, setA] = useLocalState('design:lab:a', 'the user clicks the "Sign in" button');
  const [b, setB] = useLocalState('design:lab:b', 'user presses the "Log in" button');
  const opts = { stopwords: on('stopwords'), synonyms: on('synonyms'), stem: on('porter') };
  const rows = measures.filter(on).map((m) => ({ id: m, v: similarityFor(m, [a, b], opts)(0, 1) }));
  const ta = tokens(a), tb = tokens(b);
  return (
    <div className="design-tool">
      <section className="panel" aria-labelledby="lab-head">
        <div className="design-head"><h2 id="lab-head"><FlaskConical size={16} aria-hidden="true" /> Similarity lab</h2></div>
        <p className="subtle">Compare two steps with each enabled measure. This is how the duplicate finder and clustering judge "similar". Normalizers on: {[opts.stopwords && 'stop words', opts.synonyms && 'synonyms', opts.stem && 'stemming'].filter(Boolean).join(', ') || 'none'}.</p>
        <div className="form-grid">
          <label className="field"><span className="micro-label">STEP A</span><input value={a} onChange={(e) => setA(e.target.value)} /></label>
          <label className="field"><span className="micro-label">STEP B</span><input value={b} onChange={(e) => setB(e.target.value)} /></label>
        </div>
        <table className="data-table">
          <thead><tr><th>Measure</th><th>Similarity</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.id}><td title={algorithmById.get(r.id)?.tooltip}>{algorithmById.get(r.id)?.name}</td><td>{pct(r.v)}</td><td className="bar-cell"><span className="bar" style={{ width: pct(Math.max(0, Math.min(1, r.v))) }} /></td></tr>)}
            {on('damerau') && <tr><td>Raw edit distance</td><td>{levenshtein(a, b)} edits</td><td /></tr>}
            {on('simhash') && <tr><td>SimHash bits different</td><td>{hamming32(simhash(ta), simhash(tb))} / 32</td><td /></tr>}
            {on('minhash') && <tr><td>MinHash estimate</td><td>{pct(minhashSimilarity(minhash(ta), minhash(tb)))}</td><td /></tr>}
          </tbody>
        </table>
        <div className="form-grid">
          {[a, b].map((s, i) => (
            <dl key={i} className="lab-codes">
              <dt>Normalized</dt><dd><code>{normalizeStep(s, opts).join(' ')}</code></dd>
              {on('porter') && <><dt>Stems</dt><dd><code>{tokens(s).map(porter).join(' ')}</code></dd></>}
              {on('soundex') && <><dt>Soundex</dt><dd><code>{tokens(s).map(soundex).join(' ')}</code></dd></>}
              {on('metaphone') && <><dt>Metaphone</dt><dd><code>{tokens(s).map(metaphone).join(' ')}</code></dd></>}
              {on('param-types') && <><dt>Quoted value types</dt><dd><code>{[...s.matchAll(/"([^"]*)"/g)].map((m) => `${m[1]}: ${inferType([m[1]])}`).join(', ') || '–'}</code></dd></>}
            </dl>
          ))}
        </div>
      </section>
    </div>
  );
}
