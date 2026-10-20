import { Bell, Copy, Trash2, X } from 'lucide-react';
import { copyText } from '../ui';
import { featureOn } from '../features';
import { fileRefs, OPEN_LOCATION_EVENT } from '../editor/links';
import { clearNotices, markNoticesSeen, useNotices } from './notifications';
import { useEffect, useState } from 'react';

/** How long ago, e.g. "just now", "5 min ago", "2 h ago" (QOL-50); the exact time is the tooltip. */
export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(at).toLocaleDateString();
}

/** Notifications tool window: the session's messages, newest first. */
export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const all = useNotices();
  // Re-render every half minute so the relative times move on.
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  // Filter the history by text (QOL-50).
  const [filter, setFilter] = useState('');
  const notes = featureOn('notifications-filter') && filter.trim() ? all.filter((n) => n.text.toLowerCase().includes(filter.trim().toLowerCase())) : all;
  useEffect(() => { markNoticesSeen(); }, [all]);
  return (
    <section className="debug-panel todo-panel" aria-label="Notifications">
      <div className="debug-toolbar" role="toolbar" aria-label="Notifications">
        <strong className="todo-count"><Bell size={13} /> {notes.length} notification{notes.length === 1 ? '' : 's'}</strong>
        {featureOn('notifications-copy') && <button className="icon-button" aria-label="Copy all notifications" title="Copy all" disabled={!notes.length} onClick={() => void copyText(notes.map((n) => `${new Date(n.at).toLocaleTimeString()} ${n.text}`).join('\n'))}><Copy size={14} /></button>}
        <button className="icon-button" aria-label="Clear notifications" title="Clear all" onClick={clearNotices}><Trash2 size={14} /></button>
        <span className="debug-spacer" />
        {featureOn('notifications-filter') && <input className="todo-filter" type="search" aria-label="Filter notifications" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && filter) { e.stopPropagation(); setFilter(''); } }} />}
        <button className="icon-button" aria-label="Close Notifications" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <ul className="todo-list" aria-label="Notification history">
        {notes.map((n, i) => <li key={`${n.at}-${i}`}><span className="todo-item">{featureOn('notification-ago') ? <small title={new Date(n.at).toLocaleString()}>{ago(n.at)}</small> : <small>{new Date(n.at).toLocaleTimeString()}</small>} {featureOn('notification-links') ? fileRefs(n.text).map((p, k) => (typeof p === 'string' ? p : <button key={k} className="link-button" title="Open" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_LOCATION_EVENT, { detail: p }))}>{p.text}</button>)) : n.text}</span></li>)}
        {!notes.length && <li className="subtle">{all.length ? 'No notifications match the filter.' : 'No notifications in this session.'}</li>}
      </ul>
    </section>
  );
}
