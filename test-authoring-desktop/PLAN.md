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

## Layout & presets (2026-10-11)
- [x] P1 VS Code layout (default) in the web app and desktop app: activity bar, slim title bar with command centre, explorer side bar, full-height editor, accent status bar; Classic tab layout kept in Settings → Appearance → Layout
- [x] P2 Algorithm presets: Essentials (default), BDD authoring, Combinatorial & logic, Model-based, Regression & CI, Minimal, Everything, Custom
- [x] P3 Individual algorithm switches only under Custom (Custom starts from the current preset); Turn on buttons switch to Custom
- [x] P4 Desktop View menu: Layout and Algorithm Preset submenus

- [x] Bug: installed app failed with "Cannot find package 'playwright'" — electron-builder dropped studio/node_modules from extra resources; now copied explicitly, and `npm run test:packaged` tests a copy outside the project
- [x] Bug: window title doubled the app name on the loading/failure page
- [x] Bug: SPRT called always-failing tests flaky; now "failing"

## Debugger (2026-10-11)
- [x] D1 Debug menu like Visual Studio (Start Debugging / Continue F5, Stop Shift+F5, Restart, Break All, Step Into F11, Step Over F10, Step Out Shift+F11, Toggle Breakpoint F9, Delete All Breakpoints, Windows)
- [x] D2 Rescan Repository moves from F5 to Ctrl+Alt+R and Full Screen from F11 to Shift+Alt+Enter (Visual Studio keys) so the debug keys reach the editor
- [x] D3 netcoredbg bundled in the installer (STUDIO_NETCOREDBG); packaged test debugs the Calculator sample

## Tabs and Open Folder (2026-10-11)
- [x] D4 File menu: Open Folder… (was Open Repository…), Save, Save All, Close Editor (Ctrl+W), Close All Editors; Window ▸ Close moves to Ctrl+Shift+W; tray says Open Folder…


## JetBrains Rider features (2026-10-18)
- [x] R1 Native Navigate, Code and Tools menus plus Rider items in Edit, View and Help (`src/main/riderMenu.ts`); each sends `rider` with the command id, the page handles the keys
- [x] R2 Ctrl+Shift+V is Paste from History (Paste as Plain Text keeps its Edit menu item without the key)
- [x] R3 Terminal runs PowerShell over pipes (no native pty), so the packaged app needs nothing extra; packaged test runs a command in it

## Desktop documentation review (2026-10-18)
- [x] Audit the Electron shell and shared authoring workflows; document 60 proposed improvements with priorities, source references and acceptance criteria in `../DESKTOP-QOL.md` (proposals only).
- [x] Refresh all 16 packaged-desktop screenshots, add Git Log to the root gallery, and add a screenshot gallery to the desktop README.
- [x] Rebuild the Windows distribution; both screenshot capture scenarios pass; inspect the captures and verify local documentation links.
- [x] Packaged verification outside the repository: 30 passed; 2 opt-in screenshot scenarios skipped in that run (both passed separately).

## Settings ▸ Features (2026-10-18)
- [x] F1 The desktop app starts with the Visual Studio essentials; the page sends the turned-off features' commands (`desktop:disabled-commands`) and the native menus leave them out

## Settings workbench (2026-10-19)
- [x] VS Code-style settings layout, full-width multi-keyword search, category navigation, User scope and workspace shortcut; Ctrl+F search and Escape clear-before-close.
- [x] Verification: four web settings tests, production build, 31 packaged desktop checks; fresh desktop settings screenshot. See `../DESKTOP-QOL.md`.

## DQ33 — watcher lifecycle (2026-10-19)
- [x] Cancel pending rescans and reject stale watcher callbacks on workspace replacement, disable, stop and errors.
- [x] Four unit regressions, desktop typecheck and packaged real-filesystem disable/re-enable test passed.

## DQ22 — desktop state recovery (2026-10-19)
- [x] Atomic preference writes with a last-known-good backup; malformed primary files recover without discarding the profile.
- [x] Regression covers failed replacement, invalid JSON and temporary-file cleanup; packaged launch restores zoom and auto-rescan from backup. Typechecks pass.

## DQ29 — bounded status polling (2026-10-19)
- [x] Serialize status cycles, abort requests after 10 seconds, cancel siblings on failure and suppress stale results after stop/restart.
- [x] Three unit regressions and a packaged outage/recovery test pass; no overlapping request pairs. Both typechecks pass.

## DQ27 — browser installation notifications (2026-10-19)
- [x] Route browser-install notifications through Do Not Disturb; persist the outcome and show it in Help → Playwright Browsers.
- [x] Three unit cases and packaged simulated-installer regression pass; desktop typecheck passes.

## DQ19 — validate settings imports (2026-10-19)
- [x] Validate all supplied desktop, studio and workspace fields and export version before changing settings; report field-specific errors.
- [x] Schema regression and packaged invalid-import test pass, including unchanged file contents and a still-running app; desktop typecheck passes.

## IDE features, third batch — Visual Studio 2026 / Rider (2026-10-20)

Tracked feature by feature in [IDE-FEATURES.md](../IDE-FEATURES.md) (one commit each, each with a Settings ▸ Features switch, a desktop native menu row where it is a command, and tests).

