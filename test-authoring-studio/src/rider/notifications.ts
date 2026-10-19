import { useSyncExternalStore } from 'react';

/** Notifications (Visual Studio's bell): every notice of this session, newest first, until cleared. */
export type Note = { text: string; at: number };
let notes: Note[] = [];
const listeners = new Set<() => void>();
export function recordNotice(text: string) {
  if (!text || notes[0]?.text === text) return;
  notes = [{ text, at: Date.now() }, ...notes].slice(0, 200);
  for (const l of listeners) l();
}
export function clearNotices() { notes = []; for (const l of listeners) l(); }
export const useNotices = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => notes);
