/** Contract between the preload script and the studio web app (`window.desktop`). */
export type MenuCommand =
  | 'palette' | 'preferences' | 'shortcuts' | 'workspace-settings' | 'new-feature' | 'record' | 'tour' | 'toggle-mode' | 'toggle-explorer' | 'focus-mode' | 'repository-changed' | 'set-pref' | 'diagnostics' | 'run-tests' | 'continue-draft' | 'design-tool' | 'debug' | 'open-folder' | 'open-solution' | 'build' | 'rebuild' | 'clean' | 'cancel-build' | 'build-windows' | 'test-explorer' | 'find-in-files' | 'replace-in-files' | 'go-to-all' | 'git-changes' | 'nuget' | 'unused-steps' | 'spy' | 'output' | 'todo' | 'rider' | 'run-all-tests' | 'save' | 'save-all' | 'close-editor' | 'close-all-editors';

export type DesktopBridge = {
  platform: NodeJS.Platform;
  versions: { app: string; electron: string; chrome: string; node: string };
  /** Native folder picker; resolves to an absolute path or null when cancelled. */
  pickFolder(title?: string): Promise<string | null>;
  /** File ▸ Open Project/Solution: the native file dialog (.sln / .slnx / .csproj), then opens it. */
  openSolution?(): Promise<void>;
  setDisabledCommands?(ids: string[]): void;
  /** Opens a repository file (relative to the current repository root) in the OS default app. */
  openInEditor(file: string, line?: number): Promise<string>;
  /** Copies the absolute path of a repository file. */
  copyPath(file: string): Promise<string>;
  /** Shows a repository file in Explorer/Finder. */
  reveal(file: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  /** Notifies only while the window is unfocused. */
  notify(title: string, body: string): void;
  /** 0–1 shows taskbar progress, -1 clears it, 2 is indeterminate. */
  setProgress(value: number): void;
  setTheme(colors: { background: string; text: string; dark: boolean }): void;
  /** window.menuBarVisibility (VS Code): the native menu bar classic, toggled by Alt, hidden, or behind a ☰ (compact). */
  setMenuBarVisibility?(mode: 'classic' | 'compact' | 'toggle' | 'hidden'): void;
  /** Shows the application menu at the given point (the compact menu bar's ☰ button). */
  popupMenu?(x: number, y: number): void;
  /** Commands from the native menu that the web app handles. Returns an unsubscribe function. */
  onMenu(cb: (command: MenuCommand, arg?: unknown) => void): () => void;
};

export const IPC = {
  pickFolder: 'desktop:pick-folder',
  openSolution: 'desktop:open-solution',
  openInEditor: 'desktop:open-in-editor',
  reveal: 'desktop:reveal',
  openExternal: 'desktop:open-external',
  notify: 'desktop:notify',
  progress: 'desktop:progress',
  theme: 'desktop:theme',
  menu: 'desktop:menu',
  disabledCommands: 'desktop:disabled-commands',
  dropFolder: 'desktop:drop-folder',
  copyPath: 'desktop:copy-path',
  menuBarVisibility: 'desktop:menu-bar-visibility',
  popupMenu: 'desktop:popup-menu',
} as const;
