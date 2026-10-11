import type { BrowserWindow } from 'electron';

/** Process-wide state shared by the main-process modules (avoids import cycles with main.ts). */
export const ctx: {
  origin: string;
  win?: BrowserWindow;
  repository?: string;
  /** True once the user really wants to quit (bypasses close-to-tray). */
  quitting?: boolean;
  /** K8: opens another window on the same API. */
  newWindow?: () => void;
} = { origin: '' };
