import { useEffect, useRef, useState } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { featureOn } from './features';
import { copyText } from './ui';

/** A notice's severity, guessed from its words: VS Code's error / warning / info icons. */
export function noticeSeverity(text: string): 'error' | 'warning' | 'info' {
  if (/\b(fail|failed|error|errors|cannot|could not|not found|invalid|refused|denied|unavailable)\b/i.test(text) && !/\b0 errors\b/.test(text)) return 'error';
  if (/\b(warning|warnings|turned off|skipped|ignored|unsaved|not saved|outside)\b/i.test(text)) return 'warning';
  return 'info';
}

type Item = { id: number; text: string; undo?: { run: () => void } };
const MAX = 3;

/**
 * VS Code's notification toasts (VSCODE-250.md W36): bottom right, up to three stacked, each with its severity icon,
 * the message, its source, action buttons (Undo, Copy), a gear and a close button. Errors stay longer.
 */
export default function NotificationToasts({ notice, undo, silent, onUndone, onClosed }: { notice: string; undo?: { run: () => void }; silent: boolean; onUndone: () => void; onClosed: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(0);
  useEffect(() => {
    if (!notice || silent) return;
    setItems((list) => [...list.filter((x) => x.text !== notice), { id: ++next.current, text: notice, undo }].slice(-MAX));
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Do Not Disturb (or Zen Mode's silence) hides the toasts already up too.
  useEffect(() => { if (silent) setItems([]); }, [silent]);
  // Undo belongs to the newest toast (it is set together with the notice).
  useEffect(() => { setItems((list) => (list.length ? [...list.slice(0, -1), { ...list[list.length - 1], undo }] : list)); }, [undo]);
  const close = (id: number) => setItems((list) => { const rest = list.filter((x) => x.id !== id); if (list[list.length - 1]?.id === id) onClosed(); return rest; });
  return (
    <>
      {items.map((it) => {
        const sev = noticeSeverity(it.text);
        return (
          <Toast.Root
            key={it.id}
            duration={featureOn('toast-errors-longer') && sev === 'error' ? 15000 : undefined}
            className={`toast notification-toast severity-${sev}`}
            open
            onOpenChange={(open) => { if (!open) close(it.id); }}
          >
            <span className={`codicon codicon-${sev === 'error' ? 'error' : sev === 'warning' ? 'warning' : 'info'} notification-icon`} aria-label={sev} role="img" />
            <div className="notification-body">
              <Toast.Description className="notification-message">{it.text}</Toast.Description>
              <div className="notification-footer">
                <span className="notification-source">Source: TestAuthoring Studio</span>
                <span className="notification-buttons">
                  {featureOn('toast-copy') && <Toast.Action asChild altText="Copy the message"><button className="toast-copy notification-button secondary" aria-label="Copy the message" title="Copy" onClick={() => void copyText(it.text)}>Copy</button></Toast.Action>}
                  {it.undo && (
                    <Toast.Action asChild altText="Undo the last change">
                      <button className="notification-button" onClick={() => { it.undo!.run(); close(it.id); onUndone(); }}>Undo</button>
                    </Toast.Action>
                  )}
                </span>
              </div>
            </div>
            <Toast.Close className="toast-close" aria-label="Dismiss notification"><span className="codicon codicon-close" aria-hidden="true" /></Toast.Close>
          </Toast.Root>
        );
      })}
    </>
  );
}
