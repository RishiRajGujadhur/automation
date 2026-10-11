# TestAuthoring Studio — orientation for contributors (and Claude)

A local, VS Code–style IDE for **SpecFlow/Reqnroll + Playwright (C#)** test repositories. It indexes a .NET test repo
with Roslyn and lets people write Gherkin features that reuse existing step definitions, record browser flows, edit C#,
debug feature files, and apply test-design algorithms. Everything runs locally; nothing is uploaded.

Repo: `github.com/RishiRajGujadhur/automation` (branch `main`). Two apps that must stay at **feature parity**:

| Folder | What |
| --- | --- |
| `test-authoring-studio/` | The product: React 19 client (Vite) + Express API (Node, `tsx`) + .NET helpers |
| `test-authoring-desktop/` | Electron 44 shell that runs the studio's API in-process and ships a Windows exe |
| `.tools/` (gitignored) | Local .NET 10 SDK (`.tools/dotnet/dotnet.exe`) and netcoredbg. The system has no SDK, only a runtime |

## Standing conventions (from the owner)
- Commit and push after each feature (commit messages end with the Co-Authored-By line used in history).
- Track work in `test-authoring-studio/PLAN.md` and `test-authoring-desktop/PLAN.md` (checklists, dated sections).
- Keep web and desktop at parity; rebuild the desktop exe (`npm run dist`) and run `npm run test:packaged`.
- Layout like VS Code: no wasted space, minimal text, editors fill the window. Default layout `vscode`, alt `classic`.
- Algorithm presets: Essentials default; Custom enables per-algorithm toggles.
- Fix bugs you find on the way; verify with Playwright, never ask the user to check.
- Writes that generate code/features go through a **diff preview + approval** (`/api/*/preview` → `/api/generation/apply`). Direct saves (`/api/file/save`) require a `baseHash` and return 409 if the file changed on disk.

## Studio architecture (`test-authoring-studio/`)

### Server (`server/`)
- `index.ts` — Express API (port 4310 by default, `STUDIO_API_PORT`; refuses to start if the port is taken). Host/Origin allow-list. Key endpoint groups:
  - workspace/index: `/api/workspace`, `/api/scan`, `/api/solution`, `/api/source`, `/api/feature/links`
  - files: `/api/file/save|preview|rename|copy|delete`, `/api/generation/preview|apply`
  - steps: `/api/steps/*` (match, search, scaffold → `stepScaffold.ts`)
  - C#: `/api/csharp/diagnostics` (scanner), `/api/csharp/complete|hover|definition|references|rename|organize` (language service)
  - recorder: `/api/recording/*` (`recorder.ts`, Playwright)
  - debugger: `/api/debug/*` + SSE `/api/debug/events` (`debugger.ts`, `dap.ts`)
- `core.ts` — config schema, Gherkin parsing, index assembly, `confined()` path guard (always use it for repo paths), `dotnet`/`scanner` resolution.
- `debugger.ts` / `dap.ts` — Visual Studio–style debugging: builds the owning `.csproj`, runs `dotnet test` with `VSTEST_HOST_DEBUG=1`, attaches **netcoredbg** over DAP. SpecFlow code-behind `#line` directives make `.feature` lines real breakpoints.
- `langService.ts` — long-running Roslyn language server process (JSON lines). Dev runs a shadow copy of the DLL from `%TEMP%/tas-langserver` so rebuilds don't hit locked files.
- `solution.ts` (+ pure parsers in `src/solutionFormat.ts`, shared with browser folders) — `.sln`/`.slnx` parsing, per-project dependencies, `findSolutions`; config field `solution` (repo-relative, '' = folder mode). Use `rescanSoon()` for delayed re-indexing (drops results if the workspace changed).
- Others: `dictionaries.ts` (XML selector dictionaries), `projectModel.ts`, `proposals.ts`, `validation.ts`, `stepSearch.ts` + `search-worker.mjs`, `settings.ts`, `cli.ts`.

### .NET helpers
- `scanner/` — Roslyn static scanner (references the SDK's Roslyn DLLs). Modes: default scan, `--match`, `--diagnostics` (syntax + TAS001–003 binding checks). Build: `npm run scanner:build`.
- `langserver/` — Roslyn **Workspaces + Features 5.9** (NuGet): CompletionService (IntelliSense), QuickInfo, FindSymbol/References, `Renamer` (rename across files), organize usings (removes CS8019 only when names resolve). Loads framework refs + NuGet packages (and their `.nuspec` dependencies) from `~/.nuget/packages`. Build: `npm run langserver:build`.
- `samples/Calculator/` — small runnable SpecFlow+NUnit project (net10.0) used by debugger tests. `fixtures/` is a scan-only sample repo (not buildable) used by most tests — **don't leave it modified** (`git checkout -- test-authoring-studio/fixtures`).

### Client (`src/`)
- `App.tsx` — the shell (large): pages (Dashboard, Test Generator, Features editor/builder/recorder, Dictionary Inspector, Test Design, catalogues), modals, keyboard shortcuts, desktop menu commands (`menuRef`), debugger wiring, file ops.
- `files/` — editor tabs (`tabs.ts` store: open/close/pin/move, per-folder in localStorage; `EditorTabs.tsx` strip with overflow arrows and an `EditorActions` portal for editor toolbars), `provider.ts` (server vs browser folder), `fsa.ts` (File System Access API: Open Folder in the browser, read/write in place), `browserSolution.ts`, `fileTypes.ts` (icon + colour per extension), `editor-area.scss` (full-window flex layout).
- `editor/` — CodeMirror 6: `GherkinEditor.tsx` + `gherkin.ts` (lint, bindings, F12, step completion), `CodeEditor.tsx` (C#/XML/any file; Roslyn diagnostics; context menu), `csharp.ts` (IntelliSense, hover, F12/Ctrl+click, Shift+F12, F2), `breakpoints.ts` (F9 gutter, exec line, DataTips), `autosave.ts` (Off/After delay/On focus change; hot-exit drafts `tas:unsaved:<file>`), `events.ts`.
- `debug/` — `store.ts` (breakpoints, watches, SSE state), `DebugPanel.tsx` (Locals, Watch, Call Stack, Breakpoints, Output; F5/F10/F11/Shift+F11).
- `SolutionExplorer.tsx` — Visual Studio–style Explorer (solution → project → dependencies → folders; nesting; Cut/Copy/Paste/Rename/Delete).
- `TestGenerator.tsx`, `GeneratorRecorder.tsx`, `RecordingDictionary.tsx`, `CreateStepDialog.tsx`, `StepLint.tsx`, `TestDesign.tsx` + `algorithms/`, `radix.tsx`/`radix2.tsx` (UI kit, `Prefs`), `ui.tsx` (`RowMenu`, `useLocalState`).

## Desktop (`test-authoring-desktop/`)
- `src/main/` — `main.ts` (window), `server.ts` (imports the bundled API; sets `STUDIO_ROOT`, `STUDIO_DATA`, `STUDIO_SCANNER_EXE`, `STUDIO_LANGSERVER_EXE`, `STUDIO_NETCOREDBG`, `DOTNET_PATH`; port 47310), `menu.ts` (native menus incl. Debug and File; page-handled keys use `registerAccelerator: false`), `tray.ts`, `workspace.ts`, etc. `src/preload` + `src/shared/bridge.ts` define `window.desktop` (keep `DesktopMenuCommand` in sync with `test-authoring-studio/src/desktop.ts`).
- `scripts/build.mjs` copies the studio build into `studio/` and publishes self-contained scanner + langserver (cached in `.cache/`, `--scanner` forces) and downloads netcoredbg. electron-builder → `release/*.exe` (NSIS + portable).

## Commands
```bash
# studio (from test-authoring-studio/)
npm run dev                 # API + Vite (web on 5173)
npx tsc --noEmit            # typecheck
npm test                    # vitest unit tests
npx playwright test         # e2e (reuses a running dev server)
npm run scanner:build && npm run langserver:build && npm run debugger:setup
# desktop (from test-authoring-desktop/)
npm run dist && npm run test:packaged
```
`.claude/launch.json` has preview configs `studio` and `studio-alt-api` (API on 4320, used when the installed desktop app holds 4310).

## Testing notes and gotchas
- Playwright default storageState: `{mode:'advanced', layout:'classic', algorithmPreset:'everything', autoSave:'off'}`; VS Code-layout specs use a clean state. Use `exact: true` for file-name buttons (tab and explorer share names).
- Specs that switch the workspace must restore it in `finally`; a timed-out one leaves the dev server on a temp folder and cascades failures — reset with `POST /api/workspace {repositoryRoot: ".../fixtures", targetProject: "."}`.
- Feature tracking for Visual Studio parity lives in `VS2026-PARITY.md` (update its status and progress log with each feature).
- Shell: Windows; prefer Write/Edit or a Python script file over inline heredocs with backslashes/quotes.
- Vite ignores `fixtures/` and `test-results/` (auto save writes there).
