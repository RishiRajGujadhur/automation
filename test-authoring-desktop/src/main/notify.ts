import { Notification } from 'electron';
import { ctx } from './context';
import { read } from './store';

/** Desktop notification that respects Do Not Disturb (N3) and, when clicked, focuses the window on a page (N4). */
export function notify(title: string, body: string, opts: { hash?: string; always?: boolean } = {}) {
  if (read().doNotDisturb || !Notification.isSupported()) return;
  if (!opts.always && ctx.win?.isFocused()) return;
  const n = new Notification({ title: title.slice(0, 120), body: body.slice(0, 400) });
  n.on('click', () => {
    const w = ctx.win;
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    if (opts.hash) w.webContents.executeJavaScript(`location.hash = ${JSON.stringify(opts.hash)}`).catch(() => {});
  });
  n.show();
}
