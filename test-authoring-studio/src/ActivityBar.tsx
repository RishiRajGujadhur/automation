import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LayoutDashboard, Wand2, Files, Circle, Braces, FlaskConical, BookOpen, Blocks, ScanLine, FolderTree, MoreHorizontal, Menu, TestTubeDiagonal, Search, GitBranch, type LucideIcon } from 'lucide-react';
import { Tip } from './radix2';
import { Dropdown } from './radix';
import { useGitSummary } from './git/statusStore';
import { useTestRun } from './testing/store';
import { featureOn } from './features';
import { useLocalState } from './ui';
import { iconClickBehavior } from './vscode/workbenchLayout';
import { runRider } from './rider/commands';
import { openCommandPalette } from './quickinput/providers';
import { activityControlId, controlVisible } from './vscode/uiControls';
import { useSettings } from './vscode/settings';

export type ActivityItem = { id: string; label: string; icon: LucideIcon; shortcut?: string; advanced?: boolean };
/** VS Code-style activity bar: one icon per page. Features toggles the explorer when it is already active. */
export const activityItems: ActivityItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'Alt+1' },
  { id: 'Features', label: 'Features (Explorer)', icon: Files, shortcut: 'Ctrl+B', advanced: true },
  { id: 'Search', label: 'Search (Find in Files)', icon: Search, shortcut: 'Ctrl+Shift+F', advanced: true },
  { id: 'Testing', label: 'Test Explorer', icon: TestTubeDiagonal, advanced: true },
  { id: 'Git', label: 'Git Changes', icon: GitBranch, advanced: true },
  { id: 'Test Generator', label: 'Test Generator', icon: Wand2, shortcut: 'Alt+2' },
  { id: 'Recorder', label: 'Playwright Recorder', icon: Circle },
  { id: 'Dictionary Inspector', label: 'Dictionary Inspector', icon: Braces, advanced: true },
  { id: 'Test Design', label: 'Test Design', icon: FlaskConical, shortcut: 'Alt+5', advanced: true },
  { id: 'Step Catalog', label: 'Step Catalog', icon: BookOpen, advanced: true },
  { id: 'Backgrounds', label: 'Backgrounds', icon: Blocks, advanced: true },
  { id: 'Selectors', label: 'Selectors', icon: ScanLine, advanced: true },
  { id: 'Project Explorer', label: 'Project Explorer', icon: FolderTree, advanced: true },
];
const ITEM = 46; // px per activity item
/** Activity bar items that are side bar views (the others are pages). */
const SIDE_VIEWS = ['Features', 'Search', 'Testing', 'Git'];

