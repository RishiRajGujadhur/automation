import { BrowserWindow, screen } from 'electron';
import { read, write } from './store';

const DEFAULT: { x?: number; y?: number; width: number; height: number; maximized: boolean } = { width: 1440, height: 920, maximized: false };

/** Saved bounds, discarded if they no longer intersect any display (monitor unplugged). */
export function initialBounds() {
  const s = read().window ?? DEFAULT;
  if (s.x === undefined || s.y === undefined) return s;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return s.x! < a.x + a.width - 80 && s.x! + s.width > a.x + 80 && s.y! < a.y + a.height - 40 && s.y! + 40 > a.y;
  });
  return visible ? s : { ...DEFAULT, maximized: s.maximized };
}

/** Persists size/position/maximized, debounced, using normal bounds so un-maximizing restores them. */
export function trackWindowState(win: BrowserWindow) {
  let timer: NodeJS.Timeout | undefined;
  const save = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const b = win.getNormalBounds();
    write({ window: { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() } });
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(save, 400); };
  for (const e of ['resize', 'move', 'maximize', 'unmaximize'] as const) win.on(e as 'resize', later);
  win.on('close', save);
}
