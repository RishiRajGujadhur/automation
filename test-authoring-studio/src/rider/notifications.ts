import { useSyncExternalStore } from 'react';

/** Notifications (Visual Studio's bell): every notice of this session, newest first, until cleared. */
export type Note = { text: string; at: number };
// Kept for the session, also across reloads (QOL-50).
let notes: Note[] = (() => { try { return JSON.parse(sessionStorage.getItem('tas:notices') ?? '[]') as Note[]; } catch { return []; } })();
const keep = () => { try { sessionStorage.setItem('tas:notices', JSON.stringify(notes.slice(0, 200))); } catch { /* storage blocked */ } };
const listeners = new Set<() => void>();
export function recordNotice(text: string) {
  if (!text || notes[0]?.text === text) return;
  notes = [{ text, at: Date.now() }, ...notes].slice(0, 200);
  keep();
  for (const l of listeners) l();
}
// Unread notifications (the status bar badge): those newer than the last look at the window.
let seenAt = Date.now();
export const markNoticesSeen = () => { if (notes[0] && notes[0].at > seenAt) { seenAt = notes[0].at; notes = [...notes]; for (const l of listeners) l(); } };
export const unreadNotices = (list: Note[]) => list.filter((n) => n.at > seenAt).length;
/** Removes one notification (its × button) (QOL-50). */
export function dismissNotice(note: Note) { notes = notes.filter((n) => n !== note); keep(); for (const l of listeners) l(); }
export function clearNotices() { notes = []; keep(); for (const l of listeners) l(); }
export const useNotices = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => notes);
