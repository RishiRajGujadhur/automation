import { Bell, Copy, Trash2, X } from 'lucide-react';
import { copyText } from '../ui';
import { featureOn } from '../features';
import { fileRefs, OPEN_LOCATION_EVENT } from '../editor/links';
import { clearNotices, markNoticesSeen, useNotices } from './notifications';
import { useEffect, useState } from 'react';

/** Notifications tool window: the session's messages, newest first. */
export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const all = useNotices();
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
        {notes.map((n, i) => <li key={`${n.at}-${i}`}><span className="todo-item"><small>{new Date(n.at).toLocaleTimeString()}</small> {featureOn('notification-links') ? fileRefs(n.text).map((p, k) => (typeof p === 'string' ? p : <button key={k} className="link-button" title="Open" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_LOCATION_EVENT, { detail: p }))}>{p.text}</button>)) : n.text}</span></li>)}
        {!notes.length && <li className="subtle">{all.length ? 'No notifications match the filter.' : 'No notifications in this session.'}</li>}
      </ul>
    </section>
  );
}
