import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight, Compass, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type AppMenuPage = { name: string; icon: LucideIcon; hint?: string };
export type AppMenuCommand = { label: string; icon: LucideIcon; run: () => void; shortcut?: string; disabled?: boolean };

/**
 * App-wide Radix context menu. Right-clicking empty space opens it; card/row menus nested inside
 * take precedence because Radix skips handlers whose event was already default-prevented.
 * Secondary pages (Step Catalog, Backgrounds, Selectors, Project Explorer, Config) live here.
 */
export default function AppMenu({ pages, primary, active, commands, onNavigate, children }: { pages: AppMenuPage[]; primary: AppMenuPage[]; active: string; commands: AppMenuCommand[]; onNavigate: (name: string) => void; children: ReactNode }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu app-menu" aria-label="Studio menu">
          <ContextMenu.Label className="context-label">Pages</ContextMenu.Label>
          {pages.map((p) => (
            <ContextMenu.Item key={p.name} className={`context-item ${active === p.name ? 'active' : ''}`} onSelect={() => onNavigate(p.name)}>
              <p.icon size={14} />
              <span>{p.name}</span>
              {p.hint && <kbd>{p.hint}</kbd>}
            </ContextMenu.Item>
          ))}
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="context-item">
              <Compass size={14} />
              <span>Main pages</span>
              <ChevronRight size={13} />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="context-menu" sideOffset={4}>
                {primary.map((p) => (
                  <ContextMenu.Item key={p.name} className={`context-item ${active === p.name ? 'active' : ''}`} onSelect={() => onNavigate(p.name)}>
                    <p.icon size={14} />
                    <span>{p.name}</span>
                    {p.hint && <kbd>{p.hint}</kbd>}
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
          <ContextMenu.Separator className="context-separator" />
          <ContextMenu.Label className="context-label">Actions</ContextMenu.Label>
          {commands.map((c) => (
            <ContextMenu.Item key={c.label} className="context-item" disabled={c.disabled} onSelect={c.run}>
              <c.icon size={14} />
              <span>{c.label}</span>
              {c.shortcut && <kbd>{c.shortcut}</kbd>}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Visible entry point to the same menu for people who don't right-click. */
export function AppMenuButton() {
  return (
    <button
      className="nav-tab app-menu-button"
      aria-label="Open studio menu"
      title="More pages and actions (or right-click anywhere)"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left, clientY: r.bottom + 4 }));
      }}
    >
      <MoreHorizontal size={18} />
    </button>
  );
}
