import { useEffect, useState } from 'react';
import { useLocalState } from './ui';
import { setViewOptions } from './editor/viewOptions';

/** Status bar entries that can be hidden (VS Code's status bar context menu, W30), found by their labels. */
const ENTRIES: { id: string; name: string; selector: string }[] = [
  { id: 'remote', name: 'Remote Host', selector: '[aria-label="Open a Remote Window"]' },
  { id: 'problems', name: 'Problems', selector: '[aria-label^="Problems:"]' },
  { id: 'index', name: 'Repository Index', selector: '[aria-label="Rescan repository"]' },
  { id: 'cursor', name: 'Editor Selection', selector: '[aria-label="Cursor position"]' },
  { id: 'indentation', name: 'Editor Indentation', selector: '[aria-label^="Indentation:"]' },
  { id: 'encoding', name: 'Editor Encoding', selector: '[aria-label^="Select Encoding"]' },
  { id: 'eol', name: 'Editor End of Line', selector: '[aria-label^="Line separators"]' },
  { id: 'language', name: 'Editor Language', selector: '[aria-label^="Select Language Mode"]' },
  { id: 'zoom', name: 'Editor Zoom', selector: '[aria-label^="Editor zoom"]' },
  { id: 'branch', name: 'Source Control', selector: '[aria-label^="Branch "]' },
  { id: 'autosave', name: 'Auto Save', selector: '[aria-label^="Auto Save:"]' },
  { id: 'tests', name: 'Test Results', selector: '[aria-label^="Tests:"]' },
  { id: 'memory', name: 'Memory', selector: '[aria-label^="Memory:"]' },
  { id: 'notifications', name: 'Notifications', selector: '[aria-label*="notification"]' },
];

/** The hidden entries' CSS, and the right-click menu that toggles them. */
export default function StatusBarMenu() {
  const [hidden, setHidden] = useLocalState<string[]>('statusBarHidden', []);
  const [at, setAt] = useState<{ x: number; y: number }>();
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('footer.status-bar')) return; e.preventDefault(); setAt({ x: e.clientX, y: e.clientY }); };
    window.addEventListener('contextmenu', h);
    return () => window.removeEventListener('contextmenu', h);
  }, []);
  useEffect(() => {
    if (!at) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.status-bar-menu')) setAt(undefined); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(undefined); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [at]);
  const css = hidden.map((id) => ENTRIES.find((e) => e.id === id)).filter(Boolean).map((e) => `footer.status-bar ${e!.selector} { display: none !important; }`).join('\n');
  return (
    <>
      {css && <style>{css}</style>}
      {at && (
        <div className="status-bar-menu context-menu" role="menu" aria-label="Status bar" style={{ position: 'fixed', left: Math.min(at.x, window.innerWidth - 230), bottom: window.innerHeight - at.y + 4 }}>
          {ENTRIES.map((e) => (
            <button key={e.id} role="menuitemcheckbox" aria-checked={!hidden.includes(e.id)} className="context-menu-item" onClick={() => setHidden(hidden.includes(e.id) ? hidden.filter((x) => x !== e.id) : [...hidden, e.id])}>
              <span className="check">{hidden.includes(e.id) ? '' : '✓'}</span>{e.name}
            </button>
          ))}
          <div className="context-menu-separator" role="separator" />
          <button role="menuitem" className="context-menu-item" onClick={() => { setViewOptions({ hideStatusBar: true }); setAt(undefined); }}><span className="check" />Hide Status Bar</button>
        </div>
      )}
    </>
  );
}
