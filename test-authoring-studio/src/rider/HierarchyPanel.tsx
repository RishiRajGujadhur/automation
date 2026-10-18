import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader, X } from 'lucide-react';
import { api } from '../api';
import { useHierarchy, type CallHierarchy, type HNode, type TypeHierarchy } from './hierarchy';

type Open = (file: string, line: number, column: number) => void;

/** One symbol: its name (click to go to its declaration) and kind. */
function Symbol({ node, onOpen, strong }: { node: HNode; onOpen: Open; strong?: boolean }) {
  return (
    <button className={`structure-item ${strong ? 'active' : ''}`} disabled={!node.location} title={node.location ? `${node.location.file}:${node.location.line}` : 'Outside this repository'} onClick={() => node.location && onOpen(node.location.file, node.location.line, node.location.column)}>
      <span className={`structure-kind ${node.kind}`}>{node.kind}</span> {node.name} {node.external && <small>(external)</small>}
    </button>
  );
}

function TypeTree({ data, onOpen }: { data: TypeHierarchy; onOpen: Open }) {
  // Derived types as a tree under the type (each under its direct base).
  const children = (name: string): TypeHierarchy['derived'] => data.derived.filter((d) => d.parent === name);
  const Sub = ({ name, depth }: { name: string; depth: number }) => (
    <>
      {children(name).map((d) => (
        <li key={d.node.name} style={{ paddingLeft: depth * 14 }}>
          <Symbol node={d.node} onOpen={onOpen} />
          <ul className="hierarchy-sub"><Sub name={d.node.name} depth={1} /></ul>
        </li>
      ))}
    </>
  );
  const orphans = data.derived.filter((d) => d.parent && d.parent !== data.type.name && !data.derived.some((x) => x.node.name === d.parent));
  return (
    <ul className="todo-list" aria-label="Type hierarchy">
      {data.bases.map((b, i) => <li key={b.name} style={{ paddingLeft: i * 14 }}><Symbol node={b} onOpen={onOpen} /></li>)}
      <li style={{ paddingLeft: data.bases.length * 14 }}>
        <Symbol node={data.type} onOpen={onOpen} strong />
        <ul className="hierarchy-sub" aria-label="Derived types"><Sub name={data.type.name} depth={1} />{orphans.map((d) => <li key={d.node.name}><Symbol node={d.node} onOpen={onOpen} /></li>)}</ul>
      </li>
      {!!data.interfaces.length && (
        <li className="hierarchy-group">
          <small>Implements</small>
          <ul aria-label="Interfaces">{data.interfaces.map((i) => <li key={i.name}><Symbol node={i} onOpen={onOpen} /></li>)}</ul>
        </li>
      )}
    </ul>
  );
}

/** A caller with its call sites; expanding it asks who calls the caller (lazily, as in Rider). */
function Caller({ c, onOpen, depth }: { c: CallHierarchy['callers'][number]; onOpen: Open; depth: number }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<CallHierarchy | { error: string }>();
  const toggle = async () => {
    setOpen(!open);
    if (sub || open || !c.node.location || depth > 12) return;
    try { setSub(await api<CallHierarchy>('/csharp/callers', { file: c.node.location.file, line: c.node.location.line, column: c.node.location.column })); } catch (e) { setSub({ error: (e as Error).message }); }
  };
  const site = c.sites[0];
  return (
    <li>
      <div className="hierarchy-row">
        <button className="icon-button" aria-label={`${open ? 'Collapse' : 'Expand'} ${c.node.name}`} aria-expanded={open} onClick={() => void toggle()}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
        <Symbol node={c.node} onOpen={(f, l, col) => (site ? onOpen(site.file, site.line, site.column) : onOpen(f, l, col))} />
        {c.sites.length > 1 && <small>{c.sites.length} calls</small>}
      </div>
      {open && (
        <ul className="hierarchy-sub">
          {!sub && <li className="subtle"><Loader size={12} className="spin" /> Finding callers…</li>}
          {sub && 'error' in sub && <li className="subtle">{sub.error}</li>}
          {sub && 'callers' in sub && sub.callers.map((x) => <Caller key={x.node.name} c={x} onOpen={onOpen} depth={depth + 1} />)}
          {sub && 'callers' in sub && !sub.callers.length && <li className="subtle">No callers.</li>}
        </ul>
      )}
    </li>
  );
}

/** Hierarchy tool window (Rider): type hierarchy (Ctrl+H) or call hierarchy (Ctrl+Alt+H) of the symbol at the caret. */
export default function HierarchyPanel({ onOpen, onClose }: { onOpen: Open; onClose: () => void }) {
  const h = useHierarchy();
  const title = h?.kind === 'call' ? 'Call Hierarchy' : 'Type Hierarchy';
  return (
    <section className="debug-panel structure-panel hierarchy-panel" aria-label="Hierarchy">
      <div className="debug-toolbar" role="toolbar" aria-label="Hierarchy">
        <strong className="todo-count">{title}{h?.data ? `: ${'type' in h.data ? h.data.type.name : h.data.target.name}` : ''}</strong>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Hierarchy" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      {!h && <p className="subtle hierarchy-hint">Put the caret on a type and press Ctrl+H, or on a method and press Ctrl+Alt+H.</p>}
      {h?.loading && <p className="subtle hierarchy-hint"><Loader size={12} className="spin" /> Building the hierarchy…</p>}
      {h?.error && <p className="subtle hierarchy-hint" role="alert">{h.error}</p>}
      {h?.kind === 'type' && h.data && <TypeTree data={h.data} onOpen={onOpen} />}
      {h?.kind === 'call' && h.data && (
        <ul className="todo-list" aria-label="Callers">
          <li><Symbol node={h.data.target} onOpen={onOpen} strong /></li>
          <li><ul className="hierarchy-sub">{h.data.callers.map((c) => <Caller key={c.node.name} c={c} onOpen={onOpen} depth={1} />)}{!h.data.callers.length && <li className="subtle">No callers in this solution.</li>}</ul></li>
        </ul>
      )}
    </section>
  );
}
