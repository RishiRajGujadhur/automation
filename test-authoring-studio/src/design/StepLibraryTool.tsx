import { useMemo, useState } from 'react';
import { Search, Replace, Shapes, Boxes, ArrowRightLeft } from 'lucide-react';
import { Button } from '../radix';
import { useAlgorithms } from '../radix2';
import { useLocalState, clearOnEscape, copyText } from '../ui';
import { api, type FilePreview } from '../api';
import DiffApproval from '../DiffApproval';
import { BKTree, InvertedIndex, Trie, fuzzyScore, frecencyOf, highlightRanges, recordUse } from '../algorithms/search';
import { normalizeStep, minhash, lshCandidates, simhash, hamming32, tokens } from '../algorithms/strings';
import { applyEdits, clusterPairs, cucumberToRegex, dbscan, hac, inferTemplates, regexToCucumber, renameStep, resolveKeywords } from '../algorithms/steps';
import { similarityFor, measures } from './similarity';
import { frequentSequences, nextStepModel } from '../algorithms/text';
import { AlgoGate, AlgoPicker, Empty, ResultActions, usePicked, pct, type Corpus, type ToolProps } from './shared';

export type LibStep = { key: string; keyword: string; text: string; uses: { file: string; line: number; scenario: string }[] };
/** Distinct steps in the corpus (keyword resolved), with every place they are used. */
export function stepLibrary(corpus?: Corpus, resolve = true): LibStep[] {
  const map = new Map<string, LibStep>();
  for (const f of corpus?.features ?? []) {
    for (const block of [...f.backgrounds.map((b) => ({ name: b.name || 'Background', steps: b.steps })), ...f.scenarios]) {
      const steps = resolve ? resolveKeywords(block.steps) : block.steps.map((s) => ({ ...s, resolved: s.keyword.trim() }));
      steps.forEach((s, i) => {
        const key = `${s.resolved} ${s.text}`;
        const e = map.get(key) ?? { key, keyword: s.resolved, text: s.text, uses: [] };
        e.uses.push({ file: f.file, line: block.steps[i].line, scenario: block.name });
        map.set(key, e);
      });
    }
  }
  return [...map.values()].sort((a, b) => b.uses.length - a.uses.length);
}

function Marked({ text, query }: { text: string; query: string }) {
  const { on } = useAlgorithms();
  if (!on('aho-corasick') || !query.trim()) return <>{text}</>;
  const ranges = highlightRanges(text, query.split(/\s+/));
  const out: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([s, e], i) => { out.push(text.slice(last, s), <mark key={i}>{text.slice(s, e)}</mark>); last = e; });
  out.push(text.slice(last));
  return <>{out}</>;
}

