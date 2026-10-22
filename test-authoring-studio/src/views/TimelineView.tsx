import { useEffect, useState } from 'react';
import { api } from '../api';
import { useCursor } from '../editor/cursor';
import { activeEditor } from '../editor/activeEditor';
import { isBrowser } from '../files/provider';
import { timeAgo } from '../time';
import ViewPane from './ViewPane';

/** Shows two texts' diff in the compare window (RiderHost listens). */
export const COMPARE_TEXTS_EVENT = 'tas:compare-texts';
type Entry = { id: string; kind: 'local' | 'git'; label: string; detail: string; at: string };

/**
 * W53 Timeline (VS Code's Explorer section): the active file's Local History versions and Git commits, newest first;
 * a click shows that version against the editor's text. The filter button picks the sources.
 */
export default function TimelineView() {
  const file = useCursor()?.file;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [show, setShow] = useState<'all' | 'local' | 'git'>('all');
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!file || isBrowser()) { setEntries([]); return; }
    let live = true;
    void Promise.all([
      api<{ id: string; at: string; reason: string }[]>(`/history?file=${encodeURIComponent(file)}`).catch(() => []),
      api<{ hash?: string; author?: string; when?: string; subject?: string }[]>(`/git/graph?scope=current&file=${encodeURIComponent(file)}`).catch(() => []),
    ]).then(([local, git]) => {
      if (!live) return;
      const now = Date.now();
      const l: Entry[] = local.map((h) => ({ id: h.id, kind: 'local', label: h.reason === 'save' ? 'File Saved' : h.reason[0].toUpperCase() + h.reason.slice(1), detail: timeAgo(h.at, now), at: h.at }));
      const g: Entry[] = git.filter((c) => c.hash).map((c) => ({ id: c.hash!, kind: 'git', label: c.subject ?? '', detail: `${c.author} · ${c.when}`, at: '' }));
      setEntries([...l, ...g]);
    });
    return () => { live = false; };
  }, [file, n]);
  const open = async (e: Entry) => {
    if (!file) return;
    const text = e.kind === 'local' ? (await api<{ source: string }>(`/history/item?file=${encodeURIComponent(file)}&id=${encodeURIComponent(e.id)}`)).source : (await api<{ text: string | null }>(`/git/at?file=${encodeURIComponent(file)}&ref=${encodeURIComponent(e.id)}`)).text ?? '';
    const current = activeEditor()?.file === file ? activeEditor()!.view.state.doc.toString() : '';
    window.dispatchEvent(new CustomEvent(COMPARE_TEXTS_EVENT, { detail: { left: `${file.split('/').pop()} (${e.kind === 'local' ? e.detail : e.id.slice(0, 7)})`, right: `${file.split('/').pop()} (current)`, leftText: text, rightText: current } }));
  };
  const shown = entries.filter((e) => show === 'all' || e.kind === show);
  return (
    <ViewPane id="timeline" title="Timeline" actions={[
      { icon: 'refresh', title: 'Refresh', run: () => setN((x) => x + 1) },
      { icon: 'filter', title: `Show: ${show === 'all' ? 'Local History and Git' : show === 'local' ? 'Local History' : 'Git History'}`, run: () => setShow(show === 'all' ? 'local' : show === 'local' ? 'git' : 'all') },
    ]}>
      <ul className="outline-tree timeline" aria-label="Timeline">
        {shown.map((e) => (
          <li key={`${e.kind}:${e.id}`}>
            <button onClick={() => void open(e)} title={e.kind === 'git' ? `${e.id} ${e.label}` : e.at}>
              <span className={`codicon codicon-${e.kind === 'git' ? 'git-commit' : 'circle-outline'}`} aria-hidden="true" />
              <span>{e.label}</span>
              <small className="timeline-detail">{e.detail}</small>
            </button>
          </li>
        ))}
        {!shown.length && <li className="view-pane-empty">{file ? 'No timeline information was provided.' : 'The active editor cannot provide timeline information.'}</li>}
      </ul>
    </ViewPane>
  );
}
