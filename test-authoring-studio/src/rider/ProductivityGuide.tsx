import { useMemo, useState } from 'react';
import { readUsage, riderCommands, runRider } from './commands';

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} days ago`;
};

/** Productivity Guide (Rider's Help ▸ My Productivity): how often each feature was used, and with its shortcut. */
export default function ProductivityGuide({ onClose }: { onClose: () => void }) {
  const [usage] = useState(readUsage);
  const rows = useMemo(() => riderCommands().map((c) => ({ c, u: usage[c.id] })).sort((a, b) => (b.u?.count ?? 0) - (a.u?.count ?? 0) || a.c.label.localeCompare(b.c.label)), [usage]);
  const used = rows.filter((r) => r.u);
  const total = used.reduce((n, r) => n + r.u!.count, 0);
  const keys = used.reduce((n, r) => n + r.u!.keys, 0);
  return (
    <div className="productivity-guide">
      <p className="subtle" role="status">{used.length} of {rows.length} features used, {total} times; {total ? Math.round((keys / total) * 100) : 0}% with the keyboard.</p>
      <div className="productivity-scroll">
        <table aria-label="Feature usage">
          <thead><tr><th>Feature</th><th>Used</th><th>With shortcut</th><th>Last used</th><th>Shortcut</th></tr></thead>
          <tbody>
            {rows.map(({ c, u }) => (
              <tr key={c.id} className={u ? '' : 'unused'}>
                <td><button className="link-button" onClick={() => { onClose(); requestAnimationFrame(() => runRider(c.id, 'palette')); }}>{c.label}</button> <small>{c.menu}</small></td>
                <td>{u?.count ?? 0}</td>
                <td>{u ? `${Math.round((u.keys / u.count) * 100)}%` : '—'}</td>
                <td>{u ? ago(u.last) : 'never'}</td>
                <td>{c.shortcut ? <kbd>{c.shortcut}</kbd> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
