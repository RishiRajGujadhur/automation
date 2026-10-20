import { useState } from 'react';
import { FEATURES, featureOn, setFeature, useFeatures } from '../features';

/** What's New: the latest IDE features (IDE-FEATURES.md), each with its switch, newest first. */
export default function WhatsNew() {
  useFeatures();
  const [query, setQuery] = useState('');
  const start = FEATURES.findIndex((f) => f.id === 'sort-lines');
  const q = query.trim().toLowerCase();
  const list = FEATURES.slice(start < 0 ? 0 : start).reverse().filter((f) => !q || `${f.label} ${f.description} ${f.group}`.toLowerCase().includes(q));
  return (
    <div className="whats-new">
      <input autoFocus aria-label="Filter new features" placeholder={`Filter ${list.length} new features`} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul aria-label="New features">
        {list.map((f) => (
          <li key={f.id}>
            <label>
              <input type="checkbox" checked={featureOn(f.id)} onChange={(e) => setFeature(f.id, e.target.checked)} aria-label={f.label} />
              <span><strong>{f.label}</strong> <small>{f.group}</small><br /><span className="subtle">{f.description}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
