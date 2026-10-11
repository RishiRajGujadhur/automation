# TestAuthoring Studio Desktop — plan

An Electron (TypeScript) desktop version of `../test-authoring-studio`. It **reuses the web app as-is**:
- the React client is the studio's `vite build` output;
- the Express API (`server/index.ts`, scanner bridge, recorder, search worker) is bundled with esbuild and runs **inside the Electron main process** on a free loopback port;
- the studio is told where resources and writable state live through `STUDIO_ROOT` (bundled resources) and `STUDIO_DATA` (the OS user-data folder).

Only desktop-specific code lives here: the main process, a preload bridge (`window.desktop`), build/package scripts and tests. Small web-app hooks (`src/desktop.ts` in the studio) light up native features when `window.desktop` exists and are inert in the browser.

Legend: `[x]` done · `[ ]` to do. Every feature is committed and pushed when finished.

## Features
- [x] D1 Scaffold: package.json, tsconfig, esbuild build script, bundled server + client + worker + fixtures
- [x] D2 Main process: free-port selection, in-process API, health wait, splash/loading and error page
- [x] D3 Single-instance lock (second launch focuses the window)
- [x] D4 Window state persistence (size, position, maximized, display-safe)
- [x] D5 Native application menu (File / Edit / View / Go / Window / Help) with accelerators
- [x] D6 Open repository… native folder picker → workspace scan; recent repositories menu + Windows jump list
- [x] D7 Preload bridge `window.desktop` (contextIsolation, sandbox, typed IPC, sender validation)
- [x] D8 Web-app integration: Browse… button for repository root, "Open in default editor", "Reveal in Explorer" in source view
- [x] D9 External links open in the system browser; navigation locked to the app origin; permission requests denied
- [x] D10 Native theme sync (title bar colour follows app theme; nativeTheme)
- [x] D11 Native notifications when a scan or test run finishes while the window is unfocused; taskbar progress during work
- [x] D12 Drag a repository folder onto the window to open it (preload drop handler; also a folder argument / second launch)
- [x] D13 App icon generated from the studio's `public/icon.svg`
- [x] D14 Packaging with electron-builder (Windows NSIS installer + portable)
- [x] D15 Automated tests: Playwright `_electron` smoke test (launch, API, navigation, desktop bridge)
- [x] D16 README: build, run, package, architecture, limits

