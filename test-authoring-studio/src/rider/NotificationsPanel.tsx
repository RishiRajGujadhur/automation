import { Bell, Trash2, X } from 'lucide-react';
import { clearNotices, useNotices } from './notifications';

/** Notifications tool window: the session's messages, newest first. */
export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const notes = useNotices();
  return (
    <section className="debug-panel todo-panel" aria-label="Notifications">
      <div className="debug-toolbar" role="toolbar" aria-label="Notifications">
        <strong className="todo-count"><Bell size={13} /> {notes.length} notification{notes.length === 1 ? '' : 's'}</strong>
        <button className="icon-button" aria-label="Clear notifications" title="Clear all" onClick={clearNotices}><Trash2 size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Notifications" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <ul className="todo-list" aria-label="Notification history">
        {notes.map((n, i) => <li key={`${n.at}-${i}`}><span className="todo-item"><small>{new Date(n.at).toLocaleTimeString()}</small> {n.text}</span></li>)}
        {!notes.length && <li className="subtle">No notifications in this session.</li>}
      </ul>
    </section>
  );
}