/** F4: reusable step library, templates, clusters and rename-everywhere. */
export default function StepLibraryTool({ corpus, onNotice, onSource }: ToolProps) {
  const { on } = useAlgorithms();
  const lib = useMemo(() => stepLibrary(corpus, on('keyword-resolution')), [corpus, on]);
  const [query, setQuery] = useState('');
  const searchAlgo = usePicked('steplib-search', ['bm25', 'fuzzy', 'trie', 'inverted-index']);
  const indexes = useMemo(() => {
    const inv = new InvertedIndex(), trie = new Trie(), bk = new BKTree();
    const norm = (t: string) => normalizeStep(t, { stopwords: on('stopwords'), synonyms: on('synonyms'), stem: on('porter') });
    lib.forEach((s) => { inv.add(norm(s.text)); trie.insert(s.text, s.uses.length); tokens(s.text).forEach((w) => bk.add(w)); });
    return { inv, trie, bk, norm };
  }, [lib, on]);
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return lib.slice(0, 60);
    const boost = (s: LibStep) => (on('frecency') ? 1 + frecencyOf(s.key) : 1);
    let ranked: { s: LibStep; score: number }[] = [];
    if (searchAlgo === 'bm25') ranked = indexes.inv.bm25(indexes.norm(q), 60).map((r) => ({ s: lib[r.id], score: r.score }));
    else if (searchAlgo === 'fuzzy') ranked = lib.map((s) => ({ s, score: fuzzyScore(q, s.text)?.score ?? 0 })).filter((x) => x.score > 0);
    else if (searchAlgo === 'trie') { const texts = new Set(indexes.trie.complete(q, 60).map((x) => x.text)); ranked = lib.filter((s) => texts.has(s.text)).map((s) => ({ s, score: s.uses.length })); }
    else if (searchAlgo === 'inverted-index') ranked = indexes.inv.lookup(indexes.norm(q)).map((id) => ({ s: lib[id], score: lib[id].uses.length }));
    return ranked.map((r) => ({ ...r, score: r.score * boost(r.s) })).sort((a, b) => b.score - a.score).slice(0, 60).map((r) => r.s);
  }, [query, lib, searchAlgo, indexes, on]);
  const didYouMean = useMemo(() => {
    if (!on('bktree') || !query.trim() || results.length) return [];
    return [...new Set(tokens(query).flatMap((w) => indexes.bk.search(w, 2).slice(0, 3).filter((x) => x.distance > 0).map((x) => query.replace(new RegExp(w, 'i'), x.word))))].slice(0, 4);
  }, [query, results.length, indexes, on]);

  return (
    <div className="design-tool">
      <section className="panel" aria-labelledby="lib-search">
        <div className="design-head"><h2 id="lib-search"><Search size={16} aria-hidden="true" /> Reusable steps</h2><span className="badge">{lib.length} distinct steps</span></div>
        <div className="design-options">
          <label className="field grow"><span className="micro-label">SEARCH</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={clearOnEscape(query, setQuery)} placeholder="e.g. sign in, search, order confirmed" /></label>
          <AlgoPicker id="steplib-search" label="RANKING" options={['bm25', 'fuzzy', 'trie', 'inverted-index']} />
        </div>
        {didYouMean.length > 0 && <p className="subtle">Did you mean {didYouMean.map((d, i) => <button key={d} className="text-button" onClick={() => setQuery(d)}>{i ? ', ' : ''}{d}</button>)}?</p>}
        {!corpus ? <p className="subtle">Loading steps…</p> : !results.length ? <Empty title="No matching steps">Try fewer words, or switch the ranking algorithm.</Empty> : (
          <ul className="lib-list">
            {results.map((s) => (
              <li key={s.key}>
                <button className="lib-step" onClick={() => { if (on('frecency')) recordUse(s.key); copyText(`${s.keyword} ${s.text}`).then((ok) => onNotice(ok ? 'Step copied.' : 'Clipboard unavailable.')); }} title="Copy step">
                  <b>{s.keyword}</b> <Marked text={s.text} query={query} />
                </button>
                <button className="text-button meta" onClick={() => onSource(s.uses[0].file, s.uses[0].line)}>{s.uses.length} use{s.uses.length === 1 ? '' : 's'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AlgoGate ids={['template-inference']}><Templates lib={lib} onNotice={onNotice} /></AlgoGate>
      <Clusters lib={lib} onSource={onSource} />
      <AlgoGate ids={['rename-refactor', 'cucumber-to-regex']}><Rename corpus={corpus} onNotice={onNotice} /></AlgoGate>
      <Sequences corpus={corpus} onNotice={onNotice} />
      <Converters />
    </div>
  );
}

function Templates({ lib, onNotice }: { lib: LibStep[]; onNotice: (m: string) => void }) {
  const { on } = useAlgorithms();
  const t = useMemo(() => inferTemplates(lib.map((s) => s.text)).slice(0, 30), [lib]);
  return (
    <section className="panel" aria-labelledby="lib-templates">
      <div className="design-head"><h2 id="lib-templates"><Shapes size={16} aria-hidden="true" /> Parameterize repeated steps</h2><span className="badge">{t.length} proposals</span></div>
      {!t.length ? <Empty title="No repeated step shapes">Steps that differ only in a value or two will be proposed here as one parameterized step.</Empty> : (
        <ul className="template-list">
          {t.map((x) => (
            <li key={x.template}>
              <code>{on('param-types') ? x.cucumber : x.template}</code>
              <span className="meta">replaces {x.examples.length} steps{on('param-types') && ` · ${x.params.map((p) => p.type).join(', ')}`}</span>
              <details><summary>Examples</summary><ul>{x.examples.map((e) => <li key={e}>{e}</li>)}</ul></details>
              <button className="text-button" onClick={() => copyText(x.cucumber).then(() => onNotice('Cucumber expression copied.'))}>Copy expression</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Clusters({ lib, onSource }: { lib: LibStep[]; onSource: (f: string, l: number) => void }) {
  const { on } = useAlgorithms();
  const algo = usePicked('steplib-cluster', ['union-find', 'hac', 'dbscan']);
  const measure = usePicked('steplib-measure', measures);
  const [threshold, setThreshold] = useLocalState('design:threshold', 0.8);
  const clusters = useMemo(() => {
    const items = lib.slice(0, 400);
    if (items.length < 2 || !algo || !measure) return [];
    const texts = items.map((s) => s.text);
    const sim = similarityFor(measure, texts, { stopwords: on('stopwords'), synonyms: on('synonyms'), stem: on('porter') });
    if (algo === 'hac') return hac(items.length, sim, threshold).map((g) => g.map((i) => items[i]));
    if (algo === 'dbscan') return dbscan(items.length, (a, b) => 1 - sim(a, b), 1 - threshold).map((g) => g.map((i) => items[i]));
    // Union-find over candidate pairs: LSH buckets (MinHash) or SimHash prefilter when enabled, else all pairs.
    let pairs: [number, number][];
    if (on('minhash') && items.length > 60) pairs = lshCandidates(texts.map((t) => minhash(tokens(t))));
    else if (on('simhash') && items.length > 60) { const h = texts.map((t) => simhash(tokens(t))); pairs = []; for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) if (hamming32(h[i], h[j]) <= 8) pairs.push([i, j]); }
    else { pairs = []; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) pairs.push([i, j]); }
    return clusterPairs(items.length, pairs.filter(([a, b]) => sim(a, b) >= threshold)).map((g) => g.map((i) => items[i]));
  }, [lib, algo, measure, threshold, on]);
  return (
    <section className="panel" aria-labelledby="lib-clusters">
      <div className="design-head"><h2 id="lib-clusters"><Boxes size={16} aria-hidden="true" /> Similar step clusters</h2><span className="badge">{clusters.length} clusters</span></div>
      <div className="design-options">
        <AlgoPicker id="steplib-cluster" label="CLUSTERING" options={['union-find', 'hac', 'dbscan']} />
        <AlgoPicker id="steplib-measure" label="SIMILARITY" options={measures} />
        <label className="field"><span className="micro-label">THRESHOLD {threshold.toFixed(2)}</span><input type="range" min={0.5} max={0.99} step={0.01} value={threshold} onChange={(e) => setThreshold(+e.target.value)} aria-label="Similarity threshold" /></label>
      </div>
      {!clusters.length ? <Empty title="No similar steps at this threshold">Lower the threshold to see looser groups.</Empty> : (
        <ul className="cluster-list">
          {clusters.slice(0, 40).map((c, i) => (
            <li key={i}>
              <span className="micro-label">CLUSTER {i + 1} · {c.length} STEPS</span>
              <ul>{c.map((s) => <li key={s.key}><b>{s.keyword}</b> {s.text} <button className="text-button meta" onClick={() => onSource(s.uses[0].file, s.uses[0].line)}>{s.uses.length}×</button></li>)}</ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Rename({ corpus, onNotice }: { corpus?: Corpus; onNotice: (m: string) => void }) {
  const [from, setFrom] = useLocalState('design:rename:from', 'the user signs in as {string}');
  const [to, setTo] = useLocalState('design:rename:to', 'the user is signed in as {string}');
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [error, setError] = useState('');
  let edits: ReturnType<typeof renameStep> = [];
  let bad = '';
  try { edits = from.trim() ? renameStep(corpus?.features ?? [], from.trim(), to.trim()) : []; } catch (e) { bad = (e as Error).message; }
  const files = [...new Set(edits.map((e) => e.file))];
  const toParams = (s: string) => (s.match(/\{[^}]*\}/g) ?? []).length;
  return (
    <section className="panel" aria-labelledby="lib-rename">
      <div className="design-head"><h2 id="lib-rename"><Replace size={16} aria-hidden="true" /> Rename a step everywhere</h2><span className="badge">{edits.length} lines in {files.length} files</span></div>
      <div className="form-grid">
        <label className="field"><span className="micro-label">FIND (CUCUMBER EXPRESSION)</span><input value={from} onChange={(e) => { setFrom(e.target.value); setPreviews([]); }} /></label>
        <label className="field"><span className="micro-label">REPLACE WITH</span><input value={to} onChange={(e) => { setTo(e.target.value); setPreviews([]); }} /></label>
      </div>
      {bad && <p className="field-error">{bad}</p>}
      {toParams(from) !== toParams(to) && <p className="warn-text">The two expressions have a different number of parameters; extra values are dropped.</p>}
      {edits.length > 0 && <ul className="edit-list">{edits.slice(0, 12).map((e) => <li key={e.file + e.line}><span className="meta">{e.file}:{e.line}</span><del>{e.before.trim()}</del><ins>{e.after.trim()}</ins></li>)}{edits.length > 12 && <li className="subtle">…and {edits.length - 12} more</li>}</ul>}
      <Button variant="primary" disabled={!edits.length} onClick={async () => {
        setError('');
        try {
          const out: FilePreview[] = [];
          for (const file of files) {
            const f = corpus!.features.find((x) => x.file === file)!;
            out.push(await api<FilePreview>('/generation/preview', { file, source: applyEdits(f.source, edits.filter((e) => e.file === file)) }));
          }
          setPreviews(out);
        } catch (e) { setError((e as Error).message); }
      }}>Preview diffs</Button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {previews.map((p) => <DiffApproval key={p.id} preview={p} height="180px" onApplied={() => onNotice(`${p.file} updated.`)} />)}
    </section>
  );
}

function Converters() {
  const { on } = useAlgorithms();
  const [expr, setExpr] = useLocalState('design:conv:expr', 'I add {int} item(s) to the basket/cart');
  const [regex, setRegex] = useLocalState('design:conv:regex', '^I search for "(.*)" in (\\w+)$');
  let compiled = '', test = '';
  try { compiled = cucumberToRegex(expr); new RegExp(compiled); } catch (e) { test = (e as Error).message; }
  return (
    <section className="panel" aria-labelledby="lib-conv">
      <div className="design-head"><h2 id="lib-conv"><ArrowRightLeft size={16} aria-hidden="true" /> Expression converters</h2></div>
      <div className="form-grid">
        <AlgoGate ids={['cucumber-to-regex']} compact>
          <label className="field"><span className="micro-label">CUCUMBER EXPRESSION → REGEX</span><input value={expr} onChange={(e) => setExpr(e.target.value)} /><code className="conv-out">{test || compiled}</code></label>
        </AlgoGate>
        {on('regex-to-cucumber') ? (
          <label className="field"><span className="micro-label">REGEX → CUCUMBER EXPRESSION</span><input value={regex} onChange={(e) => setRegex(e.target.value)} /><code className="conv-out">{regexToCucumber(regex)}</code></label>
        ) : <AlgoGate ids={['regex-to-cucumber']} compact>{null}</AlgoGate>}
      </div>
      <ResultActions text={compiled} file="expression.txt" onNotice={() => {}} />
    </section>
  );
}

/** N6, N7: what usually follows a step, and step runs worth turning into a Background. */
function Sequences({ corpus, onNotice }: { corpus?: Corpus; onNotice: (m: string) => void }) {
  const { on } = useAlgorithms();
  const seqs = useMemo(() => (corpus?.features ?? []).flatMap((f) => f.scenarios.map((s) => resolveKeywords(s.steps).map((st) => `${st.resolved} ${st.text}`))), [corpus]);
  const model = useMemo(() => nextStepModel(seqs), [seqs]);
  const steps = useMemo(() => [...new Set(seqs.flat())].sort(), [seqs]);
  const [current, setCurrent] = useLocalState('design:next:current', '<start>');
  const frequent = useMemo(() => (on('sequence-mining') ? frequentSequences(seqs).slice(0, 15) : []), [seqs, on]);
  if (!on('next-step') && !on('sequence-mining')) return <AlgoGate ids={['next-step', 'sequence-mining']}>{null}</AlgoGate>;
  const bg = frequent.filter((f) => f.asPrefix >= 2 && f.steps.every((s) => s.startsWith('Given ')));
  const bgText = bg[0] ? `  Background:\n${bg[0].steps.map((s) => '    ' + s).join('\n')}\n` : '';
  return (
    <section className="panel" aria-labelledby="lib-seq">
      <div className="design-head"><h2 id="lib-seq">Step sequences</h2></div>
      {on('next-step') && (
        <div>
          <label className="field"><span className="micro-label">AFTER THIS STEP</span>
            <select value={current} onChange={(e) => setCurrent(e.target.value)}><option value="<start>">(start of a scenario)</option>{steps.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <ol className="suite-list">{model(current).map((n) => <li key={n.step}>{n.step} <span className="meta">{pct(n.probability)} · {n.count}×</span></li>)}</ol>
          {!model(current).length && <p className="subtle">This step ends every scenario it appears in.</p>}
        </div>
      )}
      {on('sequence-mining') && (
        <div>
          <span className="micro-label">REPEATED STEP RUNS</span>
          {!frequent.length ? <Empty title="No repeated runs">No two scenarios share two or more consecutive steps.</Empty> : (
            <ul className="cluster-list">{frequent.map((f, i) => <li key={i}><span className="micro-label">{f.support} SCENARIOS{f.asPrefix >= 2 ? ` · STARTS ${f.asPrefix}` : ''}</span><ul>{f.steps.map((s, k) => <li key={k}>{s}</li>)}</ul></li>)}</ul>
          )}
          {bgText && <><p className="subtle">These Given steps open {bg[0].asPrefix} scenarios: a Background candidate.</p><pre className="code-block">{bgText}</pre><ResultActions text={bgText} file="background.feature" onNotice={onNotice} /></>}
        </div>
      )}
    </section>
  );
}