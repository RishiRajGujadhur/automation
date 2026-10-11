import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { usePrefs } from '../radix2';

/** SHA-256 hex, identical to the server's createHash('sha256') so the editor can prove what it loaded. */
export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const draftKey = (file: string) => `tas:unsaved:${file}`;
export function readDraft(file: string): string | null { try { return localStorage.getItem(draftKey(file)); } catch { return null; } }
function writeDraft(file: string, value: string | null) { try { if (value === null) localStorage.removeItem(draftKey(file)); else localStorage.setItem(draftKey(file), value); } catch { /* storage full or blocked */ } }
/** Files with unsaved edits kept in this browser (the explorer's pending-changes filter). */
export function unsavedFiles() { try { return Object.keys(localStorage).filter((k) => k.startsWith('tas:unsaved:')).map((k) => k.slice('tas:unsaved:'.length)); } catch { return []; } }
export const UNSAVED_EVENT = 'tas:unsaved-changed';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

/**
 * Editor buffer persistence, modelled on VS Code:
 * - hot exit: every unsaved edit is kept in browser storage and offered back when the file is reopened;
 * - auto save (Settings → Code editor): Off, After delay (ms), or On focus change, written with /api/file/save,
 *   which refuses when the file changed on disk since it was loaded (no silent overwrite).
 */
export function useAutoSave({ file, value, loaded }: { file?: string; value: string; loaded?: { source: string; hash: string } }) {
  const { prefs } = usePrefs();
  const [state, setState] = useState<SaveState>('saved');
  const [error, setError] = useState('');
  const base = useRef<{ source: string; hash: string }>(undefined);
  useEffect(() => { base.current = loaded; setState('saved'); setError(''); }, [loaded]);
  const dirty = !!loaded && value !== loaded.source && value !== base.current?.source;

  // Hot exit: mirror unsaved edits into storage; clear when back in sync.
  useEffect(() => {
    if (!file || !base.current) return;
    writeDraft(file, value !== base.current.source ? value : null);
    window.dispatchEvent(new Event(UNSAVED_EVENT));
    if (value !== base.current.source) setState((s) => (s === 'conflict' ? s : 'dirty'));
  }, [file, value]);

  const save = useCallback(async () => {
    if (!file || !base.current || value === base.current.source) return true;
    setState('saving');
    try {
      const r = await api<{ hash: string }>('/file/save', { file, source: value, baseHash: base.current.hash });
      base.current = { source: value, hash: r.hash };
      writeDraft(file, null);
      window.dispatchEvent(new Event(UNSAVED_EVENT));
      setState('saved');
      setError('');
      return true;
    } catch (e) {
      const m = (e as Error).message;
      setState(/changed outside/.test(m) ? 'conflict' : 'error');
      setError(m);
      return false;
    }
  }, [file, value]);

  // After delay
  useEffect(() => {
    if (prefs.autoSave !== 'afterDelay' || !dirty || state === 'conflict') return;
    const t = setTimeout(save, prefs.autoSaveDelay);
    return () => clearTimeout(t);
  }, [prefs.autoSave, prefs.autoSaveDelay, dirty, value, save, state]);
  // On focus change: when the window loses focus (the editor's own blur is handled by the caller via onBlur).
  useEffect(() => {
    if (prefs.autoSave !== 'onFocusChange') return;
    const h = () => { if (dirty) save(); };
    window.addEventListener('blur', h);
    return () => window.removeEventListener('blur', h);
  }, [prefs.autoSave, dirty, save]);

  /** Marks the buffer as matching what was just written by another path (e.g. an approved diff). */
  const markSaved = useCallback(async (source: string) => {
    base.current = { source, hash: await sha256(source) };
    if (file) writeDraft(file, null);
    window.dispatchEvent(new Event(UNSAVED_EVENT));
    setState('saved');
  }, [file]);
  return { state: dirty && state === 'saved' ? 'dirty' : state, error, dirty, save, markSaved, onBlur: () => { if (prefs.autoSave === 'onFocusChange' && dirty) save(); } };
}
