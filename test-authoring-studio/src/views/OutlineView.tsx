import { useEffect, useMemo, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { activeEditor } from '../editor/activeEditor';
import { useCursor } from '../editor/cursor';
import { fileOutline, itemAt, type OutlineItem } from '../rider/outline';
import { symbolIcon } from '../quickinput/symbols';
import { useLocalState } from '../ui';
import ViewPane from './ViewPane';

type Sort = 'position' | 'name' | 'category';
const SORTS: Sort[] = ['position', 'name', 'category'];

/**
 * W52 Outline (VS Code's Explorer section): the symbols of the active editor as a tree; the one at the caret is
 * highlighted (Follow Cursor), sorting by position, name or category, a filter, and a click goes to the symbol.
 */
export default function OutlineView() {
  const cursor = useCursor();
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useLocalState<Sort>('outlineSort', 'position');
  const [follow, setFollow] = useLocalState('outlineFollow', true);
  const file = cursor?.file;
  // The outline of the active file, again when the text changes (it is read when the caret moves).
  useEffect(() => {
    const a = activeEditor();
    if (!a || !file || a.file !== file) { setItems([]); return; }
    let live = true;
    const t = setTimeout(() => void fileOutline(file, a.view.state.doc.toString()).then((r) => { if (live) setItems(r); }, () => {}), 250);
    return () => { live = false; clearTimeout(t); };
  }, [file, cursor?.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = follow && cursor ? itemAt(items, cursor.line) : undefined;
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
    if (sort === 'name') list = [...list].sort((a, b) => a.label.localeCompare(b.label));
    if (sort === 'category') list = [...list].sort((a, b) => a.kind.localeCompare(b.kind) || a.line - b.line);
    return list;
  }, [items, filter, sort]);
  const go = (it: OutlineItem) => {
    const a = activeEditor();
    if (!a) return;
    const line = a.view.state.doc.line(Math.min(it.line, a.view.state.doc.lines));
    const pos = Math.min(line.to, line.from + it.column - 1);
    a.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    a.view.focus();
  };
  return (
    <ViewPane id="outline" title="Outline" actions={[
      { icon: follow ? 'pinned' : 'pin', title: follow ? 'Follow Cursor: on' : 'Follow Cursor: off', run: () => setFollow(!follow) },
      { icon: sort === 'position' ? 'list-ordered' : sort === 'name' ? 'case-sensitive' : 'symbol-class', title: `Sort By: ${sort[0].toUpperCase()}${sort.slice(1)}`, run: () => setSort(SORTS[(SORTS.indexOf(sort) + 1) % 3]) },
    ]}>
      {!file ? <p className="view-pane-empty">The active editor cannot provide outline information.</p> : (
        <>
          <input className="view-pane-filter" aria-label="Filter outline" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="outline-tree" aria-label="Outline">
            {shown.map((it) => (
              <li key={`${it.line}:${it.column}:${it.label}`} className={it === current ? 'active' : ''} aria-current={it === current ? 'true' : undefined} style={{ paddingLeft: sort === 'position' && !filter ? 4 + it.depth * 12 : 4 }}>
                <button onClick={() => go(it)} title={`${it.kind} · line ${it.line}`}>{symbolIcon(it.kind)}<span>{it.label}</span></button>
              </li>
            ))}
            {!shown.length && <li className="view-pane-empty">{items.length ? 'No symbols match.' : 'No symbols found in this file.'}</li>}
          </ul>
        </>
      )}
    </ViewPane>
  );
}
