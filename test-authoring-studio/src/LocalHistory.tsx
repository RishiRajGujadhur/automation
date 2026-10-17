import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { createTwoFilesPatch } from 'diff';
import { History, RotateCcw } from 'lucide-react';
import { api } from './api';
import { useEditorTheme } from './themes';
import { Button } from './radix';
import { labelled } from './editor/a11y';

type Version = { id: string; at: string; reason: 'save' | 'change' | 'delete'; size: number; lines: number };
const DIFF = [StreamLanguage.define(diffMode)];
const REASON = { save: 'before save', change: 'before an approved change', delete: 'before delete' };

/**
 * Local History (JetBrains Rider): the versions the studio kept before it wrote this file, newest first; a diff of
 * the selected version against the editor's text, and Revert (into the editor, as unsaved changes).
 */
export default function LocalHistory({ file, current, onRevert }: { file: string; current: string; onRevert: (source: string) => void }) {
  const theme = useEditorTheme();
  const [versions, setVersions] = useState<Version[]>();
  const [selected, setSelected] = useState<string>();
  const [source, setSource] = useState<string>();
  useEffect(() => { api<Version[]>(`/history?file=${encodeURIComponent(file)}`).then((v) => { setVersions(v); setSelected(v[0]?.id); }, () => setVersions([])); }, [file]);
  useEffect(() => { if (selected) api<{ source: string }>(`/history/item?file=${encodeURIComponent(file)}&id=${encodeURIComponent(selected)}`).then((r) => setSource(r.source), () => setSource(undefined)); }, [file, selected]);
  if (!versions) return <p className="subtle">Loading the local history…</p>;
  if (!versions.length) return <p className="subtle">No local history for {file} yet: the studio keeps a version each time it saves or changes the file.</p>;
  const patch = source !== undefined ? createTwoFilesPatch(`${file} (selected version)`, `${file} (current)`, source, current.replace(/\r\n/g, '\n'), '', '', { context: 3 }).split('\n').slice(2).join('\n') : '';
  return (
    <div className="local-history">
      <ul aria-label="Versions">
        {versions.map((v) => (
          <li key={v.id}>
            <button className={v.id === selected ? 'active' : ''} aria-pressed={v.id === selected} onClick={() => setSelected(v.id)}>
              <History size={13} /> <span>{new Date(v.at).toLocaleString()}</span> <small>{REASON[v.reason] ?? v.reason} · {v.lines} lines</small>
            </button>
          </li>
        ))}
      </ul>
      <div className="local-history-diff">
        {patch.trim() ? <CodeMirror value={patch} theme={theme} editable={false} extensions={[...DIFF, labelled('Changes since the selected version', true)]} height="260px" /> : <p className="subtle">The selected version is the same as the current text.</p>}
        <Button variant="primary" size="small" disabled={source === undefined || source === current} onClick={() => source !== undefined && onRevert(source)}><RotateCcw size={14} /> Revert to this version</Button>
      </div>
    </div>
  );
}
