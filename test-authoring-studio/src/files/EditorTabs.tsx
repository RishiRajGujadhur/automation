import { useViewOptions } from '../editor/viewOptions';
import { featureOn } from '../features';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronDown, X, Copy, XCircle, Pin, PinOff } from 'lucide-react';
import { RowMenu, copyText } from '../ui';
import { Dropdown } from '../radix';
import { UNSAVED_EVENT, unsavedFiles } from '../editor/autosave';
import { SELECT_IN_EXPLORER } from '../SolutionExplorer';
import { useTabs, activateTab, closeOthers, closeToRight, closeToLeft, closeAll, setPinned, keepTab, type EditorTab } from './tabs';
import { fileType } from './fileTypes';

const base = (f: string) => f.split('/').pop()!;

/** Editors render their toolbar (save state, Save, Run…) into the tab strip, like VS Code's editor actions. */
const ActionsSlot = createContext<HTMLElement | null>(null);
export function EditorActions({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const el = useContext(ActionsSlot);
  return el && active ? createPortal(children, el) : null;
}

/**
 * VS Code style editor tabs: click to switch, × or middle-click to close, ● for unsaved files, a context menu
 * (Close, Close Others, Close to the Right, Close All, Copy Path). When the tabs do not fit, ‹ › arrows reveal
 * the hidden ones and ⌄ lists every open editor.
 */
export default function EditorTabs({ onClose, onSplit, children }: { onClose: (file: string) => void; onSplit?: (file: string) => void; children?: ReactNode }) {
  // Visual Studio's 'Show tabs in multiple rows': no scrolling strip, every tab visible.
  const vo = useViewOptions();
  const multiRow = !!vo.multiRowTabs && featureOn('multi-row-tabs');
  // Show pinned tabs in a separate row (Visual Studio): a row break after the last pinned tab.
  const pinnedRow = !!vo.pinnedRow && featureOn('pinned-row');
  const { tabs, active } = useTabs();
  const lastPinned = tabs.map((t) => !!t.pinned).lastIndexOf(true);
  const strip = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [dirty, setDirty] = useState<string[]>(unsavedFiles);
  useEffect(() => { const h = () => setDirty(unsavedFiles()); window.addEventListener(UNSAVED_EVENT, h); return () => window.removeEventListener(UNSAVED_EVENT, h); }, []);
  // Editing a preview tab keeps it.
  useEffect(() => { for (const f of dirty) keepTab(f); }, [dirty]);

  const measure = () => { const s = strip.current; if (s) setOverflow({ left: s.scrollLeft > 1, right: s.scrollLeft + s.clientWidth < s.scrollWidth - 1 }); };
  useLayoutEffect(() => {
    const s = strip.current;
    if (!s) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(s);
    return () => ro.disconnect();
  }, [tabs.length]);
  // Keep the active tab in view.
  useEffect(() => { strip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); measure(); }, [active, tabs.length]);
  /** Reveals the next tab hidden off the given edge. */
  const reveal = (dir: 1 | -1) => {
    const s = strip.current;
    if (!s) return;
    const box = s.getBoundingClientRect();
    const items = [...s.querySelectorAll<HTMLElement>('.editor-tab')];
    const hidden = dir > 0 ? items.find((t) => t.getBoundingClientRect().right > box.right + 1) : [...items].reverse().find((t) => t.getBoundingClientRect().left < box.left - 1);
    if (!hidden) return;
    const r = hidden.getBoundingClientRect();
    s.scrollLeft += dir > 0 ? r.right - box.right : r.left - box.left;
    measure();
  };
  const dup = (f: string) => tabs.filter((t) => base(t.file) === base(f)).length > 1;

  return (
    <ActionsSlot.Provider value={slot}>
      <div className={`editor-tabs ${multiRow ? 'multi-row' : ''} ${pinnedRow && lastPinned >= 0 && lastPinned < tabs.length - 1 ? 'pinned-row' : ''}`}>
        {overflow.left && <button className="tab-scroll" aria-label="Show previous tabs" onClick={() => reveal(-1)}><ChevronLeft size={14} /></button>}
        <div className="tab-strip" role="group" aria-label="Open editors" ref={strip} onScroll={measure} onWheel={(e) => { if (strip.current && e.deltaY) strip.current.scrollLeft += e.deltaY; }}>
          {tabs.map((t: EditorTab, i: number) => {
            const { icon: Icon, color } = fileType(t.file);
            const selected = t.file === active;
            const unsaved = dirty.includes(t.file);
            return (
              [<RowMenu key={t.file} label={`${base(t.file)} tab`} items={[
                { label: t.pinned ? 'Unpin' : 'Pin', icon: t.pinned ? PinOff : Pin, onSelect: () => setPinned(t.file, !t.pinned) },
                'separator',
                { label: 'Close', shortcut: 'Ctrl F4', onSelect: () => onClose(t.file) },
                { label: 'Close Others', onSelect: () => closeOthers(t.file) },
                ...(featureOn('close-left') ? [{ label: 'Close to the Left', onSelect: () => closeToLeft(t.file) }] : []),
                { label: 'Close to the Right', onSelect: () => closeToRight(t.file) },
                { label: 'Close All', icon: XCircle, onSelect: () => closeAll() },
                'separator',
                { label: 'Copy Relative Path', icon: Copy, onSelect: () => copyText(t.file) },
                ...(featureOn('tab-reveal') ? [{ label: 'Reveal in Explorer', onSelect: () => { activateTab(t.file); requestAnimationFrame(() => window.dispatchEvent(new Event(SELECT_IN_EXPLORER))); } }] : []),
                ...(onSplit && !t.file.endsWith('.feature') ? ['separator' as const, { label: 'Split Right', onSelect: () => onSplit(t.file) }] : []),
              ]}>
                <div className={`editor-tab ${selected ? 'active' : ''} ${unsaved ? 'unsaved' : ''} ${t.pinned ? 'pinned' : ''} ${t.preview ? 'preview' : ''}`} onDoubleClick={() => keepTab(t.file)} data-menu-row style={{ '--file-color': color } as React.CSSProperties}>
                  <button aria-current={selected ? 'true' : undefined} title={t.file} className="editor-tab-label" onClick={() => activateTab(t.file)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.file); } }}>
                    <Icon size={14} aria-hidden="true" />
                    <span>{base(t.file)}</span>
                    {dup(t.file) && <small>{t.file.split('/').slice(-2, -1)[0] ?? ''}</small>}
                  </button>
                  {t.pinned ? (
                    <button className="editor-tab-close pin" aria-label={`Unpin ${base(t.file)}`} title={unsaved ? 'Pinned, unsaved changes. Unpin' : 'Pinned. Unpin'} onClick={() => setPinned(t.file, false)}>
                      {unsaved ? <span className="dot" aria-hidden="true">●</span> : <Pin size={13} aria-hidden="true" />}
                    </button>
                  ) : (
                    <button className="editor-tab-close" aria-label={`Close ${base(t.file)}${unsaved ? ' (unsaved)' : ''}`} title={unsaved ? 'Unsaved changes. Close' : 'Close (Ctrl+F4)'} onClick={() => onClose(t.file)}>
                      <span className="dot" aria-hidden="true">●</span><X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </RowMenu>
            , pinnedRow && i === lastPinned && i < tabs.length - 1 ? <span key="pinned-break" className="tab-row-break" aria-hidden="true" /> : null]);
          })}
        </div>
        {overflow.right && <button className="tab-scroll" aria-label="Show next tabs" onClick={() => reveal(1)}><ChevronRight size={14} /></button>}
        {tabs.length > 1 && (
          <Dropdown label="Open editors" align="end" trigger={<button className="tab-scroll" aria-label="Show opened editors" title="Show opened editors"><ChevronDown size={14} /></button>}
            entries={tabs.map((t) => ({ label: `${dirty.includes(t.file) ? '● ' : ''}${t.file}`, icon: fileType(t.file).icon, onSelect: () => activateTab(t.file) }))} />
        )}
        <div className="editor-tab-actions" ref={setSlot} />
      </div>
      {children}
    </ActionsSlot.Provider>
  );
}
