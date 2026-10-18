import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X, ArrowDownAZ } from 'lucide-react';
import { useCursor } from '../editor/cursor';
import { activeEditor } from '../editor/activeEditor';
import { useLocalState } from '../ui';
import { fileOutline, itemAt, type OutlineItem } from './outline';

/**
 * Structure tool window (Rider, Alt+7): the outline of the file being edited — types and members, scenarios, headings.
 * Follows the editor: the entry at the caret is highlighted; click an entry to go there.
 */
export default function StructurePanel({ onOpen, onClose }: { onOpen: (file: string, line: number, column: number) => void; onClose: () => void }) {
  const cursor = useCursor();
  const [items, setItems] = useState<{ file: string; list: OutlineItem[]; error?: string }>();
  const [sorted, setSorted] = useLocalState('structureSorted', false);
  const [nonce, setNonce] = useState(0);
  const file = cursor?.file ?? activeEditor()?.file;
  // Re-read the outline when the file changes, and (debounced) as its text changes.
  const [text, setText] = useState('');
  useEffect(() => {
    const t = setInterval(() => { const a = activeEditor(); if (a && a.file === file) { const s = a.view.state.doc.toString(); setText((old) => (old === s ? old : s)); } }, 1000);
    const a = activeEditor();
    if (a && a.file === file) setText(a.view.state.doc.toString());
    return () => clearInterval(t);
  }, [file]);
  useEffect(() => {
    if (!file || !text) return;
    let live = true;
    const t = setTimeout(() => fileOutline(file, text).then((list) => live && setItems({ file, list }), (e) => live && setItems({ file, list: [], error: (e as Error).message })), 300);
    return () => { live = false; clearTimeout(t); };
  }, [file, text, nonce]);
  const list = useMemo(() => {
    const l = items && items.file === file ? items.list : [];
    return sorted ? [...l].sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label)) : l;
  }, [items, file, sorted]);
  const here = cursor && items?.file === cursor.file ? itemAt(items.list, cursor.line) : undefined;
  return (
    <section className="debug-panel structure-panel" aria-label="Structure">
      <div className="debug-toolbar" role="toolbar" aria-label="Structure">
        <strong className="todo-count">{file ? file.split('/').pop() : 'No file'}</strong>
        <button className="icon-button" aria-label="Sort alphabetically" title="Sort alphabetically" aria-pressed={sorted} onClick={() => setSorted(!sorted)}><ArrowDownAZ size={14} /></button>
        <button className="icon-button" aria-label="Refresh structure" title="Refresh" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Structure" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <ul className="todo-list" aria-label="Structure of the file">
        {file && list.map((it) => (
          <li key={`${it.line}:${it.column}:${it.label}`} style={{ paddingLeft: (sorted ? 0 : it.depth) * 14 }}>
            <button className={`structure-item ${here === it ? 'active' : ''}`} aria-current={here === it ? 'true' : undefined} onClick={() => onOpen(file, it.line, it.column)}>
              <span className={`structure-kind ${it.kind}`}>{it.kind}</span> {it.label} <small>{it.line}</small>
            </button>
          </li>
        ))}
        {items?.error && <li className="subtle">{items.error}</li>}
        {file && items && !items.error && !list.length && <li className="subtle">No structure for this file.</li>}
        {!file && <li className="subtle">Open a file to see its structure.</li>}
      </ul>
    </section>
  );
}
