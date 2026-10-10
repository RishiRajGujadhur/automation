import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { oneDark } from '@codemirror/theme-one-dark';
import { CircleCheck, CircleX, CircleAlert, CircleMinus, RefreshCw, Save, ShieldCheck, Plus, Trash2, Search, FileOutput, FileCode2, Copy, RotateCcw, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { api, type Check, type FilePreview, type Paged } from './api';
import DiffApproval from './DiffApproval';
import SelectorResolution from './SelectorResolution';
import ProjectModelTree, { useProjectModel } from './ProjectModelTree';
import { Collapsible, CopyButton, RowMenu, copyText, useLocalState } from './ui';
import type { DictionaryEntry, Index } from './types';

type Plan = { entry: DictionaryEntry | null; source?: string; code?: string | null };
export type GeneratorSeed = Partial<{ page: string; section: string; field: string; fieldType: string; file: string }>;
const statusIcon = { pass: CircleCheck, fail: CircleX, warn: CircleAlert, skip: CircleMinus };
const statusLabel = { pass: 'Passed', fail: 'Failed', warn: 'Review', skip: 'Skipped' };
const selectorTypes = ['testid', 'ariarole.textbox', 'ariarole.button', 'ariarole.link', 'ariarole.combobox', 'ariarole.checkbox', 'text', 'css', 'xpath'];
const defaults = {
  area: 'Features/Checkout',
  featureFile: 'ShoppingCart.feature',
  scenarioName: 'Place an order with a shipping email',
  scenarioText: 'Given the browser is started\nWhen they enter "john.doe@example.com" in the email field\nAnd click the place order button',
  page: 'CheckoutPage',
  section: 'ShippingDetails',
  field: 'EmailInput',
  fieldType: 'TextBox',
  action: 'fill' as 'fill' | 'click' | 'visible',
  value: 'john.doe@example.com',
};

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
  const trim = (s: string) => s.replace(/^\s*/, '');
  return [`<!-- ${entry.file}:${entry.line} -->`, `<Page name="${entry.page}">`, `  <Section XRefCode="${entry.section}">`, ...lines.slice(start, end + 1).map((l) => '    ' + trim(l).replace(/^<Selector/, '  <Selector')), '  </Section>', '</Page>'].join('\n');
}
const featureTitle = (file: string) => (file.split('/').pop() ?? 'New').replace(/\.feature$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');

export default function TestGenerator({ revision, seed, onSource, onExport, onIndex, onNotice }: { revision?: string; seed?: GeneratorSeed; onSource: (file: string, line: number) => void; onExport: (source: string, file: string) => void; onIndex: (index: Index) => void; onNotice?: (m: string) => void }) {
  // Draft inputs persist per browser so a reload or tab switch never loses work.
  const [draft, setDraft] = useLocalState('generator:draft', defaults);
  const set = <K extends keyof typeof defaults>(k: K, v: (typeof defaults)[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const { area, featureFile, scenarioName, scenarioText, page, section, field, fieldType, action, value } = { ...defaults, ...draft };
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
  const [sidebar, setSidebar] = useLocalState('generator:sidebar', true);
  const { model } = useProjectModel(revision);
  const file = `${area.replace(/\/+$/, '')}/${featureFile}`.replace(/^\//, '');
  const steps = useMemo(() => parseSteps(scenarioText), [scenarioText]);

  useEffect(() => {
    if (!seed) return;
    setDraft((d) => ({ ...d, ...(seed.page !== undefined ? { page: seed.page } : {}), ...(seed.section ? { section: seed.section } : {}), ...(seed.field ? { field: seed.field } : {}), ...(seed.fieldType ? { fieldType: seed.fieldType } : {}) }));
    if (seed.file) setDictFile(seed.file);
  }, [seed, setDraft]);
  useEffect(() => {
    api<string[]>('/dictionary/files').then((f) => { setDictFiles(f); setDictFile((d) => d || f[0] || 'Dictionaries/NewPage.xml'); }).catch(() => {});
  }, [revision]);
  useEffect(() => {
    if (!section || !field) { setPlan(undefined); return; }
    const c = new AbortController();
    const t = setTimeout(() => api<Plan>('/generator/plan', { page, section, field, action, value }, c.signal).then((p) => { setPlan(p); setError(''); }).catch((e) => { if (!c.signal.aborted) setError(e.message); }), 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [page, section, field, action, value, revision]);
  useEffect(() => {
    if (!fieldQuery) { setFieldHits([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => api<Paged<DictionaryEntry>>('/dictionaries?' + new URLSearchParams({ q: fieldQuery, limit: '6' }), undefined, c.signal).then((r) => setFieldHits(r.items)).catch(() => {}), 180);
    return () => { clearTimeout(t); c.abort(); };
  }, [fieldQuery, revision]);
  // Stale results are misleading: any input change invalidates the last validation run.
  useEffect(() => setChecks(undefined), [scenarioText, page, section, field, area, featureFile]);

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
  const failed = checks?.filter((c) => c.status === 'fail').length ?? 0;
  const matchBadge = plan?.entry ? <span className="badge green">Matched</span> : plan?.entry === null ? <span className="badge amber">Missing</span> : null;

  return (
    <div className={`generator-layout ${sidebar ? '' : 'no-sidebar'}`}>
      <div className="generator-main">
        {error && <p role="alert" className="inline-error">{error}</p>}
        <Collapsible id="gen-1" icon={<span className="step-number">1</span>} title="Scenario & feature context" summary={`${file} · ${steps.length} step${steps.length === 1 ? '' : 's'}`}>
          <div className="form-grid">
            <label className="field-label">FEATURE AREA / MODULE<input aria-label="Feature area" value={area} onChange={(e) => set('area', e.target.value)} /></label>
            <label className="field-label">TARGET FEATURE FILE<input aria-label="Target feature file" value={featureFile} onChange={(e) => set('featureFile', e.target.value)} /></label>
            <label className="field-label span-2">SCENARIO NAME<input aria-label="Scenario name" value={scenarioName} onChange={(e) => set('scenarioName', e.target.value)} /></label>
            <label className="field-label span-2">SCENARIO TEXT<textarea aria-label="Scenario text" rows={Math.max(3, steps.length + 1)} value={scenarioText} onChange={(e) => set('scenarioText', e.target.value)} spellCheck={false} /></label>
          </div>
        </Collapsible>
        <Collapsible id="gen-2" icon={<span className="step-number">2</span>} title="Page object & locator mapping" summary={`${page} › ${section} › ${field} (${fieldType})`}>
          <label className="search-box">
            <Search size={15} />
            <input aria-label="Find dictionary field" placeholder="Find an existing dictionary field…" value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setFieldQuery(''); if (e.key === 'Enter' && fieldHits[0]) { const h = fieldHits[0]; setDraft((d) => ({ ...d, page: h.page, section: h.section, field: h.field, fieldType: h.fieldType })); setFieldQuery(''); } }} />
          </label>
          {!!fieldHits.length && (
            <div className="field-hits">
              {fieldHits.map((h) => (
                <button key={h.id} className="dictionary-field" onClick={() => { setDraft((d) => ({ ...d, page: h.page, section: h.section, field: h.field, fieldType: h.fieldType })); setFieldQuery(''); }}>
                  <strong>{h.section} / {h.field}</strong><span>{h.page} · {h.fieldType}</span>
                </button>
              ))}
            </div>
          )}
          <div className="form-grid four">
            <label className="field-label">PAGE NAME<input aria-label="Page name" value={page} onChange={(e) => set('page', e.target.value)} /></label>
            <label className="field-label">SECTION NAME<input aria-label="Section name" value={section} onChange={(e) => set('section', e.target.value)} /></label>
            <label className="field-label">FIELD NAME<input aria-label="Field name" value={field} onChange={(e) => set('field', e.target.value)} /></label>
            <label className="field-label">FIELD TYPE<select aria-label="Field type" value={fieldType} onChange={(e) => set('fieldType', e.target.value)}>{['TextBox', 'Button', 'Link', 'ComboBox', 'CheckBox', 'RadioButton', 'Label'].map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="field-label">ACTION<select aria-label="Action" value={action} onChange={(e) => set('action', e.target.value as typeof action)}><option value="fill">Fill</option><option value="click">Click</option><option value="visible">Verify visible</option></select></label>
            {action === 'fill' && <label className="field-label span-3">TEST DATA VALUE<input aria-label="Test data" value={value} onChange={(e) => set('value', e.target.value)} /></label>}
          </div>
        </Collapsible>
        <Collapsible id="gen-3" icon={<span className="step-number">3</span>} title="Selector resolution & dictionary match" summary={plan?.entry ? `${plan.entry.selectors.length} selectors · ${plan.entry.file}` : 'No dictionary entry'} badge={matchBadge}>
          {plan?.entry ? (
            <div className="split-2">
              <div>
                <p className="micro-label">LIVE DICTIONARY MATCH</p>
                <RowMenu items={[{ label: 'Open dictionary source', icon: FileCode2, onSelect: () => onSource(plan.entry!.file, plan.entry!.line) }, { label: 'Copy field XML', icon: Copy, onSelect: () => copyText(plan.source ? fieldSnippet(plan.source, plan.entry!) : '') }]}>
                  <div className="code-with-copy" data-menu-row>
                    <CodeMirror value={plan.source ? fieldSnippet(plan.source, plan.entry) : ''} theme={oneDark} extensions={[StreamLanguage.define(xml)]} editable={false} />
                  </div>
                </RowMenu>
                <button className="text-button" onClick={() => onSource(plan.entry!.file, plan.entry!.line)}>Open {plan.entry.file}:{plan.entry.line}</button>
              </div>
              <div>
                <p className="micro-label">LOCATOR RESOLUTION FLOW</p>
                <SelectorResolution entry={plan.entry} />
              </div>
            </div>
          ) : plan?.entry === null ? (
            <div className="propose-entry">
              <p><strong>No dictionary entry</strong> for <code>{section}/{field}</code>. Add one rather than hardcoding a selector; list selectors in priority order.</p>
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
                <button className="button tiny ghost" onClick={() => setNewSelectors([...newSelectors, { type: 'text', value: '' }])}><Plus size={13} />Add selector</button>
                <button
                  className="button small"
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
          <details className="code-details">
            <summary>Generated locator code</summary>
            <div className="code-with-copy">
              <CodeMirror value={code} theme={oneDark} extensions={[StreamLanguage.define(csharp)]} editable={false} />
              <CopyButton text={code} label="Copy locator code" />
            </div>
          </details>
        </Collapsible>
        <Collapsible
          id="gen-4"
          icon={<span className="step-number">4</span>}
          title="Validation & quality gate"
          summary={checks ? `${passed}/${checks.length} passed` : 'Not run yet'}
          badge={checks ? <span className={`badge ${failed ? 'red' : passed === checks.length ? 'green' : 'amber'}`}>{failed ? `${failed} failed` : `${passed}/${checks.length} passed`}</span> : null}
        >
          {checks ? (
            <table className="checks-table">
              <thead><tr><th>Validation check</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>
                {checks.map((c) => {
                  const I = statusIcon[c.status];
                  return (
                    <RowMenu key={c.id} items={[
                      { label: 'Open related file', icon: FileCode2, disabled: !c.file, onSelect: () => c.file && onSource(c.file, c.line ?? 1) },
                      { label: 'Copy details', icon: Copy, onSelect: () => copyText(`${c.label}: ${statusLabel[c.status]} — ${c.detail}`) },
                      { label: 'Re-run validation', icon: RefreshCw, onSelect: validateNow },
                    ]}>
                      <tr className={c.status} data-menu-row>
                        <td>{c.label}</td>
                        <td><span className="check-status"><I size={15} />{statusLabel[c.status]}</span></td>
                        <td>{c.detail}{c.file && <button className="text-button" onClick={() => onSource(c.file!, c.line ?? 1)}>{c.file}{c.line ? `:${c.line}` : ''}</button>}</td>
                      </tr>
                    </RowMenu>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="subtle">Run a dry-run validation to evaluate the quality gate. Nothing is written.</p>
          )}
        </Collapsible>
        <div className="generator-actions" role="toolbar" aria-label="Generator actions">
          <button className="button primary" disabled={!!busy || !steps.length} onClick={() => run('save', async () => setPreview(await api<FilePreview>('/generation/preview', { file, source: await composeFeature() })))} title="Preview the feature-file diff, then approve to write (Ctrl+S)">
            <Save size={15} />{busy === 'save' ? 'Preparing diff…' : 'Regenerate code & save'}
          </button>
          <button className="button ghost" disabled={!!busy} onClick={validateNow} title="Ctrl+Enter"><ShieldCheck size={15} />{busy === 'validate' ? 'Validating…' : 'Run dry-run validation'}</button>
          <button className="button ghost" disabled={!!busy || !steps.length} onClick={() => run('export', async () => onExport(await composeFeature(), file))}><FileOutput size={15} />Export to feature file</button>
          <span className="toolbar-spacer" />
          <button className="icon-button" aria-label="Reset generator form" title="Reset form" onClick={() => { if (confirm('Reset all generator inputs to defaults?')) { setDraft(defaults); onNotice?.('Generator reset.'); } }}><RotateCcw size={15} /></button>
          <button className="icon-button" aria-label={sidebar ? 'Hide project model' : 'Show project model'} title={sidebar ? 'Hide project model' : 'Show project model'} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</button>
        </div>
        <GeneratorShortcuts onSave={() => document.querySelector<HTMLButtonElement>('.generator-actions .button.primary')?.click()} onValidate={validateNow} />
        {preview && (
          <section className="panel wizard-step">
            <div className="panel-heading"><div><Save size={16} /><h2>Review feature change</h2></div><button className="text-button" onClick={() => setPreview(undefined)}>Discard</button></div>
            <div className="wizard-body"><DiffApproval key={preview.id} preview={preview} onApplied={(i) => { onIndex(i); setPreview(undefined); validateNow(); }} /></div>
          </section>
        )}
      </div>
      {sidebar && (
        <aside className="panel generator-sidebar" aria-label="Project model">
          <div className="panel-heading"><div><h2>Project model</h2></div><span className="subtle">{highlight.length} in use</span></div>
          <div className="wizard-body"><ProjectModelTree model={model} highlight={highlight} onSource={onSource} compact /></div>
        </aside>
      )}
    </div>
  );
}

/** Ctrl/Cmd+S previews the save; Ctrl/Cmd+Enter validates. Scoped to this page's lifetime. */
function GeneratorShortcuts({ onSave, onValidate }: { onSave: () => void; onValidate: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') { e.preventDefault(); onSave(); }
      if (e.key === 'Enter') { e.preventDefault(); onValidate(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onSave, onValidate]);
  return null;
}
