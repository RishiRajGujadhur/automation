import * as ContextMenu from '@radix-ui/react-context-menu';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { Dropdown, MenuEntries, type MenuEntry } from './radix';

export type MenuItem = MenuEntry;
const RowMenuItems = createContext<{ items: MenuItem[]; label: string } | null>(null);

/** Right-click menu (Radix ContextMenu): secondary actions live here instead of as always-visible buttons. */
export function RowMenu({ items, children, label = 'Actions' }: { items: MenuItem[]; children: ReactNode; label?: string }) {
  return (
    <RowMenuItems.Provider value={{ items, label }}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu" aria-label={label}>
            <MenuEntries entries={items} P={ContextMenu} />
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </RowMenuItems.Provider>
  );
}

/** Visible ⋯ button opening the same items as a Radix DropdownMenu (for touch and keyboard users). */
export function MenuHint() {
  const ctx = useContext(RowMenuItems);
  if (!ctx) return null;
  return (
    <span className="menu-hint" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Dropdown entries={ctx.items} label="More actions" align="end" />
    </span>
  );
}

/** useState persisted to localStorage (per-viewer convenience only; tolerant of blocked storage). */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem('tas:' + key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('tas:' + key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-button copy-button"
      aria-label={label}
      title={label}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** Collapsible card (Radix Accordion): heading + one-line summary when closed, full content when open. */
export { AccordionSection as Collapsible } from './radix2';

/** Highlights query terms in text (case-insensitive, whole query tokens). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.join('|')})`, 'gi');
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

/** Arrow-key navigation within a list of buttons. */
export function arrowNav(e: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-nav-item]'));
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
  if (items[next]) {
    e.preventDefault();
    items[next].focus();
  }
}

/** Escape clears a search input before it bubbles up and closes anything else. */
export const clearOnEscape = (value: string, set: (v: string) => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Escape' && value) {
    e.stopPropagation();
    set('');
  }
};
