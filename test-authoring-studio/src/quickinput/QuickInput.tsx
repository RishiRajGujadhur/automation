import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { closeQuickInput, providerFor, rememberQuery, useQuickInput, type QuickItem, type QuickProvider } from './store';
import type { Match } from './fuzzy';
import './quickInput.scss';

/** A label with its matched ranges in bold (VS Code's highlighted label). */
export function Highlighted({ text, matches }: { text: string; matches?: Match[] }) {
  if (!matches?.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < at) continue;
    if (m.start > at) out.push(text.slice(at, m.start));
    out.push(<span key={m.start} className="highlight">{text.slice(m.start, m.end)}</span>);
    at = m.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

/** Keybinding chips: "Ctrl+K Ctrl+C" or Rider's "Ctrl Shift U". */
export function Keybinding({ keys }: { keys: string }) {
  const chords = keys.includes('+') ? keys.split(/,?\s+/).map((c) => c.split('+')) : [keys.split(/\s+/)];
  return (
    <span className="quick-input-keybinding" aria-label={keys}>
      {chords.map((chord, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="chord-gap" />}
          {chord.filter(Boolean).map((k, j) => <Fragment key={j}>{j > 0 && <span className="plus">+</span>}<kbd>{k}</kbd></Fragment>)}
        </Fragment>
      ))}
    </span>
  );
}

const ROW = 22;
/**
 * The Quick Input widget (VS Code's quickInput.css look): 600 px wide at the top centre, an input box and up to 20 rows.
 * ↑ / ↓ / Page Up / Page Down move, Enter accepts, Ctrl+Enter opens to the side, Escape or a click outside closes.
 */
export default function QuickInput() {
  const { open, value: initial, session, select } = useQuickInput();
  const [value, setValue] = useState(initial);
  const [items, setItems] = useState<QuickItem[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const accepted = useRef(false);
  const provider = providerFor(value);
  const filter = provider ? value.slice(provider.prefix.length) : value;
  const providerRef = useRef<QuickProvider | undefined>(provider);
  providerRef.current = provider;

  // A new session: take the opening value and focus the input.
  useLayoutEffect(() => {
    if (!open) return;
    setValue(initial);
    setActive(0);
    accepted.current = false;
    // Focus now, so keys typed right after the shortcut land in the box; select once the value is in.
    input.current?.focus();
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      const p = providerFor(initial)?.prefix.length ?? 0;
      if (select) el.setSelectionRange(p, el.value.length); else el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [open, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Items for the current text.
  useEffect(() => {
    if (!open || !provider) { setItems([]); return; }
    const ctl = new AbortController();
    const r = provider.provide(filter, ctl.signal);
    if (Array.isArray(r)) { setItems(r); setBusy(false); }
    else { setBusy(true); r.then((x) => { if (!ctl.signal.aborted) { setItems(x); setBusy(false); } }, () => { if (!ctl.signal.aborted) { setItems([]); setBusy(false); } }); }
    return () => ctl.abort();
  }, [open, value, session]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [value]);
  useEffect(() => { if (open) provider?.onActive?.(items[active], filter); }, [open, items, active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the active row in view.
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!open) return null;
  const close = () => { rememberQuery(value); if (!accepted.current) providerRef.current?.onCancel?.(); closeQuickInput(); };
  const accept = (i: number, side = false) => {
    const it = items[i];
    if (!it) return;
    accepted.current = true;
    rememberQuery(value);
    closeQuickInput();
    it.accept({ side });
  };
  const page = Math.max(1, Math.floor((list.current?.clientHeight ?? ROW * 20) / ROW) - 1);
  const message = provider?.message?.(filter);
  return (
    <div className="quick-input-widget" role="dialog" aria-label="Quick Input" onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="quick-input-header">
        <div className="quick-input-filter">
          <input
            ref={input}
            className="quick-input-box"
            aria-label="Quick Input"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-input-list"
            aria-activedescendant={items[active] ? `quick-input-item-${active}` : undefined}
            placeholder={provider?.placeholder}
            value={value}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => { if (!e.currentTarget.closest('.quick-input-widget')?.contains(e.relatedTarget as Node)) close(); }}
            onKeyDown={(e) => {
              const n = items.length;
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (n ? (a + 1) % n : 0)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (n ? (a - 1 + n) % n : 0)); }
              else if (e.key === 'PageDown') { e.preventDefault(); setActive((a) => Math.min(n - 1, a + page)); }
              else if (e.key === 'PageUp') { e.preventDefault(); setActive((a) => Math.max(0, a - page)); }
              else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); accept(active, e.ctrlKey || e.metaKey); }
              e.stopPropagation();
            }}
          />
          {busy && <div className="quick-input-progress" aria-hidden="true" />}
        </div>
      </div>
      {message && <div className="quick-input-message" role="status">{message}</div>}
      <div className="quick-input-list" id="quick-input-list" role="listbox" aria-label="Quick Input results" ref={list} style={{ maxHeight: ROW * 20 }}>
        {items.map((it, i) => (
          <div
            key={it.id}
            id={`quick-input-item-${i}`}
            data-index={i}
            role="option"
            aria-selected={i === active}
            aria-label={[it.label, it.description, it.keybinding].filter(Boolean).join(', ')}
            className={`quick-input-list-row${i === active ? ' focused' : ''}${it.separator !== undefined && i > 0 ? ' separator-border' : ''}${it.detail ? ' two-line' : ''}`}
            onMouseMove={() => { if (i !== active) setActive(i); }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => accept(i, e.ctrlKey || e.metaKey)}
          >
            {it.icon && <span className="quick-input-list-icon">{it.icon}</span>}
            <span className="quick-input-list-rows">
              <span className="quick-input-list-row-main">
                <span className="quick-input-label"><Highlighted text={it.label} matches={it.labelMatches} /></span>
                {it.description && <span className="quick-input-description"><Highlighted text={it.description} matches={it.descriptionMatches} /></span>}
              </span>
              {it.detail && <span className="quick-input-detail">{it.detail}</span>}
            </span>
            {it.separator && <span className="quick-input-separator">{it.separator}</span>}
            {it.keybinding && <Keybinding keys={it.keybinding} />}
            {it.buttons?.length ? (
              <span className="quick-input-buttons">
                {it.buttons.map((b) => <button key={b.title} type="button" className="quick-input-button" title={b.title} aria-label={b.title} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); b.run(); }}>{b.icon}</button>)}
              </span>
            ) : null}
          </div>
        ))}
        {!items.length && !busy && <div className="quick-input-empty">{provider?.noResults ?? 'No matching results'}</div>}
      </div>
    </div>
  );
}
