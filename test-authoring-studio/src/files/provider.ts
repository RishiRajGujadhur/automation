import { useSyncExternalStore } from 'react';
import { api } from '../api';
import { files } from '../vscode/files';
import { setting } from '../vscode/settings';
import { encodingOf, noteRead, noteSaved, reopenEncoding, type EncodingId } from './encoding';
import { readText, writeText, browserRoot, copyPath as fsaCopy, deletePath as fsaDelete, renamePath as fsaRename } from './fsa';

/**
 * Where editor files come from: the studio server (the indexed repository path) or a folder opened in the
 * browser with the File System Access API. Editors read and save through here, so both behave the same.
 */
export type FileSource = { kind: 'server'; root?: string } | { kind: 'browser'; name: string };
let source: FileSource = { kind: 'server' };
const listeners = new Set<() => void>();
export function setFileSource(s: FileSource) { source = s; for (const l of listeners) l(); }
export const fileSource = () => source;
export const useFileSource = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, fileSource);
export const isBrowser = () => source.kind === 'browser' && !!browserRoot();

async function digest(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readFile(file: string): Promise<{ source: string; hash: string }> {
  if (isBrowser()) { const text = await readText(file); return { source: text, hash: await digest(text) }; }
  // Reopen with Encoding (W25): the chosen encoding; otherwise the server detects it.
  const enc = reopenEncoding(file);
  const fallback = files.encoding();
  const r = await api<{ source: string; hash: string; encoding?: EncodingId }>(`/source?file=${encodeURIComponent(file)}${enc ? `&encoding=${enc}` : ''}${fallback !== 'utf8' ? `&fallback=${fallback}` : ''}`);
  if (r.encoding) noteRead(file, r.encoding);
  return r;
}

/** Writes only when the file on disk is still the one the editor loaded (baseHash); otherwise refuses. */
export async function saveFile(file: string, text: string, baseHash: string): Promise<{ hash: string }> {
  if (isBrowser()) {
    const current = await readText(file).then(digest, () => null);
    if (current !== null && current !== baseHash) throw new Error(`${file} changed outside the studio since it was opened. Reload it before saving.`);
    await writeText(file, text);
    return { hash: await digest(text) };
  }
  const enc = encodingOf(file);
  const fallback = files.encoding();
  const r = await api<{ hash: string }>('/file/save', { file, source: text, baseHash, ...(enc ? { encoding: enc.save, reopened: enc.read } : {}), ...(fallback !== 'utf8' ? { fallback } : {}) });
  noteSaved(file);
  return r;
}

/* Explorer file operations, on the studio server's repository or the browser folder. */
export async function renamePath(from: string, to: string) {
  if (isBrowser()) await fsaRename(from, to); else await api('/file/rename', { from, to });
}
export async function copyPath(from: string, to: string): Promise<string> {
  if (isBrowser()) return fsaCopy(from, to);
  return (await api<{ file: string }>('/file/copy', { from, to, naming: setting('explorer.incrementalNaming') })).file;
}
export async function deletePath(file: string) {
  if (isBrowser()) await fsaDelete(file); else await api('/file/delete', { file, approved: true });
}
