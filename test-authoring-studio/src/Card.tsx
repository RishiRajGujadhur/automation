import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useLocalState } from './ui';

/**
 * Collapsible card (Radix Collapsible). Open/closed state is remembered per card id in localStorage
 * under "tas:card:<id>" (cleared by Preferences → Cached UI state).
 * The heading text stays a real <h2>; the toggle is a button inside it, so heading navigation still works.
 */
export default function Card({ id, title, badge, actions, children, defaultOpen = true, className = '', as: Tag = 'section', label }: { id: string; title: ReactNode; badge?: ReactNode; actions?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; as?: 'section' | 'aside'; label?: string }) {
  const [open, setOpen] = useLocalState(`card:${id}`, defaultOpen);
  const contentId = useId();
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} asChild>
      <Tag className={`panel card ${open ? 'open' : 'closed'} ${className}`} aria-label={label}>
        <div className="panel-heading card-heading">
          <h2>
            <Collapsible.Trigger className="card-toggle" aria-controls={contentId}>
              <ChevronDown size={14} className="card-chevron" aria-hidden="true" />
              {title}
            </Collapsible.Trigger>
          </h2>
          {(badge || actions) && (
            <div className="card-meta">
              {badge}
              {actions}
            </div>
          )}
        </div>
        <Collapsible.Content id={contentId} className="card-content">
          {children}
        </Collapsible.Content>
      </Tag>
    </Collapsible.Root>
  );
}