- [x] X1–X104 (text tools, Git Log actions, Gherkin tools and Code ▸ Gherkin submenu, view options, Explorer, Error List / Output, Test Explorer, Tags window, Code Metrics, C# file tools)
- [x] X105–X200 (Explorer compare / scope / filters, debugger watches, Git stage / undo / file history, Gherkin refactorings and table tools, Quick Info, scroll bar annotations, tab options, JSON / XML tools, Zoom IDE, What's New, feature settings export / import)
- [x] Fixes found on the way: long menus scroll; popups no longer select the row under a still pointer; menu commands keep the editor caret
- [x] Rebuild the desktop exe (`npm run dist`; the language server's `metrics` and `unnecessary` operations republish because its sources changed) and run `npm run test:packaged` (38 passed, 2 skipped)

## Quality of life, 100 improvements (2026-10-20)

Tracked one by one in [QOL-50.md](../QOL-50.md) (QL1–QL100; one commit and push each, each with a Settings ▸ Features switch and tests).

- [x] QL1–QL50 (window title, caret restore, Explorer keyboard / drag / Git badges, search memory, notifications history, status bar items, Test Explorer memory, Gherkin paste / table / indent helpers, Markdown helpers)
- [x] QL51–QL100 (Error List group / Copy All, build and test result messages, commit message history, changed-settings marks, Notifications filter / relative times / dismiss, Gherkin keyword capitalisation, `<>` and Examples header, Terminal clear / zoom / rename / copy-paste / Open in Terminal, Close Saved Tabs, Ctrl+1…9, Copy Full Path, Debugging title, status bar test results)
- [x] Fixes found on the way: Close to the Right now feeds Reopen Closed Tab; terminal listeners are removed on remount (no double zoom / paste)
- [x] Regression: 333 passed, 1 skipped, 1 intermittent (X106 passes on rerun); desktop `npm run dist` and `npm run test:packaged` (38 passed, 2 skipped)

## IDE features, fourth batch — Visual Studio 2026 / Rider (2026-10-20)

Tracked one by one in [IDE-FEATURES-4.md](../IDE-FEATURES-4.md) (Y1–Y100; one commit and push each, each with a Settings ▸ Features switch, a desktop native menu row where it is a command, unit and Playwright tests).

- [x] Y1–Y20 Edit ▸ Convert (URL / Base64 / HTML / C# / JSON / Unicode escapes, numbers, quotes, join / split, sort / number / trim lines), Align Assignments, XML reformat / minify
- [x] Y21–Y30 and Y75–Y85 C# (file- / block-scoped namespace, raw strings, interpolation, regions, equality / ToString / null checks, expression / block bodies, [Binding]) and Markdown tools
- [x] Y31–Y50, Y69–Y73, Y86–Y87, Y97 Gherkin (tags, tables, Expand Outline, Rule, doc strings, data tables, duplicate warnings, unbound steps, rename / split scenario)
- [x] Tabs, status bar (memory, file problems), Git commit helpers, Test Explorer (Copy Name, CSV export, slowest tests, continuous testing), debugger (Copy Locals, Delete Disabled Breakpoints), tools (JWT, SHA-256, cURL, test data, file statistics, character info)

## Advanced, C# project and debugging features (2026-10-20)

Tracked one by one (one commit and push each, each with a Settings ▸ Features switch, unit and Playwright tests):

- [x] [ADVANCED-20.md](../ADVANCED-20.md) Z1–Z20: inline Git blame, merge conflict actions, Stage Selected Lines, C# postfix templates, outline preview, test history, Run Repeatedly, reformat on save, inline debug values, unused step definitions, same-definition highlights, temporary breakpoints, Go to All calculator, step parameter hints, Import CSV, living documentation, test environment variables, Code Vision authors, step hover docs, Run Impacted Tests
- [x] [CSHARP-20.md](../CSHARP-20.md) C1–C20: Project Properties (Application, Build, Package, Code Analysis, Build Events, Global Usings, Project References, Debug launch profiles; effective values from `dotnet msbuild -getProperty`; per configuration), Upgrade Target Framework, Build Action / Copy to Output, Exclude From Project, Suppress in Project File, User Secrets, EditorConfig designer, Tidy Project File, .csproj value completions, Directory.Build.props, project dependency graph — every project-file write is a previewed, approved diff
- [x] [DEBUG-20.md](../DEBUG-20.md) DB1–DB20: Breakpoints window search / labels / hit counts, disable once hit, dependent breakpoints, when-changed conditions, Force Run to Cursor, Step Out to Here, function breakpoints, Just My Code, edit values, Locals search, Text / JSON / XML and table visualizers, Threads window, pinned DataTips, Debug Output tools, exception type filter, Debug Last Test Run, tracepoint macros — verified in real netcoredbg sessions
- [x] Regression: 357 passed, 1 skipped; 10 failed on the first run: 5 were intermittent (passed on rerun), and the 5 real ones were fixed. Those were the light theme's contrast for the inline blame (themed muted text), caret helpers counting widget text, the Add Scenario locator and a race in the Slowest tests check. Desktop `npm run dist` and `npm run test:packaged` (38 passed, 2 skipped)

## Rider features for C# developers (2026-10-20)

Tracked in [RIDER-CS-15.md](../RIDER-CS-15.md) (RC1–RC15, one commit and push each):

- [x] Refactorings on Rider's keys over the language server's existing Roslyn providers (no second implementation): Refactor This (Ctrl+Alt+Shift+T), Extract Method (Ctrl+Alt+M), Introduce Variable (Ctrl+Alt+V), Inline (Ctrl+Alt+N), Introduce Parameter (Ctrl+Alt+P; nested Quick Actions now keep their parent's title), Generate (Ctrl+Alt+G), Move Type to Matching File
- [x] Added: Extract Interface, Create Unit Tests (NUnit / xUnit / MSTest), exit-point highlighting, Configure Severity (.editorconfig), Find NuGet Package for a missing type, Search with Pattern (structural search and replace), Code Cleanup in Solution, inheritance gutter (new language-server operation); all file writes are previewed diffs
- [x] Desktop `npm run dist` (language server republished) and `npm run test:packaged` (38 passed, 2 skipped)
