import { useEffect } from 'react';
import { clearNotices, dismissNotice, markNoticesSeen, useNotices } from './rider/notifications';
import { noticeSeverity } from './NotificationToasts';
import { setViewOptions, useViewOptions } from './editor/viewOptions';
import { timeAgo } from './time';

/**
 * VS Code's Notification Center (VSCODE-250.md W37): the bell's popup above the status bar, every notification of the
 * session with its severity, Clear All, Do Not Disturb and Hide; × clears one.
 */
export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const notes = useNotices();
  const view = useViewOptions();
  useEffect(() => { markNoticesSeen(); }, [notes]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const now = Date.now();
  return (
    <section className="notification-center" role="region" aria-label="Notification Center">
      <header className="notification-center-header">
        <span>{notes.length ? 'NOTIFICATIONS' : 'NO NEW NOTIFICATIONS'}</span>
        <span className="notification-center-actions">
          <button className="icon-button" aria-label="Clear All Notifications" title="Clear All Notifications" onClick={clearNotices}><span className="codicon codicon-clear-all" /></button>
          <button className="icon-button" aria-label="Toggle Do Not Disturb Mode" aria-pressed={!!view.doNotDisturb} title="Toggle Do Not Disturb Mode" onClick={() => setViewOptions({ doNotDisturb: !view.doNotDisturb })}><span className={`codicon codicon-${view.doNotDisturb ? 'bell-slash' : 'bell'}`} /></button>
          <button className="icon-button" aria-label="Hide Notifications" title="Hide Notifications" onClick={onClose}><span className="codicon codicon-chevron-down" /></button>
        </span>
      </header>
      <ul className="notification-center-list">
        {notes.map((n) => {
          const sev = noticeSeverity(n.text);
          return (
            <li key={`${n.at}:${n.text}`} className={`notification-center-item severity-${sev}`}>
              <span className={`codicon codicon-${sev} notification-icon`} role="img" aria-label={sev} />
              <span className="notification-center-text">{n.text}<small>Source: TestAuthoring Studio · {timeAgo(new Date(n.at).toISOString(), now)}</small></span>
              <button className="icon-button" aria-label={`Clear Notification: ${n.text}`} title="Clear Notification" onClick={() => dismissNotice(n)}><span className="codicon codicon-close" /></button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
