import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { FileCode2, Braces, Save, TriangleAlert, Sparkles } from 'lucide-react';
import { api } from './api';
import { useEditorTheme } from './themes';
import { Button, Select } from './radix';
import { Segmented } from './radix2';
import { labelled } from './editor/a11y';
import type { Action, Index } from './types';

type Preview = { id: string; file: string; created: boolean; diff: string; changed: boolean };
type Result = {
  feature: Preview;
  steps: { keyword: string; text: string; drafted: boolean }[];
  drafted: number;
  dictionary: { dictionary: Preview | null; skipped: string[]; reused: number; proposals: unknown[] } | null;
};
const DIFF = [StreamLanguage.define(diffMode)];
const pascal = (s: string) => s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Recorded';

/**
 * Save recording → SpecFlow feature file + XML selector dictionary in one review. Accepted matches keep their step;
 * the other actions get drafted steps named after their dictionary fields (create their bindings later with
 * Create Step). Both files are previewed as diffs and written together on Save.
 */
export default function SaveRecording({ actions, accepted, features, onSaved }: {
  actions: Action[];
  accepted: Record<string, string>;
  features: { file: string; name: string }[];
  onSaved: (featureFile: string, index: Index) => void;
}) {
  const theme = useEditorTheme();
  const [dictionaryFiles, setDictionaryFiles] = useState<string[]>([]);
  const site = useMemo(() => { const u = actions.find((a) => a.action === 'goto')?.url; try { return u ? new URL(u).hostname.replace(/^www\./, '').split('.')[0] : ''; } catch { return ''; } }, [actions]);
  const [target, setTarget] = useState<'new' | 'existing'>('new');
  const [featureName, setFeatureName] = useState(site ? `${site[0].toUpperCase()}${site.slice(1)}` : 'Recorded workflow');
  const [newFile, setNewFile] = useState(`Features/${pascal(site || 'Recorded')}.feature`);
  const [existing, setExisting] = useState(features[0]?.file ?? '');
  const [scenario, setScenario] = useState('Recorded workflow');
  const [withDictionary, setWithDictionary] = useState(true);
  const [page, setPage] = useState(`${pascal(site || 'Recorded')}Page`);
  const [section, setSection] = useState('Main');
  const [dictMode, setDictMode] = useState<'new' | 'existing'>('new');
  const [dictFile, setDictFile] = useState(`Dictionaries/${pascal(site || 'Recorded')}Page.xml`);
  // Existing dictionaries: add to the first one by default, as most repositories keep one per page area.
  useEffect(() => { api<string[]>('/dictionary/files').then((f) => { setDictionaryFiles(f); if (f.length) { setDictMode('existing'); setDictFile(f[0]); } }, () => {}); }, []);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Any change to the inputs invalidates the previewed diffs.
  useEffect(() => setResult(undefined), [target, featureName, newFile, existing, scenario, withDictionary, page, section, dictFile]);
  const featureFile = target === 'new' ? newFile.trim() : existing;

  const preview = async () => {
    setBusy(true); setError('');
    try {
      setResult(await api<Result>('/recording/save-preview', {
        actions, accepted, featureFile, featureName: featureName.trim() || 'Recorded workflow', scenario: scenario.trim() || 'Recorded workflow',
        ...(withDictionary ? { dictionary: { page: page.trim(), section: section.trim(), file: dictFile.trim() } } : {}),
      }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!result) return;
    setBusy(true); setError('');
    try {
      // Dictionary first: the feature then indexes against the new fields.
      let index: Index | undefined;
      if (result.dictionary?.dictionary?.changed) index = (await api<{ index: Index }>('/generation/apply', { id: result.dictionary.dictionary.id, approved: true })).index;
      index = (await api<{ index: Index }>('/generation/apply', { id: result.feature.id, approved: true })).index ?? index;
      onSaved(result.feature.file, index!);
    } catch (e) { setError((e as Error).message); setResult(undefined); } finally { setBusy(false); }
  };

  return (
    <div className="save-recording">
      <fieldset>
        <legend><FileCode2 size={14} /> Feature file</legend>
        <Segmented label="Feature file" size="small" value={target} onValueChange={setTarget} options={[{ value: 'new', label: 'Create new' }, { value: 'existing', label: `Add to existing (${features.length})` }]} />
        {target === 'new' ? (
          <div className="form-grid">
            <label className="field">FEATURE FILE<input aria-label="New feature file" value={newFile} onChange={(e) => setNewFile(e.target.value)} spellCheck={false} /></label>
            <label className="field">FEATURE NAME<input aria-label="Feature name" value={featureName} onChange={(e) => setFeatureName(e.target.value)} /></label>
          </div>
        ) : features.length ? (
          <Select ariaLabel="Existing feature file" value={existing} onValueChange={setExisting} options={features.map((f) => f.file)} />
        ) : <p className="field-hint">No feature files yet: choose New feature file.</p>}
        <label className="field">SCENARIO<input aria-label="Scenario name" value={scenario} onChange={(e) => setScenario(e.target.value)} /></label>
      </fieldset>
      <fieldset>
        <legend><Braces size={14} /> Selector dictionary</legend>
        <label className="check"><input type="checkbox" checked={withDictionary} onChange={(e) => setWithDictionary(e.target.checked)} /> Add the recorded elements to an XML dictionary</label>
        {withDictionary && (
          <>
            <div className="form-grid">
              <label className="field">PAGE<input aria-label="Dictionary page" value={page} onChange={(e) => setPage(e.target.value)} /></label>
              <label className="field">SECTION<input aria-label="Dictionary section" value={section} onChange={(e) => setSection(e.target.value)} /></label>
            </div>
            <Segmented label="Dictionary file" size="small" value={dictMode} onValueChange={(m) => { setDictMode(m); setDictFile(m === 'existing' ? dictionaryFiles[0] ?? '' : `Dictionaries/${pascal(page)}.xml`); }} options={[{ value: 'existing', label: `Existing (${dictionaryFiles.length})` }, { value: 'new', label: 'New file' }]} />
            {dictMode === 'existing'
              ? (dictionaryFiles.length ? <Select ariaLabel="Existing dictionary file" value={dictFile} onValueChange={setDictFile} options={dictionaryFiles} /> : <p className="field-hint">No dictionary files yet: choose New file.</p>)
              : <label className="field">DICTIONARY FILE<input aria-label="New dictionary file" value={dictFile} onChange={(e) => setDictFile(e.target.value)} spellCheck={false} /></label>}
          </>
        )}
      </fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!result ? (
        <Button variant="primary" disabled={busy || !featureFile || !actions.length} onClick={() => void preview()}>{busy ? 'Preparing…' : 'Preview changes'}</Button>
      ) : (
        <>
          <section aria-label="Scenario steps" className="save-steps">
            <h4 className="detail-heading">Scenario · {result.steps.length} steps</h4>
            <ol>
              {result.steps.map((s, i) => (
                <li key={i} className={s.drafted ? 'drafted' : ''}>
                  <code>{s.keyword} {s.text}</code>
                  {s.drafted && <small title="No step definition matched this action: the feature shows it as unbound until you create one (Create Step in the editor)."><Sparkles size={11} /> new step</small>}
                </li>
              ))}
            </ol>
            {result.drafted > 0 && <div className="info-box"><TriangleAlert size={14} /> {result.drafted} drafted step{result.drafted === 1 ? '' : 's'} need a step definition: after saving, use Create Step on the underlined lines.</div>}
          </section>
          <h4 className="detail-heading">{result.feature.created ? 'New' : 'Updated'} · {result.feature.file}</h4>
          <CodeMirror value={result.feature.diff} theme={theme} editable={false} extensions={[...DIFF, labelled(`Diff for ${result.feature.file}`, true)]} height="180px" />
          {result.dictionary && (
            <>
              {result.dictionary.reused > 0 && <div className="info-box">{result.dictionary.reused} element{result.dictionary.reused === 1 ? '' : 's'} already in the dictionary: reused.</div>}
              {result.dictionary.skipped.map((s) => <div className="info-box" key={s}>{s}</div>)}
              {result.dictionary.dictionary?.changed
                ? <><h4 className="detail-heading">{result.dictionary.dictionary.created ? 'New' : 'Updated'} · {result.dictionary.dictionary.file}</h4><CodeMirror value={result.dictionary.dictionary.diff} theme={theme} editable={false} extensions={[...DIFF, labelled(`Diff for ${result.dictionary.dictionary.file}`, true)]} height="180px" /></>
                : <p className="subtle">Every recorded element is already in the dictionary.</p>}
            </>
          )}
          <Button variant="primary" disabled={busy} onClick={() => void save()}><Save size={15} /> {busy ? 'Saving…' : result.dictionary?.dictionary?.changed ? 'Save feature and dictionary' : 'Save feature'}</Button>
        </>
      )}
    </div>
  );
}
