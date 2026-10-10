import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Secondary navigation: keeps the tab bar short while the active page stays visibly selected. */
export default function MoreMenu({ items, active, onSelect }: { items: readonly { name: string; icon: LucideIcon }[]; active: string; onSelect: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = items.find((i) => i.name === active);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  return (
    <div className="more-menu" ref={ref}>
      <button className={`nav-tab ${current ? 'active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {current ? <><current.icon size={18} strokeWidth={1.7} />{current.name}</> : 'More'}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="context-menu more-menu-list"
          role="menu"
          onKeyDown={(e) => {
            const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
            const i = els.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
          }}
        >
          {items.map((i) => (
            <button key={i.name} role="menuitem" className={`context-item ${i.name === active ? 'active' : ''}`} onClick={() => { onSelect(i.name); setOpen(false); }}>
              <i.icon size={15} />
              {i.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
