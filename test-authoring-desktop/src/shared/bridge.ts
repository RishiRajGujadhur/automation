/** Contract between the preload script and the studio web app (`window.desktop`). */
export type MenuCommand =
  | 'palette' | 'preferences' | 'shortcuts' | 'workspace-settings' | 'new-feature' | 'record' | 'tour' | 'toggle-mode' | 'toggle-explorer' | 'focus-mode' | 'repository-changed';

export type DesktopBridge = {
  platform: NodeJS.Platform;
  versions: { app: string; electron: string; chrome: string; node: string };
  /** Native folder picker; resolves to an absolute path or null when cancelled. */
  pickFolder(title?: string): Promise<string | null>;
  /** Opens a repository file (relative to the current repository root) in the OS default app. */
  openInEditor(file: string): Promise<string>;
  /** Shows a repository file in Explorer/Finder. */
  reveal(file: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  /** Notifies only while the window is unfocused. */
  notify(title: string, body: string): void;
  /** 0–1 shows taskbar progress, -1 clears it, 2 is indeterminate. */
  setProgress(value: number): void;
  setTheme(colors: { background: string; text: string; dark: boolean }): void;
  /** Commands from the native menu that the web app handles. Returns an unsubscribe function. */
  onMenu(cb: (command: MenuCommand) => void): () => void;
};

export const IPC = {
  pickFolder: 'desktop:pick-folder',
  openInEditor: 'desktop:open-in-editor',
  reveal: 'desktop:reveal',
  openExternal: 'desktop:open-external',
  notify: 'desktop:notify',
  progress: 'desktop:progress',
  theme: 'desktop:theme',
  menu: 'desktop:menu',
  dropFolder: 'desktop:drop-folder',
} as const;