export default function ActivityBar({ active, basic, sidebarOpen, onSelect, onToggleSidebar, onPreferences, onWorkspace, onMore, onShortcuts }: {
  onShortcuts?: () => void;
  active: string; basic: boolean; sidebarOpen: boolean;
  onSelect: (id: string) => void; onToggleSidebar: () => void; onPreferences: () => void; onWorkspace: () => void; onMore: () => void;
}) {
  useSettings();
  // W48: items hidden from the right-click menu, and the order they were dragged into (both kept).
  const [userHidden, setUserHidden] = useLocalState<string[]>('activityHidden', []);
  const [order, setOrder] = useLocalState<string[]>('activityOrder', []);
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? 1000 + activityItems.findIndex((x) => x.id === id) : i; };
  const all = activityItems.filter((i) => (!basic || !i.advanced) && (controlVisible(activityControlId[i.id]) || i.id === active)).sort((a, b) => rank(a.id) - rank(b.id));
  const items = all.filter((i) => !userHidden.includes(i.id) || i.id === active);
  const [menu, setMenu] = useState<{ x: number; y: number; id?: string }>();
  const dragged = useRef<string | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.activity-bar-menu')) setMenu(undefined); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(undefined); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [menu]);
  const move = (from: string, to: string) => { if (from === to) return; const ids = all.map((i) => i.id).filter((x) => x !== from); ids.splice(ids.indexOf(to), 0, from); setOrder(ids); };
  const top = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState(items.length);
  // Items that don't fit the window height move into a ☰ overflow menu (like VS Code's "…" in the activity bar).
  useLayoutEffect(() => {
    const el = top.current;
    if (!el) return;
    const measure = () => {
      // On top of the side bar (W49) the items run across it.
      const across = document.documentElement.dataset.activityBar === 'top';
      const slots = across ? Math.floor((el.clientWidth - 4) / 36) : Math.floor((el.clientHeight - 8) / ITEM);
      setFit(slots >= items.length + (basic ? 1 : 0) ? items.length : Math.max(1, slots - 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, basic]);
  // Badges (VS Code): pending Git changes on Git Changes, failed tests of the last run on Test Explorer.
  const git = useGitSummary();
  const run = useTestRun();
  const failed = run.summary?.failed ?? run.results.filter((r) => r.outcome === 'failed').length;
  const badges: Record<string, { n: number; text: string; tone: string } | undefined> = featureOn('activity-badges') ? {
    Git: git?.changes ? { n: git.changes, text: `${git.changes} pending change${git.changes === 1 ? '' : 's'}`, tone: 'info' } : undefined,
    Testing: run.status !== 'running' && failed ? { n: failed, text: `${failed} failed test${failed === 1 ? '' : 's'}`, tone: 'error' } : undefined,
  } : {};
  const visible = items.slice(0, fit);
  const hidden = items.slice(fit);
  // Keep the active page visible: if it overflowed, swap it in for the last visible item.
  const activeHidden = hidden.find((i) => i.id === active);
  if (activeHidden && visible.length) { hidden.splice(hidden.indexOf(activeHidden), 1, visible[visible.length - 1]); visible[visible.length - 1] = activeHidden; }
  const button = (i: ActivityItem) => {
    const isActive = active === i.id;
    return (
      <li
        key={i.id}
        draggable
        onDragStart={(e) => { dragged.current = i.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-activity', i.id); }}
        onDragOver={(e) => { if (dragged.current) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
        onDrop={(e) => { e.preventDefault(); if (dragged.current) move(dragged.current, i.id); dragged.current = null; }}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: i.id }); }}
      >
        <Tip content={badges[i.id] ? `${i.label} · ${badges[i.id]!.text}` : i.label} shortcut={i.shortcut} side="right">
          <button
            className={`activity-item ${isActive ? 'active' : ''}`}
            aria-label={i.label}
            aria-current={isActive ? 'page' : undefined}
            aria-expanded={i.id === 'Features' ? sidebarOpen : undefined}
            onClick={() => {
              // The active side bar view's icon hides the side bar or focuses it (iconClickBehavior, W50).
              if (isActive && SIDE_VIEWS.includes(i.id) && (sidebarOpen || i.id !== 'Features')) {
                if (iconClickBehavior() === 'focus' && sidebarOpen) { document.querySelector<HTMLElement>('#feature-sidebar input, #feature-sidebar button, #feature-sidebar [tabindex="0"]')?.focus(); return; }
                if (sidebarOpen) { onToggleSidebar(); return; }
              }
              if (i.id === 'Features' && isActive) onToggleSidebar(); else onSelect(i.id);
            }}
          >
            <i.icon size={22} strokeWidth={1.6} aria-hidden="true" />
            {badges[i.id] && <span className={`activity-badge ${badges[i.id]!.tone}`} data-badge={i.id} title={badges[i.id]!.text}>{badges[i.id]!.n > 99 ? '99+' : badges[i.id]!.n}</span>}
          </button>
        </Tip>
      </li>
    );
  };
  return (
    <nav className="activity-bar" aria-label="Main" onContextMenu={(e) => { if (!e.defaultPrevented) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); } }}>
      {menu && (
        <div className="status-bar-menu activity-bar-menu" role="menu" aria-label="Activity Bar" style={{ position: 'fixed', left: menu.x + 4, top: Math.min(menu.y, window.innerHeight - 40 - 24 * all.length) }}>
          {menu.id && <><button role="menuitem" className="context-menu-item" onClick={() => { setUserHidden([...userHidden, menu.id!]); setMenu(undefined); }}><span className="check" />Hide &apos;{all.find((x) => x.id === menu.id)?.label}&apos;</button><div className="context-menu-separator" role="separator" /></>}
          {all.map((x) => <button key={x.id} role="menuitemcheckbox" aria-checked={!userHidden.includes(x.id)} className="context-menu-item" onClick={() => setUserHidden(userHidden.includes(x.id) ? userHidden.filter((y) => y !== x.id) : [...userHidden, x.id])}><span className="check">{userHidden.includes(x.id) ? '' : '✓'}</span>{x.label}</button>)}
          <div className="context-menu-separator" role="separator" />
          <button role="menuitem" className="context-menu-item" onClick={() => { setUserHidden([]); setOrder([]); setMenu(undefined); }}><span className="check" />Reset Location and Visibility</button>
        </div>
      )}
      <ul ref={top} className="activity-top">
        {visible.map(button)}
        {hidden.length > 0 && (
          <li>
            <Dropdown
              label={`More pages (${hidden.length})`}
              align="start"
              entries={hidden.map((i) => ({ label: i.label, icon: i.icon, shortcut: i.shortcut, onSelect: () => onSelect(i.id) }))}
              trigger={<button className="activity-item" aria-label={`More pages (${hidden.length})`} title={`More pages: ${hidden.map((i) => i.label).join(', ')}`}><Menu size={22} strokeWidth={1.6} aria-hidden="true" /></button>}
            />
          </li>
        )}
        {basic && !hidden.length && (
          <li>
            <Tip content="More pages (Advanced mode)" side="right">
              <button className="activity-item" aria-label="More pages" onClick={onMore}><MoreHorizontal size={22} strokeWidth={1.6} aria-hidden="true" /></button>
            </Tip>
          </li>
        )}
      </ul>
      <ul className="activity-bottom">
        {/* VS Code's Accounts and Manage menus (VSCODE-250.md W47). */}
        <li>
          <Dropdown label="Accounts" align="start" trigger={<button className="activity-item" aria-label="Accounts" title="Accounts"><span className="codicon codicon-account" aria-hidden="true" /></button>} entries={[
            { heading: 'No accounts: the studio works on this computer only' },
            'separator',
            { label: 'Copy Environment Info', onSelect: () => runRider('copy-env-info', 'menu') },
          ]} />
        </li>
        <li>
          <Dropdown label="Manage" align="start" trigger={<button className="activity-item" data-tour="workspace" aria-label="Manage" title="Manage"><span className="codicon codicon-settings-gear" aria-hidden="true" /></button>} entries={[
            { label: 'Command Palette...', shortcut: 'Ctrl+Shift+P', onSelect: () => openCommandPalette() },
            'separator',
            { label: 'Settings', shortcut: 'Ctrl+,', onSelect: onPreferences },
            { label: 'Workspace Settings', onSelect: onWorkspace },
            { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+K Ctrl+S', onSelect: () => onShortcuts?.() },
            'separator',
            { submenu: 'Themes', items: [{ label: 'Color Theme', shortcut: 'Ctrl+K Ctrl+T', onSelect: () => runRider('quick-theme', 'menu') }] },
            'separator',
            { label: 'Customize Layout...', onSelect: () => runRider('customize-layout', 'menu') },
          ]} />
        </li>
      </ul>
    </nav>
  );
}
