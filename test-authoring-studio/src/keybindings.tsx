import { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import type { DesktopMenuCommand } from './desktop';
import { useLocalState } from './ui';

/** Commands a shortcut can be assigned to (the menu commands, as in Visual Studio's Options ▸ Keyboard). */
export const BINDABLE: { id: DesktopMenuCommand; label: string }[] = [
  { id: 'build', label: 'Build ▸ Build Solution' },
  { id: 'rebuild', label: 'Build ▸ Rebuild Solution' },
  { id: 'clean', label: 'Build ▸ Clean Solution' },
  { id: 'cancel-build', label: 'Build ▸ Cancel' },
  { id: 'build-windows', label: 'View ▸ Error List and Output' },
  { id: 'run-all-tests', label: 'Test ▸ Run All Tests' },
  { id: 'test-explorer', label: 'View ▸ Test Explorer' },
  { id: 'git-changes', label: 'View ▸ Git Changes' },
  { id: 'find-in-files', label: 'Edit ▸ Find in Files' },
  { id: 'replace-in-files', label: 'Edit ▸ Replace in Files' },
  { id: 'go-to-all', label: 'Edit ▸ Go to All' },
  { id: 'nuget', label: 'Project ▸ Manage NuGet Packages' },
  { id: 'spy', label: 'Tools ▸ Spy' },
  { id: 'output', label: 'View ▸ Output' },
  { id: 'todo', label: 'View ▸ TODO' },
  { id: 'open-folder', label: 'File ▸ Open Folder' },
  { id: 'open-solution', label: 'File ▸ Open Project/Solution' },
  { id: 'new-feature', label: 'File ▸ New Feature' },
  { id: 'save-all', label: 'File ▸ Save All' },
  { id: 'close-all-editors', label: 'Window ▸ Close All Documents' },
  { id: 'palette', label: 'View ▸ Command Palette' },
  { id: 'toggle-explorer', label: 'View ▸ Explorer' },
  { id: 'preferences', label: 'Tools ▸ Preferences' },
];

/** "Ctrl+Shift+K" for a key event; null for a lone modifier. Plain keys need a modifier or are function keys. */
export function chordOf(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const fn = /^F\d{1,2}$/.test(key);
  if (!fn && !(e.ctrlKey || e.metaKey || e.altKey)) return null;
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', key === ' ' ? 'Space' : key].filter(Boolean).join('+');
}

/** A chord → a menu command, `rider:<id>` (a Rider / editor command) or `palette:<label>` (a palette entry). */
export type Bindings = Record<string, DesktopMenuCommand | `rider:${string}` | `palette:${string}`>;
/** The command a palette row stands for, as stored in Bindings (W18 Configure Keybinding). */
export type BindTarget = { id: string; label: string };
/** Asks the shell to open Keyboard Shortcuts recording a key for one command (the palette's gear, W18). */
export const CONFIGURE_KEYBINDING_EVENT = 'tas:configure-keybinding';

/** Runs user shortcuts before the built-in ones (capture phase), so an assigned chord wins. */
export function useKeybindings(run: (c: Bindings[string]) => void) {
  // Read on each key press: the editor (Keyboard Shortcuts dialog) writes the same storage key.
  const ref = useRef(run);
  ref.current = run;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-recording-shortcut]')) return;
      const chord = chordOf(e);
      let bindings: Bindings = {};
      try { bindings = JSON.parse(localStorage.getItem('tas:keybindings') ?? '{}'); } catch { /* none */ }
      const cmd = chord ? bindings[chord] : undefined;
      if (!cmd) return;
      e.preventDefault();
      e.stopPropagation();
      ref.current(cmd);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);
}

/** Keyboard ▸ custom shortcuts: assign by pressing the keys, remove, reset. */
export function KeybindingEditor({ configure }: { configure?: BindTarget }) {
  const [bindings, setBindings] = useLocalState<Bindings>('keybindings', {});
  // Configure Keybinding from the palette: that command first, already waiting for its keys.
  const [recording, setRecording] = useState<string | null>(configure?.id ?? null);
  const chordsFor = (id: string) => Object.entries(bindings).filter(([, c]) => c === id).map(([k]) => k);
  const extra = Object.values(bindings).filter((c) => /^(rider|palette):/.test(c) && c !== configure?.id).filter((c, i, a) => a.indexOf(c) === i).map((c) => ({ id: c, label: c.replace(/^(rider|palette):/, '') }));
  const rows: { id: string; label: string }[] = [...(configure ? [configure] : []), ...extra, ...BINDABLE];
  return (
    <section className="keybindings" aria-label="Custom shortcuts">
      <h3 className="micro-label">CUSTOM SHORTCUTS</h3>
      <ul>
        {rows.map((b) => (
          <li key={b.id}>
            <span>{b.label}</span>
            <span className="kb-chords">
              {chordsFor(b.id).map((k) => (
                <kbd key={k}>{k}<button className="icon-button" aria-label={`Remove ${k} from ${b.label}`} onClick={() => { const n = { ...bindings }; delete n[k]; setBindings(n); }}><X size={11} /></button></kbd>
              ))}
              {recording === b.id ? (
                <input
                  data-recording-shortcut
                  autoFocus
                  readOnly
                  aria-label={`Press the shortcut for ${b.label}`}
                  placeholder="Press keys… (Esc cancels)"
                  onBlur={() => setRecording(null)}
                  onKeyDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.key === 'Escape') { setRecording(null); return; }
                    const chord = chordOf(e.nativeEvent);
                    if (!chord) return;
                    setBindings({ ...bindings, [chord]: b.id as Bindings[string] });
                    setRecording(null);
                  }}
                />
              ) : (
                <button className="button" aria-label={`Assign shortcut to ${b.label}`} onClick={() => setRecording(b.id)}><Keyboard size={12} /> Assign</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {Object.keys(bindings).length > 0 && <button className="button" onClick={() => setBindings({})}>Reset custom shortcuts</button>}
    </section>
  );
}
