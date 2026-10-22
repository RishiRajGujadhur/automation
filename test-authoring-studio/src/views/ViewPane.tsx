import { useState, type ReactNode } from 'react';
import './views.scss';

/** A title bar action of a view pane (VS Code's view title actions: shown on hover). */
export type PaneAction = { icon: string; title: string; run: () => void };

const read = (id: string, def: boolean) => { try { const v = localStorage.getItem(`tas:pane:${id}`); return v === null ? def : v === '1'; } catch { return def; } };
const write = (id: string, open: boolean) => { try { localStorage.setItem(`tas:pane:${id}`, open ? '1' : '0'); } catch { /* storage blocked */ } };

/**
 * A collapsible section of a side bar view (VSCODE-250.md W51), like VS Code's view panes: a header with a chevron,
 * the upper-case title, a count when collapsed and title actions on hover; expanded panes share the side bar's
 * height. The open / collapsed state is kept.
 */
export default function ViewPane({ id, title, count, actions = [], defaultOpen = false, children }: { id: string; title: string; count?: number; actions?: PaneAction[]; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => read(id, defaultOpen));
  const toggle = () => { setOpen(!open); write(id, !open); };
  return (
    <section className={`view-pane${open ? ' open' : ''}`} aria-label={title} data-pane={id}>
      <div className="view-pane-header">
        <button className="view-pane-title" aria-expanded={open} onClick={toggle}>
          <span className={`codicon codicon-chevron-${open ? 'down' : 'right'}`} aria-hidden="true" />
          {title.toUpperCase()}
          {count !== undefined && !open && <span className="view-pane-count">{count}</span>}
        </button>
        {open && actions.length > 0 && (
          <span className="view-pane-actions">
            {actions.map((a) => <button key={a.title} className="icon-button" aria-label={a.title} title={a.title} onClick={a.run}><span className={`codicon codicon-${a.icon}`} aria-hidden="true" /></button>)}
          </span>
        )}
      </div>
      {open && <div className="view-pane-body">{children}</div>}
    </section>
  );
}
