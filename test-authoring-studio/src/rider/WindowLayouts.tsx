import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { applyWindowLayout, deleteWindowLayout, saveWindowLayout, windowLayouts } from './layoutStore';

/** Save Window Layout / Apply Window Layout (Visual Studio): named arrangements of panels and tool windows. */
export default function WindowLayouts({ onNotice }: { onNotice: (m: string) => void }) {
  const [list, setList] = useState(windowLayouts);
  const [name, setName] = useState('');
  return (
    <div className="window-layouts">
      <form className="new-file-form" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; saveWindowLayout(name.trim()); setList(windowLayouts()); onNotice(`Saved window layout "${name.trim()}".`); setName(''); }}>
        <label>Save the current layout as <input aria-label="Layout name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Debugging" /></label>
        <button className="button" type="submit">Save</button>
      </form>
      <ul aria-label="Saved layouts">
        {list.map((l) => (
          <li key={l.name}>
            <button className="link-button" onClick={() => applyWindowLayout(l.name)}>{l.name}</button> <small>{new Date(l.saved).toLocaleString()}</small>
            <button className="icon-button" aria-label={`Delete ${l.name}`} onClick={() => { deleteWindowLayout(l.name); setList(windowLayouts()); }}><Trash2 size={13} /></button>
          </li>
        ))}
        {!list.length && <li className="subtle">No saved layouts yet.</li>}
      </ul>
    </div>
  );
}
