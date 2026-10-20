import { useRef } from 'react';
import { useLocalState } from '../ui';

export type Cell = { n?: number; text: string; kind: 'same' | 'del' | 'add' | 'empty' | 'hunk' };
/**
 * A unified patch as aligned rows for two panes (left: old, right: new); removed and added lines of a change are
 * paired, the shorter side padded. Pure, for the unit tests.
 */
export function sideBySide(patch: string): [Cell, Cell][] {
  const rows: [Cell, Cell][] = [];
  let ln = 0, rn = 0;
  let dels: Cell[] = [], adds: Cell[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push([dels[i] ?? { text: '', kind: 'empty' }, adds[i] ?? { text: '', kind: 'empty' }]);
    dels = []; adds = [];
  };
  for (const line of patch.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('====') || line.startsWith('\\')) continue;
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) { flush(); ln = Number(h[1]); rn = Number(h[2]); rows.push([{ text: line, kind: 'hunk' }, { text: line, kind: 'hunk' }]); continue; }
    if (line.startsWith('-')) dels.push({ n: ln++, text: line.slice(1), kind: 'del' });
    else if (line.startsWith('+')) adds.push({ n: rn++, text: line.slice(1), kind: 'add' });
    else if (line.startsWith(' ')) { flush(); rows.push([{ n: ln++, text: line.slice(1), kind: 'same' }, { n: rn++, text: line.slice(1), kind: 'same' }]); }
  }
  flush();
  return rows;
}

/** Side-by-side diff: the two panes scroll together unless Synchronized Scrolling is turned off. */
export default function SideBySide({ patch, left, right }: { patch: string; left: string; right: string }) {
  const rows = sideBySide(patch);
  const [synced, setSynced] = useLocalState('diffSyncScroll', true);
  const panes = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const busy = useRef(false);
  const onScroll = (i: 0 | 1) => {
    if (!synced || busy.current) return;
    const from = panes[i].current, to = panes[1 - i].current;
    if (!from || !to) return;
    busy.current = true;
    to.scrollTop = from.scrollTop;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { busy.current = false; });
  };
  const pane = (i: 0 | 1, title: string) => (
    <div className="sbs-pane" aria-label={title}>
      <div className="sbs-title">{title}</div>
      <div className="sbs-scroll" ref={panes[i]} onScroll={() => onScroll(i)} tabIndex={0}>
        {rows.map((r, k) => <div key={k} className={`sbs-row sbs-${r[i].kind}`}><span className="sbs-n">{r[i].n ?? ''}</span><span className="sbs-text">{r[i].text || ' '}</span></div>)}
      </div>
    </div>
  );
  return (
    <div className="sbs">
      <label className="build-on-save"><input type="checkbox" checked={synced} onChange={(e) => setSynced(e.target.checked)} /> Synchronized scrolling</label>
      <div className="sbs-panes">{pane(0, left)}{pane(1, right)}</div>
    </div>
  );
}
