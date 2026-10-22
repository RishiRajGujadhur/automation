import { api } from '../api';
import { getTabs, filesDeletedOutside } from './tabs';
import { isBrowser } from './provider';

/**
 * Files of open tabs that disappear from disk outside the studio (VSCODE-250.md W73), checked every few seconds
 * while the window is visible: workbench.editor.closeOnFileDelete then closes or marks their tabs.
 */
async function check() {
  if (isBrowser() || document.visibilityState !== 'visible') return;
  const files = getTabs().tabs.filter((t) => !t.deleted && !t.file.startsWith('.tas/')).map((t) => t.file);
  if (!files.length) return;
  try { const gone = await api<string[]>('/files/missing', { files }); if (gone.length) filesDeletedOutside(gone); } catch { /* server busy */ }
}
if (typeof window !== 'undefined') { setInterval(() => void check(), 3000); window.addEventListener('focus', () => void check()); }
