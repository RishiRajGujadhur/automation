import * as ContextMenu from '@radix-ui/react-context-menu';
import { useEffect, useState, type ReactNode } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type MenuItem = { label: string; icon?: LucideIcon; onSelect: () => void; shortcut?: string; disabled?: boolean; danger?: boolean } | 'separator';

/** Right-click menu: secondary actions live here instead of as always-visible buttons. */
export function RowMenu({ items, children, label = 'Actions' }: { items: MenuItem[]; children: ReactNode; label?: string }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu" aria-label={label}>
          {items.map((item, i) =>
            item === 'separator' ? (
              <ContextMenu.Separator key={i} className="context-separator" />
            ) : (
              <ContextMenu.Item key={item.label} className={`context-item ${item.danger ? 'danger' : ''}`} disabled={item.disabled} onSelect={item.onSelect}>
                {item.icon && <item.icon size={14} />}
                <span>{item.label}</span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </ContextMenu.Item>
            ),
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Visible affordance for the same menu (touch/keyboard users can't right-click easily). */
export function MenuHint({ onOpen }: { onOpen?: (e: React.MouseEvent) => void }) {
  return (
    <button
      className="icon-button menu-hint"
      aria-label="More actions"
      title="More actions (right-click)"
      onClick={(e) => {
        e.stopPropagation();
        const el = e.currentTarget.closest('[data-menu-row]') as HTMLElement | null;
        const r = e.currentTarget.getBoundingClientRect();
        el?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left, clientY: r.bottom }));
        onOpen?.(e);
      }}
    >
      <MoreHorizontal size={15} />
    </button>
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

/** Collapsible card: heading + one-line summary when closed, full content when open. */
export function Collapsible({ id, title, summary, badge, children, defaultOpen = true, icon }: { id: string; title: ReactNode; summary?: ReactNode; badge?: ReactNode; children: ReactNode; defaultOpen?: boolean; icon?: ReactNode }) {
  const [open, setOpen] = useLocalState(`open:${id}`, defaultOpen);
  return (
    <section className={`panel collapsible ${open ? 'open' : ''}`}>
      <button className="collapsible-heading" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        {icon}
        <h2>{title}</h2>
        {!open && summary && <span className="collapsible-summary">{summary}</span>}
        {badge && <span className="collapsible-badge">{badge}</span>}
      </button>
      {open && <div className="wizard-body">{children}</div>}
    </section>
  );
}

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
