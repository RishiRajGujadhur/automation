import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { oneDark } from '@codemirror/theme-one-dark';
import { CircleCheck, CircleX, CircleAlert, CircleMinus, FileCheck2, RefreshCw, Save, ShieldCheck, Plus, Trash2, Search, FileOutput } from 'lucide-react';
import { api, type Check, type FilePreview, type Paged } from './api';
import DiffApproval from './DiffApproval';
import SelectorResolution from './SelectorResolution';
import ProjectModelTree, { useProjectModel } from './ProjectModelTree';
import type { DictionaryEntry, Index } from './types';

type Plan = { entry: DictionaryEntry | null; source?: string; code?: string | null };
export type GeneratorSeed = Partial<{ page: string; section: string; field: string; fieldType: string; file: string }>;
const statusIcon = { pass: CircleCheck, fail: CircleX, warn: CircleAlert, skip: CircleMinus };
const statusLabel = { pass: 'Passed', fail: 'Failed', warn: 'Review', skip: 'Skipped' };
const selectorTypes = ['testid', 'ariarole.textbox', 'ariarole.button', 'ariarole.link', 'ariarole.combobox', 'ariarole.checkbox', 'text', 'css', 'xpath'];

/** Lines of `Keyword text`; And/But inherit the previous primary keyword. */
export function parseSteps(text: string) {
  let last = 'Given';
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(Given|When|Then|And|But|\*)\s+(.*)$/.exec(l);
      const keyword = m ? m[1] : 'And';
      const resolved = ['Given', 'When', 'Then'].includes(keyword) ? keyword : last;
      last = resolved;
      return { keyword, resolved, text: m ? m[2] : l };
    });
}
/** Lines of the dictionary source belonging to the matched <Field>, wrapped with its Page/Section for context. */
function fieldSnippet(source: string, entry: DictionaryEntry) {
  const lines = source.split('\n');
  const start = entry.line - 1;
  let end = start;
  while (end < lines.length && !lines[end].includes('</Field>')) end++;
  const indent = (s: string) => s.replace(/^\s*/, '');
  return [`<!-- ${entry.file}:${entry.line} -->`, `<Page name="${entry.page}">`, `  <Section XRefCode="${entry.section}">`, ...lines.slice(start, end + 1).map((l) => '    ' + indent(l).replace(/^<Selector/, '  <Selector')), '  </Section>', '</Page>'].join('\n');
}
const featureTitle = (file: string) => (file.split('/').pop() ?? 'New').replace(/\.feature$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');

export default function TestGenerator({ revision, seed, onSource, onExport, onIndex }: { revision?: string; seed?: GeneratorSeed; onSource: (file: string, line: number) => void; onExport: (source: string, file: string) => void; onIndex: (index: Index) => void }) {
  const [area, setArea] = useState('Features/Checkout');
  const [featureFile, setFeatureFile] = useState('ShoppingCart.feature');
  const [scenarioName, setScenarioName] = useState('Place an order with a shipping email');
  const [scenarioText, setScenarioText] = useState('Given the browser is started\nWhen they enter "john.doe@example.com" in the email field\nAnd click the place order button');
  const [page, setPage] = useState(seed?.page ?? 'CheckoutPage');
  const [section, setSection] = useState(seed?.section ?? 'ShippingDetails');
  const [field, setField] = useState(seed?.field ?? 'EmailInput');
  const [fieldType, setFieldType] = useState(seed?.fieldType ?? 'TextBox');
  const [action, setAction] = useState<'fill' | 'click' | 'visible'>('fill');
  const [value, setValue] = useState('john.doe@example.com');
  const [plan, setPlan] = useState<Plan>();
  const [checks, setChecks] = useState<Check[]>();
  const [preview, setPreview] = useState<FilePreview>();
  const [dictPreview, setDictPreview] = useState<FilePreview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [fieldQuery, setFieldQuery] = useState('');
  const [fieldHits, setFieldHits] = useState<DictionaryEntry[]>([]);
  const [dictFiles, setDictFiles] = useState<string[]>([]);
  const [dictFile, setDictFile] = useState(seed?.file ?? '');
  const [newSelectors, setNewSelectors] = useState([{ type: 'testid', value: '' }, { type: 'ariarole.textbox', value: '' }]);
  const { model } = useProjectModel(revision);
  const file = `${area.replace(/\/+$/, '')}/${featureFile}`.replace(/^\//, '');
  const steps = useMemo(() => parseSteps(scenarioText), [scenarioText]);

  useEffect(() => {
    if (!seed) return;
    if (seed.page !== undefined) setPage(seed.page);
    if (seed.section) setSection(seed.section);
    if (seed.field) setField(seed.field);
    if (seed.fieldType) setFieldType(seed.fieldType);
    if (seed.file) setDictFile(seed.file);
  }, [seed]);
  useEffect(() => {
    api<string[]>('/dictionary/files').then((f) => { setDictFiles(f); setDictFile((d) => d || f[0] || 'Dictionaries/NewPage.xml'); }).catch(() => {});
  }, [revision]);
  // Resolve the dictionary match as inputs change.
  useEffect(() => {
    if (!section || !field) { setPlan(undefined); return; }
    const c = new AbortController();
    const t = setTimeout(() => api<Plan>('/generator/plan', { page, section, field, action, value }, c.signal).then(setPlan).catch((e) => { if (!c.signal.aborted) setError(e.message); }), 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [page, section, field, action, value, revision]);
  useEffect(() => {
    if (!fieldQuery) { setFieldHits([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => api<Paged<DictionaryEntry>>('/dictionaries?' + new URLSearchParams({ q: fieldQuery, limit: '6' }), undefined, c.signal).then((r) => setFieldHits(r.items)).catch(() => {}), 180);
    return () => { clearTimeout(t); c.abort(); };
  }, [fieldQuery, revision]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const validateNow = () =>
    run('validate', async () => {
      const r = await api<{ checks: Check[] }>('/validate', { steps: steps.map((s) => ({ keyword: s.resolved, text: s.text })), page, section, field, featureFile: file, dictionaryFile: plan?.entry?.file });
      setChecks(r.checks);
    });
  const composeFeature = async () => {
    const existing = await api<{ source: string }>('/source?file=' + encodeURIComponent(file)).then((r) => r.source).catch(() => '');
    const block = `  Scenario: ${scenarioName}\n${steps.map((s) => `    ${s.keyword} ${s.text}`).join('\n')}\n`;
    return existing.trim() ? `${existing.trimEnd()}\n\n${block}` : `Feature: ${featureTitle(file)}\n\n${block}`;
  };
  const code = plan?.code
    ? `// ${page}.${section}.${field} → first supported selector in dictionary order\n${plan.code}`
    : plan?.entry === null
      ? '// No dictionary entry yet. Propose one below; no selector is hardcoded.'
      : '// Enter page, section and field to resolve a locator.';
  const highlight = [file, plan?.entry?.file, ...(checks?.map((c) => c.file) ?? [])].filter(Boolean) as string[];
  const passed = checks?.filter((c) => c.status === 'pass').length ?? 0;

  return (
    <div className="generator-layout">
      <div className="generator-main">
        {error && <p role="alert" className="inline-error">{error}</p>}
        <section className="panel wizard-step">
          <div className="panel-heading"><div><span className="step-number">1</span><h2>Scenario &amp; feature context</h2></div><span className="badge">Inputs §9</span></div>
          <div className="wizard-body form-grid">
            <label className="field-label">FEATURE AREA / MODULE<input aria-label="Feature area" value={area} onChange={(e) => setArea(e.target.value)} /></label>
            <label className="field-label">TARGET FEATURE FILE<input aria-label="Target feature file" value={featureFile} onChange={(e) => setFeatureFile(e.target.value)} /></label>
            <label className="field-label span-2">SCENARIO NAME<input aria-label="Scenario name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} /></label>
            <label className="field-label span-2">SCENARIO TEXT<textarea aria-label="Scenario text" rows={4} value={scenarioText} onChange={(e) => setScenarioText(e.target.value)} /></label>
          </div>
        </section>
        <section className="panel wizard-step">
          <div className="panel-heading"><div><span className="step-number">2</span><h2>Page object &amp; locator mapping</h2></div><span className="badge">Rules §4</span></div>
          <div className="wizard-body">
            <label className="search-box">
              <Search size={15} />
              <input aria-label="Find dictionary field" placeholder="Find an existing dictionary field…" value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} />
            </label>
            {!!fieldHits.length && (
              <div className="field-hits">
                {fieldHits.map((h) => (
                  <button key={h.id} className="dictionary-field" onClick={() => { setPage(h.page); setSection(h.section); setField(h.field); setFieldType(h.fieldType); setFieldQuery(''); }}>
                    <strong>{h.page} / {h.section} / {h.field}</strong><small>{h.file}:{h.line}</small>
                  </button>
                ))}
              </div>
            )}
            <div className="form-grid four">
              <label className="field-label">PAGE NAME<input aria-label="Page name" value={page} onChange={(e) => setPage(e.target.value)} /></label>
              <label className="field-label">SECTION NAME<input aria-label="Section name" value={section} onChange={(e) => setSection(e.target.value)} /></label>
              <label className="field-label">FIELD NAME<input aria-label="Field name" value={field} onChange={(e) => setField(e.target.value)} /></label>
              <label className="field-label">FIELD TYPE<select aria-label="Field type" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>{['TextBox', 'Button', 'Link', 'ComboBox', 'CheckBox', 'RadioButton', 'Label'].map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="field-label">ACTION<select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value as typeof action)}><option value="fill">Fill</option><option value="click">Click</option><option value="visible">Verify visible</option></select></label>
              {action === 'fill' && <label className="field-label span-3">TEST DATA VALUE<input aria-label="Test data" value={value} onChange={(e) => setValue(e.target.value)} /></label>}
            </div>
          </div>
        </section>
        <section className="panel wizard-step">
          <div className="panel-heading"><div><span className="step-number">3</span><h2>Selector resolution &amp; dictionary match</h2></div><span className="badge">Rules §5–6</span></div>
          <div className="wizard-body">
            {plan?.entry ? (
              <>
                <div className="split-2">
                  <div>
                    <p className="micro-label">LIVE DICTIONARY MATCH</p>
                    <CodeMirror value={plan.source ? fieldSnippet(plan.source, plan.entry) : ''} theme={oneDark} extensions={[StreamLanguage.define(xml)]} editable={false} />
                    <button className="text-button" onClick={() => onSource(plan.entry!.file, plan.entry!.line)}>Open {plan.entry.file}:{plan.entry.line}</button>
                  </div>
                  <div>
                    <p className="micro-label">PLAYWRIGHT LOCATOR RESOLUTION FLOW</p>
                    <SelectorResolution entry={plan.entry} />
                  </div>
                </div>
              </>
            ) : plan?.entry === null ? (
              <div className="propose-entry">
                <p><strong>No dictionary entry</strong> for <code>{section}/{field}</code>. Add one rather than hardcoding a selector. Selectors are listed in priority order and written in this order.</p>
                <label className="field-label">DICTIONARY FILE
                  <input aria-label="Dictionary file" list="dictionary-files" value={dictFile} onChange={(e) => setDictFile(e.target.value)} />
                  <datalist id="dictionary-files">{dictFiles.map((f) => <option key={f} value={f} />)}</datalist>
                </label>
                {newSelectors.map((s, i) => (
                  <div className="selector-row" key={i}>
                    <select aria-label={`Selector ${i + 1} type`} value={s.type} onChange={(e) => setNewSelectors(newSelectors.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>{selectorTypes.map((t) => <option key={t}>{t}</option>)}</select>
                    <input aria-label={`Selector ${i + 1} value`} placeholder="Selector value" value={s.value} onChange={(e) => setNewSelectors(newSelectors.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    <button className="icon-button" aria-label="Remove selector" onClick={() => setNewSelectors(newSelectors.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="row-actions">
                  <button className="button tiny" onClick={() => setNewSelectors([...newSelectors, { type: 'text', value: '' }])}><Plus size={13} />Add selector</button>
                  <button
                    className="button small primary-soft"
                    disabled={!!busy || !newSelectors.some((s) => s.value.trim())}
                    onClick={() => run('dict', async () => setDictPreview(await api<FilePreview>('/dictionary/preview', { file: dictFile, proposals: [{ page, section, field, fieldType, selectors: newSelectors.filter((s) => s.value.trim()) }] })))}
                  >
                    Preview dictionary change
                  </button>
                </div>
                {dictPreview && <DiffApproval key={dictPreview.id} preview={dictPreview} onApplied={(i) => { onIndex(i); setDictPreview(undefined); }} />}
              </div>
            ) : (
              <p className="subtle">Enter a section and field to resolve a dictionary match.</p>
            )}
            <p className="micro-label">GENERATED LOCATOR CODE PREVIEW</p>
            <CodeMirror value={code} theme={oneDark} extensions={[StreamLanguage.define(csharp)]} editable={false} />
          </div>
        </section>
        <section className="panel wizard-step">
          <div className="panel-heading"><div><span className="step-number">4</span><h2>Validation &amp; quality gate</h2></div>{checks && <span className={`badge ${passed === checks.length ? 'green' : 'amber'}`}>{passed}/{checks.length} passed</span>}</div>
          <div className="wizard-body">
            {checks ? (
              <table className="checks-table">
                <thead><tr><th>Validation check</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {checks.map((c) => {
                    const I = statusIcon[c.status];
                    return (
                      <tr key={c.id} className={c.status}>
                        <td>{c.label}</td>
                        <td><span className="check-status"><I size={15} />{statusLabel[c.status]}</span></td>
                        <td>{c.detail}{c.file && <button className="text-button" onClick={() => onSource(c.file!, c.line ?? 1)}>{c.file}{c.line ? `:${c.line}` : ''}</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="subtle">Run a dry-run validation to evaluate the quality gate. Nothing is written.</p>
            )}
          </div>
        </section>
        <div className="generator-actions">
          <button className="button primary" disabled={!!busy || !steps.length} onClick={() => run('save', async () => setPreview(await api<FilePreview>('/generation/preview', { file, source: await composeFeature() })))}>
            <RefreshCw size={15} />Regenerate code &amp; save
          </button>
          <button className="button" disabled={!!busy} onClick={validateNow}><ShieldCheck size={15} />{busy === 'validate' ? 'Validating…' : 'Run dry-run validation'}</button>
          <button className="button" disabled={!!busy || !steps.length} onClick={() => run('export', async () => onExport(await composeFeature(), file))}><FileOutput size={15} />Export to feature file</button>
        </div>
        {preview && (
          <section className="panel wizard-step">
            <div className="panel-heading"><div><FileCheck2 size={16} /><h2>Review feature change</h2></div><button className="text-button" onClick={() => setPreview(undefined)}>Discard</button></div>
            <div className="wizard-body"><DiffApproval key={preview.id} preview={preview} onApplied={(i) => { onIndex(i); setPreview(undefined); validateNow(); }} /></div>
          </section>
        )}
      </div>
      <aside className="panel generator-sidebar" aria-label="Project model">
        <div className="panel-heading"><div><Save size={15} /><h2>Project model</h2></div></div>
        <div className="wizard-body"><ProjectModelTree model={model} highlight={highlight} onSource={onSource} compact /></div>
      </aside>
    </div>
  );
}
