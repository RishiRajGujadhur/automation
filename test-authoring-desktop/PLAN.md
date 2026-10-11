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
- [ ] D5 Native application menu (File / Edit / View / Go / Window / Help) with accelerators
- [ ] D6 Open repository… native folder picker → workspace scan; recent repositories menu + Windows jump list
- [ ] D7 Preload bridge `window.desktop` (contextIsolation, sandbox, typed IPC, sender validation)
- [ ] D8 Web-app integration: Browse… button for repository root, "Open in default editor", "Reveal in Explorer" in source view
- [ ] D9 External links open in the system browser; navigation locked to the app origin; permission requests denied
- [ ] D10 Native theme sync (title bar colour follows app theme; nativeTheme)
- [ ] D11 Native notifications when a scan or test run finishes while the window is unfocused; taskbar progress during work
- [ ] D12 Drag a repository folder onto the window to open it
- [ ] D13 App icon generated from the studio's `public/icon.svg`
- [ ] D14 Packaging with electron-builder (Windows NSIS installer + portable)
- [ ] D15 Automated tests: Playwright `_electron` smoke test (launch, API, navigation, desktop bridge)
- [ ] D16 README: build, run, package, architecture, limits

## Quality-of-life
- [ ] Q1 Zoom in/out/reset (Ctrl +/−/0) persisted
- [ ] Q2 "Open data folder" and "Open logs" in Help
- [x] Q3 Server log written to the user-data folder
- [ ] Q4 Keyboard shortcut Ctrl+Shift+O for Open repository
- [ ] Q5 Window title shows the current repository
- [ ] Q6 Reload keeps the current page (hash routes)
- [ ] Q7 Graceful shutdown (server closed, recorder stopped) on quit
- [ ] Q8 About dialog with versions (app, Electron, Chromium, Node)
