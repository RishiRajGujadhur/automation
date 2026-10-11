/**
 * Optional native features when the studio runs inside the Electron desktop app
 * (../test-authoring-desktop exposes `window.desktop` from its preload script). In a browser every
 * helper here is a no-op, so call sites never need to branch on more than `desktop`.
 */
export type DesktopMenuCommand = 'palette' | 'preferences' | 'shortcuts' | 'workspace-settings' | 'new-feature' | 'record' | 'tour' | 'toggle-mode' | 'toggle-explorer' | 'focus-mode' | 'repository-changed' | 'set-pref' | 'diagnostics' | 'run-tests' | 'continue-draft' | 'design-tool';
type DesktopBridge = {
  platform: string;
  versions: Record<string, string>;
  pickFolder(title?: string): Promise<string | null>;
  openInEditor(file: string, line?: number): Promise<string>;
  copyPath(file: string): Promise<string>;
  reveal(file: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  notify(title: string, body: string): void;
  setProgress(value: number): void;
  setTheme(colors: { background: string; text: string; dark: boolean }): void;
  onMenu(cb: (command: DesktopMenuCommand, arg?: unknown) => void): () => void;
};
export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? (window as unknown as { desktop?: DesktopBridge }).desktop : undefined;
export const isDesktop = !!desktop;

/** Mirrors the active app theme into the native window (title bar, background while resizing). */
export function syncDesktopTheme(theme: string) {
  if (!desktop) return;
  const css = getComputedStyle(document.documentElement);
  desktop.setTheme({ background: css.getPropertyValue('--bg').trim(), text: css.getPropertyValue('--text').trim(), dark: theme !== 'light' });
}
