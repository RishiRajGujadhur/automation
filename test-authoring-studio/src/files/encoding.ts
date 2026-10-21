import { useSyncExternalStore } from 'react';

/**
 * File encodings (VSCODE-250.md W25 / W26): what each open file was read with and will be saved with. The server
 * detects a byte order mark; Reopen with Encoding reads the file again in another encoding, Save with Encoding
 * changes what the next save writes.
 */
export const ENCODINGS = [
  { id: 'utf8', label: 'UTF-8' },
  { id: 'utf8bom', label: 'UTF-8 with BOM' },
  { id: 'utf16le', label: 'UTF-16 LE' },
  { id: 'utf16be', label: 'UTF-16 BE' },
  { id: 'windows1252', label: 'Western (Windows 1252)' },
  { id: 'iso88591', label: 'Western (ISO 8859-1)' },
] as const;
export type EncodingId = (typeof ENCODINGS)[number]['id'];
export const encodingLabel = (id?: string) => ENCODINGS.find((e) => e.id === id)?.label ?? 'UTF-8';

// file → { read: the encoding the text was decoded with, save: the one the next save writes }
const files = new Map<string, { read: EncodingId; save: EncodingId }>();
// Reopen with Encoding: the encoding the next read of the file uses.
const reopen = new Map<string, EncodingId>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };
export const useEncodings = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
export const encodingOf = (file: string) => files.get(file);
export const reopenEncoding = (file: string) => reopen.get(file);
export function noteRead(file: string, enc: EncodingId) { files.set(file, { read: enc, save: enc }); emit(); }
export function setSaveEncoding(file: string, enc: EncodingId) { const e = files.get(file); files.set(file, { read: e?.read ?? 'utf8', save: enc }); emit(); }
/** After a save the file is in its save encoding. */
export function noteSaved(file: string) { const e = files.get(file); if (e && e.read !== e.save) { files.set(file, { read: e.save, save: e.save }); reopen.set(file, e.save); emit(); } }
export function setReopenEncoding(file: string, enc: EncodingId) { reopen.set(file, enc); }