- [x] D17 Self-contained Roslyn scanner bundled (no .NET runtime needed on the user's machine)
- [x] D18 Watch the repository: auto-rescan when .feature/.cs/.xml files change on disk (toggle in View menu)
- [x] D19 Windows taskbar tasks (jump list): New feature, Start a recording, Open repository
- [x] D20 Playwright Chromium check on start + Help → Install Playwright Browsers with progress

## Quality-of-life, round 2 (100)

### Window (12)
- [x] W1 Reopen the last page on launch instead of the Dashboard
- [x] W2 Remember the last page per repository
- [x] W3 View → Always on Top (persisted)
- [x] W4 View → Auto-hide Menu Bar (Alt shows it; persisted)
- [x] W5 Full screen state persisted across launches
- [x] W6 Zoom percentage shown in a toast when zoom changes
- [x] W7 Window → Reset Window Size
- [x] W8 Window → Center Window
- [x] W9 Zoom presets (90 / 100 / 110 / 125 / 150 %) in View → Zoom
- [x] W10 Flash the taskbar button when a test run finishes in the background
- [x] W11 Taskbar overlay badge while a Playwright recording is running
- [x] W12 Keep the PC awake while a test run or recording is in progress

### Tray (8)
- [x] T1 System tray icon
- [x] T2 Tray menu: Show/Hide, Open Repository, Recent, Start Recording, Quit
- [x] T3 Click the tray icon to show or hide the window
- [x] T4 Option: minimize to tray
- [x] T5 Option: close to tray (keep running in the background)
- [x] T6 Tray tooltip shows the repository and recording state
- [x] T7 One-time balloon explaining that the app is still running in the tray
- [x] T8 Tray "Rescan Repository"

### Repositories (12)
- [x] R1 Remove a single repository from Open Recent
- [x] R2 Pinned repositories (pin/unpin the current one) at the top of Open Recent
- [x] R3 Recent items show the folder name with the full path as a tooltip-like sublabel
- [x] R4 Reopen Last Closed Repository (Ctrl+Shift+T)
- [x] R5 Open Sample Repository (bundled fixtures)
- [x] R6 Warn before opening a folder with no .feature or .cs files
- [x] R7 Clear Recent asks for confirmation
- [x] R8 Open Repository in File Explorer
- [x] R9 Open Terminal in Repository
- [x] R10 Open Repository in VS Code (when `code` is on PATH)
- [x] R11 Copy Repository Path
- [x] R12 Rescan reports counts in a notification when the window is in the background

### Files & tools (10)
- [x] F1 Preferred external editor setting (system default, VS Code, Visual Studio, Rider, Notepad++)
- [x] F2 "Open in default editor" jumps to the line when the editor supports it (VS Code `-g`, Rider `--line`)
- [x] F3 Copy absolute path of the open source file
- [x] F4 Open Features folder
- [x] F5 Open Dictionaries folder
- [x] F6 Open Traces folder
- [x] F7 Open Latest Trace in the Playwright Trace Viewer
- [x] F8 Open studio settings file (settings.json)
- [x] F9 Open workspace file (workspace.json)
- [x] F10 Open the README / user guide

### Notifications & feedback (10)
- [x] N1 Notify when a recording stops in the background
- [x] N2 Notify when a background rescan (auto-rescan) changes feature/step counts
- [x] N3 Do Not Disturb toggle for desktop notifications
- [x] N4 Clicking a notification focuses the window and the relevant page
- [x] N5 Loading page shows startup stages (starting API, scanning repository)
- [x] N6 Loading page shows a hint after 8 s ("large repositories take longer")
- [x] N7 Startup failure page with Retry, Open Log and Quit (instead of quitting)
- [x] N8 Dialog with Reload when the page crashes (render-process-gone)
- [x] N9 Dialog with Wait / Reload when the page stops responding
- [x] N10 Banner-style notice when the in-process API stops answering health checks

### Keyboard & navigation (8)
- [x] K1 Optional global shortcut to show/hide the app (Ctrl+Alt+T; off by default)
- [x] K2 Ctrl+L copies a deep link to the current page
- [x] K3 Esc leaves full screen
- [x] K4 Go → Test Design tools submenu (all nine tools)
- [x] K5 Go → Previous Page (Ctrl+Alt+Left) mirrors browser back from anywhere
- [x] K6 Help → Keyboard Shortcuts lists desktop-only accelerators too
- [x] K7 Mouse back/forward buttons navigate pages
- [x] K8 Ctrl+Shift+N opens a second window on the same API

### Deep links (5)
- [x] L1 Register the `testauthoring://` protocol
- [x] L2 `testauthoring://open?path=C:\Repo` opens a repository
- [x] L3 `testauthoring://page/test-design` navigates to a page
- [x] L4 Deep links work when the app is closed (cold start) and when it is running
- [x] L5 Jump-list task: Test Design

### Settings & data (10)
- [x] S1 Launch at login toggle
- [x] S2 Hardware acceleration toggle (applies after restart)
- [x] S3 Spellcheck toggle
- [x] S4 File → Restart
- [x] S5 Reset desktop settings (window, zoom, recents, toggles) with confirmation
- [x] S6 Clear web storage and cache with confirmation
- [x] S7 Export settings (desktop + studio settings + workspace) to a JSON file
- [x] S8 Import settings from a JSON file
- [x] S9 Log file rotation (keep it under 5 MB)
- [x] S10 Settings menu items show their current state as checkboxes

### Context menu & editing (8)
- [x] E1 Native context menu for text fields: Cut / Copy / Paste / Select All
- [x] E2 Spelling suggestions in the context menu
- [x] E3 "Add to dictionary" in the context menu
- [x] E4 "Search the web for …" for selected text
- [x] E5 Copy link address on links
- [x] E6 Undo / Redo in the context menu of editable fields
- [x] E7 Inspect Element in the context menu (development builds)
- [x] E8 Paste as plain text (Ctrl+Shift+V)

### Studio commands from the menu (9)
- [x] C1 View → Theme submenu (every app theme)
- [x] C2 View → Accent submenu
- [x] C3 View → Density (Comfortable / Compact)
- [x] C4 Help → Index Diagnostics
- [x] C5 File → Run Tests…
- [x] C6 View → Text Size (A− / A / A+)
- [x] C7 View → Reduce Motion toggle
- [x] C8 View → High Contrast toggle
- [x] C9 Go → Test Generator draft ("Continue where you left off")

### Diagnostics & help (8)
- [x] H1 Help → System Information (OS, memory, CPU, data folder size)
- [x] H2 Help → Copy Diagnostics (versions, paths, ports) to the clipboard
- [x] H3 Help → Check API Health
- [x] H4 Help → Report an Issue (GitHub issue prefilled with versions)
- [x] H5 Help → Open Crash Reports folder (local crash reporter, never uploaded)
- [x] H6 First run: follow the OS light/dark theme
- [x] H7 First run: follow the OS high-contrast setting
- [x] H8 First run: pick the studio accent closest to the Windows accent colour

## Quality-of-life
- [x] Q1 Zoom in/out/reset (Ctrl +/−/0) persisted
- [x] Q2 "Open data folder" and "Open logs" in Help
- [x] Q3 Server log written to the user-data folder
- [x] Q4 Keyboard shortcut Ctrl+Shift+O for Open repository
- [x] Q5 Window title shows the current repository
- [x] Q6 Reload keeps the current page (hash routes)
- [x] Q7 Graceful shutdown (server closed, recorder stopped) on quit
- [x] Q8 About dialog with versions (app, Electron, Chromium, Node)
