import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { X } from 'lucide-react';
import { api } from '../api';
import { conflictsIn, resolveConflict } from '../editor/advanced';

type Sides = { base: string; current: string; incoming: string; result: string };
const SETUP = { foldGutter: false, highlightActiveLine: false };
/**
 * Merge Editor (VS Code's three-way merge, Rider's Merge Changes): Current and Incoming side by side over the Result;
 * each conflict of the result takes Current, Incoming or both; Complete Merge writes and stages the file.
 */
export default function MergeEditor({ file, theme, onClose, onDone, onNotice }: { file: string; theme: unknown; onClose: () => void; onDone: () => void; onNotice: (m: string) => void }) {
  const [sides, setSides] = useState<Sides>();
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<Sides>(`/git/merge-sides?file=${encodeURIComponent(file)}`).then((s) => { setSides(s); setResult(s.result.replace(/\r\n/g, '\n')); }, (e) => setError((e as Error).message)); }, [file]);
  const conflicts = useMemo(() => conflictsIn(result), [result]);
  const take = (i: number, how: 'current' | 'incoming' | 'both') => {
    const lines = result.split('\n');
    const c = conflicts[i];
    lines.splice(c.start - 1, c.end - c.start + 1, ...resolveConflict(lines, c, how));
    setResult(lines.join('\n'));
  };
  const complete = async () => {
    try { await api('/git/merge-complete', { file, text: result }); onNotice(`Merged ${file}.`); onDone(); } catch (e) { setError((e as Error).message); }
  };
  const t = theme as never;
  return (
    <section className="merge-editor" aria-label={`Merge Editor ${file}`}>
      <div className="merge-head">
        <strong>Merging {file}</strong>
        <span className="meta">{conflicts.length ? `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} left` : 'No conflicts left'}</span>
        <span className="debug-spacer" />
        <button className="button primary" disabled={!!conflicts.length} onClick={() => void complete()}>Complete Merge</button>
        <button className="icon-button" aria-label="Close Merge Editor" onClick={onClose}><X size={14} /></button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {sides && (
        <>
          <div className="merge-sides">
            <div><h4>Current (ours)</h4><CodeMirror value={sides.current} theme={t} editable={false} basicSetup={SETUP} height="200px" aria-label="Current" /></div>
            <div><h4>Incoming (theirs)</h4><CodeMirror value={sides.incoming} theme={t} editable={false} basicSetup={SETUP} height="200px" aria-label="Incoming" /></div>
          </div>
          <div className="merge-conflicts" role="toolbar" aria-label="Conflicts">
            {conflicts.map((c, i) => (
              <span key={c.start} className="merge-conflict">
                Conflict {i + 1} (line {c.start}):
                <button className="link-button" onClick={() => take(i, 'current')}>Accept Current</button>
                <button className="link-button" onClick={() => take(i, 'incoming')}>Accept Incoming</button>
                <button className="link-button" onClick={() => take(i, 'both')}>Accept Both</button>
              </span>
            ))}
          </div>
          <h4>Result</h4>
          <CodeMirror value={result} theme={t} basicSetup={SETUP} height="240px" onChange={setResult} aria-label="Result" />
        </>
      )}
    </section>
  );
}
