/** Clipboard history (Rider's Paste from History, Ctrl+Shift+V): the last texts copied or cut in the editors. */
const KEY = 'tas:rider:clipboard';
const MAX = 40;
let ring: string[] = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; } })();

export function pushClipboard(text: string) {
  if (!text.trim() || text.length > 100_000) return;
  ring = [text, ...ring.filter((t) => t !== text)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(ring)); } catch { /* storage blocked or full */ }
}
export const clipboardHistory = () => ring;
export function removeClipboard(text: string) {
  ring = ring.filter((t) => t !== text);
  try { localStorage.setItem(KEY, JSON.stringify(ring)); } catch { /* storage blocked */ }
}
