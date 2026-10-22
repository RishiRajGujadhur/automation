import { useViewOptions } from '../editor/viewOptions';
import { featureOn } from '../features';
import { runRider } from '../rider/commands';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronDown, X, Copy, XCircle, Pin, PinOff } from 'lucide-react';
import { RowMenu, copyText } from '../ui';
import { Dropdown } from '../radix';
import { UNSAVED_EVENT, unsavedFiles } from '../editor/autosave';
import { tabs as tabSettings } from '../vscode/workbenchTabs';
import { useSettings } from '../vscode/settings';
import { SELECT_IN_EXPLORER } from '../SolutionExplorer';
/** Double-click on a tab (not a preview tab): the editor takes the window, side bar and panel hidden (VS Code). */
export const TOGGLE_MAXIMIZED_EDITOR = 'tas:toggle-maximized-editor';
import { useTabs, activateTab, closeOthers, closeToRight, closeToLeft, unpinAll, sortTabs, closeOfType, closeAll, closeSaved, moveTabTo, setPinned, keepTab, cycleTab, type EditorTab } from './tabs';
import { fileType } from './fileTypes';
import { api } from '../api';
import { isBrowser } from './provider';
import { tabDescription } from './tabLabel';
import { editorPreview, pinnedTabSizing, scrollToSwitchTabs, showTabIcons, wrapTabs } from '../vscode/editorManagement';
import { setSetting } from '../vscode/settings';
import { openQuickInput } from '../quickinput/store';
import { untitledLabel } from './untitled';
import { decorationBadges, decorationClass, decorationColors, useFileDecorations } from './decorations';
import { untitledTabLabel, useUntitledLabels } from './untitledHint';

