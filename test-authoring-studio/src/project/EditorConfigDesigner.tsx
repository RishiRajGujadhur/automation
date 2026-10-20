import { useEffect, useState } from 'react';
import { api, type FilePreview } from '../api';
import DiffApproval from '../DiffApproval';
import { readFile } from '../files/provider';
import { OPTIONS, SEVERITIES, readEditorConfig, setEditorConfig } from './editorconfig';

/** .editorconfig designer (Visual Studio 2026): common whitespace / code style options and rule severities, previewed before writing. */
export default function EditorConfigDesigner({ onNotice }: { onNotice: (m: string) => void }) {
  const [text, setText] = useState<string>();
  const [base, setBase] = useState('');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<FilePreview>();
  useEffect(() => { void readFile('.editorconfig').then((r) => { setText(r.source); setBase(r.source); }, () => { setText(''); setBase(''); }); }, []);
  if (text === undefined) return <p className="subtle">Loading…</p>;
  const cfg = readEditorConfig(text);
  const set = (section: string, key: string, value: string) => { setPreview(undefined); setText(setEditorConfig(text, section, key, value || null)); };
  const rules = Object.entries(cfg['*.cs'] ?? {}).filter(([k]) => /^dotnet_diagnostic\..+\.severity$/.test(k));
  return (
    <div className="project-props editorconfig-designer" aria-label="EditorConfig designer">
      <p className="subtle pp-file">.editorconfig {base ? '' : '(new file)'}</p>
      <div className="pp-page">
        {OPTIONS.map((o) => (
          <div key={o.key} className="pp-field ec-row">
            <label htmlFor={`ec-${o.key}`}>{o.label} <small className="subtle">[{o.section}] {o.key}</small></label>
            <select id={`ec-${o.key}`} aria-label={o.label} value={cfg[o.section]?.[o.key] ?? ''} onChange={(e) => set(o.section, o.key, e.target.value)}><option value="">(not set)</option>{[...new Set([...o.values, ...(cfg[o.section]?.[o.key] ? [cfg[o.section][o.key]] : [])])].map((v) => <option key={v}>{v}</option>)}</select>
          </div>
        ))}
        <h3 className="ec-head">Rule severities</h3>
        {rules.map(([k, v]) => { const id = k.split('.')[1]; return (
          <div key={k} className="pp-field ec-row"><label htmlFor={`ec-${id}`}>{id}</label><select id={`ec-${id}`} aria-label={`Severity of ${id}`} value={v} onChange={(e) => set('*.cs', k, e.target.value)}><option value="">(remove)</option>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></div>
        ); })}
        <form className="pp-add" onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (!/^[A-Z]+\d+$/.test(c)) { onNotice('Type a rule code such as CA1707 or IDE0005.'); return; } set('*.cs', `dotnet_diagnostic.${c}.severity`, 'none'); setCode(''); }}>
          <input aria-label="Rule code" placeholder="CA1707" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="button" type="submit">Add rule</button>
        </form>
      </div>
      <div className="pp-footer"><small className="subtle">{text === base ? 'No changes' : 'Changed'}</small><button className="button primary" disabled={text === base} onClick={() => void api<FilePreview>('/file/preview', { file: '.editorconfig', source: text }).then(setPreview, (e) => onNotice((e as Error).message))}>Preview changes</button></div>
      {preview && <DiffApproval preview={preview} height="160px" onApplied={() => { setBase(text); setPreview(undefined); onNotice('Saved .editorconfig.'); }} />}
    </div>
  );
}
