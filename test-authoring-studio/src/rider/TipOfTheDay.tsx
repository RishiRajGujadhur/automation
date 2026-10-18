import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { riderCommands, runRider } from './commands';

const STARTUP = 'tas:rider:tipsOnStartup';
const INDEX = 'tas:rider:tipIndex';
export const tipsOnStartup = () => { try { return localStorage.getItem(STARTUP) === '1'; } catch { return false; } };

/** Tips about the studio's own features, then one per Rider command with a shortcut. */
const STATIC: { title: string; text: string }[] = [
  { title: 'Search Everywhere', text: 'Press Shift twice to search files, types, members, features and steps at once.' },
  { title: 'Recent Files', text: 'Ctrl+E lists the files you opened last; press Ctrl+E again for Recent Locations with the code you were on.' },
  { title: 'Step completion', text: 'In a feature file, Ctrl+Space suggests existing step definitions; Tab moves between their parameters.' },
  { title: 'Go to the step definition', text: 'F12 on a Gherkin step opens the C# binding that runs it; Shift+F12 on a binding lists the steps that use it.' },
  { title: 'Bookmarks', text: 'Click the margin (or Ctrl+K Ctrl+K) to bookmark a line; the Bookmarks list jumps back to it.' },
  { title: 'Local History', text: 'Every save keeps a version. Right-click an editor ▸ Local History… to compare or revert, even without Git.' },
];
function tips() {
  return [
    ...STATIC.map((t) => ({ ...t, id: undefined as string | undefined })),
    ...riderCommands().filter((c) => c.shortcut).map((c) => ({ id: c.id, title: c.label.replace(/…$/, ''), text: `${c.menu} ▸ ${c.label.replace(/…$/, '')}: press ${c.shortcut}.` })),
  ];
}

/** Tip of the Day (Rider's Help ▸ Tip of the Day): one tip at a time, previous / next, optionally at startup. */
export default function TipOfTheDay({ onClose }: { onClose: () => void }) {
  const list = tips();
  const [i, setI] = useState(() => { try { return (Number(localStorage.getItem(INDEX)) || 0) % list.length; } catch { return 0; } });
  const [startup, setStartup] = useState(tipsOnStartup);
  const go = (n: number) => { const next = (n + list.length) % list.length; setI(next); try { localStorage.setItem(INDEX, String(next)); } catch { /* storage blocked */ } };
  const tip = list[i];
  return (
    <div className="tip-of-the-day">
      <article aria-label="Tip">
        <h3>{tip.title}</h3>
        <p>{tip.text}</p>
        {tip.id && <button className="button" onClick={() => { onClose(); requestAnimationFrame(() => runRider(tip.id!, 'palette')); }}>Try it</button>}
      </article>
      <div className="tip-actions">
        <label><input type="checkbox" checked={startup} onChange={(e) => { setStartup(e.target.checked); try { localStorage.setItem(STARTUP, e.target.checked ? '1' : '0'); } catch { /* storage blocked */ } }} /> Show tips on startup</label>
        <span className="subtle">{i + 1} / {list.length}</span>
        <button className="icon-button" aria-label="Previous tip" onClick={() => go(i - 1)}><ChevronLeft size={16} /></button>
        <button className="icon-button" aria-label="Next tip" onClick={() => go(i + 1)}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
