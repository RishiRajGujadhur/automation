import * as ContextMenu from '@radix-ui/react-context-menu';
import { Compass, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dropdown, MenuEntries, type MenuEntry } from './radix';

export type AppMenuPage = { name: string; icon: LucideIcon; hint?: string };
export type AppMenuCommand = { label: string; icon: LucideIcon; run: () => void; shortcut?: string; disabled?: boolean };
type Props = { pages: AppMenuPage[]; primary: AppMenuPage[]; active: string; commands: AppMenuCommand[]; onNavigate: (name: string) => void };

/** One entry list feeds both the right-click ContextMenu and the ⋯ DropdownMenu. */
export function studioEntries({ pages, primary, active, commands, onNavigate }: Props): MenuEntry[] {
  const page = (p: AppMenuPage): MenuEntry => ({ label: p.name, icon: p.icon, shortcut: p.hint, active: active === p.name, onSelect: () => onNavigate(p.name) });
  return [
    { heading: 'Pages' },
    ...pages.map(page),
    { submenu: 'Main pages', icon: Compass, items: primary.map(page) },
    'separator',
    { heading: 'Actions' },
    ...commands.map((c): MenuEntry => ({ label: c.label, icon: c.icon, shortcut: c.shortcut, disabled: c.disabled, onSelect: c.run })),
  ];
}

/**
 * App-wide Radix context menu. Right-clicking empty space opens it; card/row menus nested inside
 * take precedence because Radix skips handlers whose event was already default-prevented.
 */
export default function AppMenu({ children, ...props }: Props & { children: ReactNode }) {
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu app-menu" aria-label="Studio menu">
          <MenuEntries entries={studioEntries(props)} P={ContextMenu} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Visible entry point: the same menu as a Radix DropdownMenu anchored to the tab bar. */
export function AppMenuButton(props: Props) {
  return (
    <Dropdown
      entries={studioEntries(props)}
      label="Studio menu"
      trigger={
        <button className="nav-tab app-menu-button" aria-label="Open studio menu" title="More pages and actions (or right-click anywhere)">
          <MoreHorizontal size={18} />
        </button>
      }
    />
  );
}
