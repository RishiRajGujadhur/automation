import { app } from 'electron';
import path from 'node:path';
import { ctx } from './context';

export const SCHEME = 'testauthoring';
const pages = ['dashboard', 'test-generator', 'features/editor', 'features/builder', 'features/recorder', 'dictionary-inspector', 'test-design', 'step-catalog', 'backgrounds', 'selectors', 'project-explorer', 'config'];

/** L1: register testauthoring:// (in development electron.exe needs the app folder as its first argument). */
export function registerProtocol() {
  if (app.isPackaged) app.setAsDefaultProtocolClient(SCHEME);
  else app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1] ?? '.')]);
}
export const linkArg = (argv: string[]) => argv.find((a) => a.toLowerCase().startsWith(`${SCHEME}:`));

export type Link = { kind: 'open'; folder: string } | { kind: 'page'; hash: string };
/** L2, L3: testauthoring://open?path=C:\Repo  ·  testauthoring://page/test-design */
export function parseLink(raw: string): Link | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== `${SCHEME}:`) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'open') { const folder = u.searchParams.get('path'); return folder ? { kind: 'open', folder } : null; }
  if (host === 'page') {
    const page = decodeURIComponent(u.pathname.replace(/^\/+|\/+$/g, '')).toLowerCase();
    return pages.includes(page) ? { kind: 'page', hash: `#/${page}` } : null;
  }
  return null;
}
/** K2: deep link to the page shown now. */
export function currentPageLink() {
  const hash = new URL(ctx.win?.webContents.getURL() ?? 'http://x/#/dashboard').hash.replace(/^#\/?/, '') || 'dashboard';
  return `${SCHEME}://page/${hash}`;
}
