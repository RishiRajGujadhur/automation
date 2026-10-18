import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { api } from '../api';
import { useEditorTheme } from '../themes';

type Entry = { hash: string; short: string; author: string; date: string; subject: string; patch: string };
const SETUP = { foldGutter: false, autocompletion: false };
const DIFF = [StreamLanguage.define(diffMode)];

/** Show History for Selection (Rider): the commits that changed the selected lines, newest first, with each change. */
export default function LineHistory({ file, start, end }: { file: string; start: number; end: number }) {
  const theme = useEditorTheme();
  const [list, setList] = useState<Entry[]>();
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  useEffect(() => { api<Entry[]>(`/git/lines?file=${encodeURIComponent(file)}&start=${start}&end=${end}`).then(setList, (e) => setError((e as Error).message)); }, [file, start, end]);
  if (error) return <p className="field-error" role="alert">{error}</p>;
  if (!list) return <p className="subtle">Reading the history…</p>;
  if (!list.length) return <p className="subtle" role="status">No commits changed lines {start}–{end} (they are new or the file is not committed).</p>;
  const current = list[index];
  return (
    <div className="line-history">
      <p className="subtle" role="status">{list.length} commit{list.length === 1 ? '' : 's'} changed lines {start}–{end} of {file}.</p>
      <div className="line-history-body">
        <ul role="listbox" aria-label="Commits">
          {list.map((c, i) => (
            <li key={c.hash} role="option" aria-selected={i === index} className={i === index ? 'active' : ''} onClick={() => setIndex(i)}>
              <code>{c.short}</code> {c.subject}<small>{c.author} · {new Date(c.date).toLocaleString()}</small>
            </li>
          ))}
        </ul>
        <CodeMirror value={current.patch} theme={theme} editable={false} basicSetup={SETUP} extensions={DIFF} height="46vh" aria-label="Change" />
      </div>
    </div>
  );
}
