import type { BrowserWindow } from 'electron';

/** Process-wide state shared by the main-process modules (avoids import cycles with main.ts). */
export const ctx: { origin: string; win?: BrowserWindow; repository?: string } = { origin: '' };
