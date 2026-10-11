import { useLayoutEffect, useRef, useState } from 'react';
import { LayoutDashboard, Wand2, Files, Circle, Braces, FlaskConical, BookOpen, Blocks, ScanLine, FolderTree, Settings2, SlidersHorizontal, MoreHorizontal, Menu, type LucideIcon } from 'lucide-react';
import { Tip } from './radix2';
import { Dropdown } from './radix';

export type ActivityItem = { id: string; label: string; icon: LucideIcon; shortcut?: string; advanced?: boolean };
/** VS Code-style activity bar: one icon per page. Features toggles the explorer when it is already active. */
export const activityItems: ActivityItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'Alt+1' },
  { id: 'Features', label: 'Features (Explorer)', icon: Files, shortcut: 'Ctrl+B', advanced: true },
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

export default function ActivityBar({ active, basic, sidebarOpen, onSelect, onToggleSidebar, onPreferences, onWorkspace, onMore }: {
  active: string; basic: boolean; sidebarOpen: boolean;
  onSelect: (id: string) => void; onToggleSidebar: () => void; onPreferences: () => void; onWorkspace: () => void; onMore: () => void;
}) {
  const items = activityItems.filter((i) => !basic || !i.advanced);
  const top = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState(items.length);
  // Items that don't fit the window height move into a ☰ overflow menu (like VS Code's "…" in the activity bar).
  useLayoutEffect(() => {
    const el = top.current;
    if (!el) return;
    const measure = () => {
      const slots = Math.floor((el.clientHeight - 8) / ITEM);
      setFit(slots >= items.length + (basic ? 1 : 0) ? items.length : Math.max(1, slots - 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, basic]);
  const visible = items.slice(0, fit);
  const hidden = items.slice(fit);
  // Keep the active page visible: if it overflowed, swap it in for the last visible item.
  const activeHidden = hidden.find((i) => i.id === active);
  if (activeHidden && visible.length) { hidden.splice(hidden.indexOf(activeHidden), 1, visible[visible.length - 1]); visible[visible.length - 1] = activeHidden; }
  const button = (i: ActivityItem) => {
    const isActive = active === i.id;
    return (
      <li key={i.id}>
        <Tip content={i.label} shortcut={i.shortcut} side="right">
          <button
            className={`activity-item ${isActive ? 'active' : ''}`}
            aria-label={i.label}
            aria-current={isActive ? 'page' : undefined}
            aria-expanded={i.id === 'Features' ? sidebarOpen : undefined}
            onClick={() => (i.id === 'Features' && isActive ? onToggleSidebar() : onSelect(i.id))}
          >
            <i.icon size={22} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </Tip>
      </li>
    );
  };
  return (
    <nav className="activity-bar" aria-label="Main">
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
        <li><Tip content="Workspace settings" side="right"><button className="activity-item" data-tour="workspace" aria-label="Workspace settings" onClick={onWorkspace}><Settings2 size={22} strokeWidth={1.6} aria-hidden="true" /></button></Tip></li>
        <li><Tip content="Preferences" shortcut="Ctrl+," side="right"><button className="activity-item" aria-label="Preferences" onClick={onPreferences}><SlidersHorizontal size={21} strokeWidth={1.6} aria-hidden="true" /></button></Tip></li>
      </ul>
    </nav>
  );
}