// An untitled editor (W62) is labelled Untitled-n.
const base = (f: string) => { const u = untitledLabel(f); return u ? untitledTabLabel(f, u) : f.split('/').pop()!; };

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
  useUntitledLabels();
  useSettings();
  // File decorations (W66 / W67): problems and Git status on the tabs.
  const deco = useFileDecorations();
  const multiRow = (!!vo.multiRowTabs && featureOn('multi-row-tabs')) || wrapTabs();
  // Workbench ▸ Editor Management settings.
  // Show pinned tabs in a separate row (Visual Studio): a row break after the last pinned tab.
  const pinnedRow = !!vo.pinnedRow && featureOn('pinned-row');
  const { tabs, active } = useTabs();
  const lastPinned = tabs.map((t) => !!t.pinned).lastIndexOf(true);
  const strip = useRef<HTMLDivElement>(null);
  // The active tab is scrolled into view whenever it changes (QOL-50).
  useEffect(() => { if (featureOn('reveal-tab')) requestAnimationFrame(() => strip.current?.querySelector<HTMLElement>('.editor-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Ctrl+1…Ctrl+8 go to that tab, Ctrl+9 to the last (browsers and VS Code) (QOL-50).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || !/^[1-9]$/.test(e.key) || !featureOn('tab-number-keys')) return;
      const t = e.key === '9' ? tabs.at(-1) : tabs[Number(e.key) - 1];
      if (!t) return;
      e.preventDefault();
      activateTab(t.file);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tabs]);
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
      <div data-tab-icons={showTabIcons() ? undefined : "off"} data-pinned-sizing={pinnedTabSizing()} data-show-tabs={tabSettings.show()} data-tab-actions={tabSettings.actionLocation()} data-tab-sizing={tabSettings.sizing()} style={{ '--tab-fixed-width': `${tabSettings.fixedWidth()}px` } as React.CSSProperties} className={`editor-tabs ${tabSettings.highlightModified() ? 'highlight-modified' : ''} ${multiRow ? 'multi-row' : ''} ${pinnedRow && lastPinned >= 0 && lastPinned < tabs.length - 1 ? 'pinned-row' : ''} ${vo.colorTabs && featureOn('color-tabs') ? 'colorized' : ''}`} onDoubleClick={(e) => { if (featureOn('tabstrip-new') && !(e.target as HTMLElement).closest('.editor-tab, button, a, input, [role="toolbar"]')) runRider('new-scratch', 'menu'); }}>
        {overflow.left && <button className="tab-scroll" aria-label="Show previous tabs" onClick={() => reveal(-1)}><ChevronLeft size={14} /></button>}
        <div className="tab-strip" role="group" aria-label="Open editors" ref={strip} onScroll={measure} onWheel={(e) => { if (scrollToSwitchTabs() && e.deltaY) { cycleTab(e.deltaY > 0 ? 1 : -1); return; } if (strip.current && e.deltaY) strip.current.scrollLeft += e.deltaY; }}>
          {tabs.map((t: EditorTab, i: number) => {
            const { icon: Icon, color } = fileType(t.file);
            const selected = t.file === active;
            const unsaved = dirty.includes(t.file);
            return (
              [<RowMenu key={t.file} label={`${base(t.file)} tab`} items={[
                { label: t.pinned ? 'Unpin' : 'Pin', icon: t.pinned ? PinOff : Pin, onSelect: () => setPinned(t.file, !t.pinned) },
                ...(featureOn('unpin-all') && tabs.some((x) => x.pinned) ? [{ label: 'Unpin All', icon: PinOff, onSelect: () => unpinAll() }] : []),
                'separator',
                { label: 'Close', shortcut: 'Ctrl F4', onSelect: () => onClose(t.file) },
                { label: 'Close Others', onSelect: () => closeOthers(t.file) },
                ...(featureOn('close-left') ? [{ label: 'Close to the Left', onSelect: () => closeToLeft(t.file) }] : []),
                { label: 'Close to the Right', onSelect: () => closeToRight(t.file) },
                { label: 'Close All', icon: XCircle, onSelect: () => closeAll() },
                ...(featureOn('close-saved') ? [{ label: 'Close Saved Tabs', onSelect: () => closeSaved(dirty) }] : []),
                ...(featureOn('sort-tabs') ? [{ label: 'Sort Tabs by Name', onSelect: () => sortTabs() }] : []),
                ...(featureOn('move-tab') ? [{ label: 'Move Tab to Start', onSelect: () => moveTabTo(t.file, 'start') }, { label: 'Move Tab to End', onSelect: () => moveTabTo(t.file, 'end') }] : []),
                ...(featureOn('close-type') && t.file.includes('.') ? [{ label: `Close All ${t.file.slice(t.file.lastIndexOf('.'))} Tabs`, onSelect: () => closeOfType(t.file) }] : []),
                'separator',
                { label: 'Copy Relative Path', icon: Copy, onSelect: () => void copyText(t.file).then((ok) => { if (featureOn('copy-feedback')) window.dispatchEvent(new CustomEvent('tas:notice', { detail: ok ? `Copied ${t.file}` : 'Clipboard unavailable.' })); }) },
                ...(featureOn('tab-copy-full') && !isBrowser() ? [{ label: 'Copy Full Path', icon: Copy, onSelect: () => void api<{ config: { repositoryRoot: string } }>('/workspace').then((w) => { const sep = w.config.repositoryRoot.includes('\\') ? '\\' : '/'; return copyText(`${w.config.repositoryRoot.replace(/[\\/]+$/, '')}${sep}${t.file.replaceAll('/', sep)}`); }).then((ok) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: ok ? 'Copied the full path.' : 'Clipboard unavailable.' })), () => {}) }] : []),
                ...(featureOn('tab-copy-name') ? [{ label: 'Copy File Name', icon: Copy, onSelect: () => void copyText(base(t.file)) }] : []),
                ...(featureOn('tab-reveal') ? [{ label: 'Reveal in Explorer', onSelect: () => { activateTab(t.file); requestAnimationFrame(() => window.dispatchEvent(new Event(SELECT_IN_EXPLORER))); } }] : []),
                // VS Code's tab menu (W80): Keep Open for a preview tab, Split Right / Down.
                ...(t.preview ? [{ label: 'Keep Open', onSelect: () => keepTab(t.file) }] : []),
                ...(onSplit && !t.file.endsWith('.feature') ? ['separator' as const, { label: 'Split Right', onSelect: () => onSplit(t.file) }, { label: 'Split Down', onSelect: () => { activateTab(t.file); requestAnimationFrame(() => runRider('split-down', 'menu')); } }] : []),
              ]}>
                <div className={`editor-tab ${selected ? 'active' : ''} ${unsaved ? 'unsaved' : ''} ${t.pinned ? 'pinned' : ''} ${t.preview ? 'preview' : ''} ${t.deleted ? 'deleted' : ''} ${decorationColors() ? decorationClass(deco(t.file)) : ''}`} onDoubleClick={() => { if (t.preview || !featureOn('tab-maximize')) keepTab(t.file); else window.dispatchEvent(new Event(TOGGLE_MAXIMIZED_EDITOR)); }} data-menu-row style={{ '--file-color': color } as React.CSSProperties}>
                  <button aria-current={selected ? 'true' : undefined} title={t.file} className="editor-tab-label" onClick={() => activateTab(t.file)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.file); } }}>
                    <Icon size={14} aria-hidden="true" />
                    <span>{base(t.file)}</span>
                    {(() => { const text = tabDescription(t.file, dup(t.file)); return text ? <small>{text}</small> : null; })()}
                    {t.deleted && <small className="tab-deleted">(deleted)</small>}
                    {/* VS Code's tab badges (W67): the problem count, else the Git letter. */}
                    {decorationBadges() && (() => { const d = deco(t.file); const n = d.errors + d.warnings; return n ? <span className="tab-badge" aria-label={`${d.errors} errors, ${d.warnings} warnings`}>{n > 9 ? '9+' : n}</span> : d.git ? <span className="tab-badge git" aria-label={`Git: ${d.git}`}>{d.git}</span> : null; })()}
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
        {/* VS Code's editor group "…" (W79): Show Opened Editors, Close All / Saved, preview editors, Configure Editors. */}
        {tabs.length > 0 && (
          <Dropdown label="More Actions" align="end" trigger={<button className="tab-scroll editor-group-more" aria-label="More Actions…" title="More Actions…"><span className="codicon codicon-ellipsis" aria-hidden="true" /></button>}
            entries={[
              { label: 'Show Opened Editors', onSelect: () => openQuickInput('edt ') },
              'separator',
              { label: 'Close All', shortcut: 'Ctrl+K W', onSelect: () => closeAll() },
              { label: 'Close Saved', shortcut: 'Ctrl+K U', onSelect: () => closeSaved(dirty) },
              'separator',
              { label: `${editorPreview.enable() ? '✓ ' : ''}Enable Preview Editors`, onSelect: () => setSetting('workbench.editor.enablePreview', !editorPreview.enable()) },
              'separator',
              { label: 'Configure Editors', onSelect: () => { try { sessionStorage.setItem('tas:settingsQuery', 'workbench.editor'); } catch { /* storage blocked */ } window.dispatchEvent(new Event('tas:open-preferences')); } },
            ]} />
        )}
      </div>
      {children}
    </ActionsSlot.Provider>
  );
}
