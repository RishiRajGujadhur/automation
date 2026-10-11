# Visual Studio 2026 parity — feature list

Goal: open and scan a **.sln / .slnx solution** (not just a folder) in both the web and desktop app, and grow the
studio toward the Visual Studio 2026 experience for C# test solutions (SpecFlow/Reqnroll, NUnit/xUnit/MSTest, Playwright).

Status: ✅ done · 🟡 partial · ⬜ to do. Priority: **P1** next, **P2** after, **P3** later.

## 1. Solutions and projects (the new feature)
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| S1 | File ▸ Open ▸ Project/Solution… (`.sln`, `.slnx`, `.csproj`) on desktop (native dialog, Ctrl+Shift+O; also double-click / command line) and web (path dialog with solutions found in the repo + recent) | ✅ | P1 |
| S2 | Parse `.sln` and `.slnx`: projects, solution folders, configurations (Debug/Release), platforms | ✅ | P1 |
| S3 | Scan the whole solution: every project indexed (features, steps, selectors) with per-project index and a combined view | 🟡 (solution folder scanned as one index; projects outside it not yet) | P1 |
| S4 | Solution Explorer shows the real solution: solution folders → projects → Dependencies (Packages, Projects, Frameworks, Analyzers) → files | ✅ (files relative to each project; Miscellaneous Files; browser folders too) | P1 |
| S5 | Project references between projects; language service loads one Roslyn project per `.csproj` with correct references | ✅ (own NuGet packages + project references; Miscellaneous Files project for the rest) | P1 |
| S6 | Recent solutions list + Start Window (Open recent, Clone repository, Open folder, Open solution) | 🟡 (recent solutions and folders; no Start Window yet) | P2 |
| S7 | Startup project / test project selection; active configuration dropdown in the toolbar | 🟡 (configuration box in the build windows) | P2 |
| S8 | Add ▸ New Project / Existing Project, Remove project, Unload/Reload project | ⬜ | P3 |
| S9 | Edit project file (`.csproj`) with XML IntelliSense for common properties | 🟡 (XML editor) | P3 |
| S10 | Solution-wide search (Ctrl+Shift+F, Find in Files) with replace | ✅ (match case, whole word, regex, include/exclude globs, Replace All / per file) | P1 |
| S11 | Go to All (Ctrl+T): files, types, members, features, steps | ✅ (Ctrl+T desktop / Ctrl+P web; CamelHumps via Roslyn; steps still in the Ctrl+K palette) | P1 |

## 2. Build
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| B1 | Build / Rebuild / Clean Solution and per project (Ctrl+Shift+B) | ✅ (solution; per-project via API, no project context menu yet) | P1 |
| B2 | Output window (Build pane) and Error List (errors, warnings, messages; click to go to line; filter by project) | ✅ (filters, search, double-click to line; no messages level yet) | P1 |
| B3 | NuGet: restore on open, Manage NuGet Packages (browse, installed, updates), package versions | ⬜ | P2 |
| B4 | Build on save / before run and debug | ⬜ | P2 |

## 3. Editor (C#)
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| E1 | Syntax colouring, Roslyn diagnostics as you type | ✅ | — |
| E2 | IntelliSense completion, quick info on hover | ✅ | — |
| E3 | Signature help (parameter info while typing `(`) | ✅ (overloads Alt+↑/↓, Ctrl+Shift+Space) | P1 |
| E4 | Go To Definition (F12, Ctrl+click), Find All References (Shift+F12) | ✅ | — |
| E5 | Peek Definition (Alt+F12), Go To Implementation (Ctrl+F12), Go to Base | ✅ | P2 |
| E6 | Rename symbol across the solution (F2 / Ctrl+R,R) | ✅ | — |
| E7 | Remove and Sort Usings | ✅ | — |
| E8 | Quick Actions and Refactorings (Ctrl+.): add using, generate method, extract method, implement interface, fix code style | ✅ (Roslyn's code fixes for compiler diagnostics + refactorings; no analyzer (IDE*) style fixes yet, no lightbulb icon) | P1 |
| E9 | Format Document / Selection (Ctrl+K,D) with `.editorconfig` | ✅ (Shift+Alt+F or Ctrl+K, Ctrl+D; keeps line endings) | P1 |
| E10 | CodeLens: reference counts, test status above methods | 🟡 (step-usage lens on step definitions) | P2 |
| E11 | Inlay hints (parameter names, types) | ⬜ | P3 |
| E12 | Code folding, outlining, sticky scroll, bracket matching, multi-caret, column select | 🟡 (CodeMirror basics) | P2 |
| E13 | Navigation bar (project / type / member dropdowns) and breadcrumbs | ✅ | P2 |
| E14 | Snippets (prop, ctor, for, test method, step definition) | ✅ (shortcut + Tab, or from IntelliSense; Tab between fields) | P2 |
| E15 | Comment/uncomment, duplicate line, move line, go to line (Ctrl+G) | 🟡 | P2 |
| E16 | Split editor, tab groups, preview tab, pinned tabs, colour-coded tabs | 🟡 (pinned + colours) | P2 |

## 4. Gherkin / BDD (Reqnroll/SpecFlow extension parity)
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| G1 | Feature editor: colouring, binding checks, step completion, F12 to step definition | ✅ | — |
| G2 | Create step definition for unbound steps | ✅ | — |
| G3 | Find step usages (from a C# binding back to feature lines) | ✅ (CodeLens above each binding + Find Step Usages) | P1 |
| G4 | Rename step (update pattern and all feature usages) | ⬜ | P2 |
| G5 | Table formatting, Scenario Outline examples editing | 🟡 | P2 |

## 5. Testing
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| T1 | Test Explorer: discover tests per project (features/scenarios, NUnit/xUnit/MSTest), tree by project/namespace/class/trait | ✅ (project → class / feature → test; no trait grouping yet) | P1 |
| T2 | Run / Debug selected, Run all, Run failed, repeat last run; live pass/fail icons in Explorer and editor gutters | ✅ (Test Explorer + editor margin glyphs) | P1 |
| T3 | Test detail: output, stack trace with links, duration; playlists | 🟡 (details with message, stack links, durations; no playlists) | P2 |
| T4 | Playwright traces from failed runs | 🟡 | P2 |
| T5 | Code coverage per run | ⬜ | P3 |

## 6. Debugging
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| D1 | Breakpoints in .feature and .cs, F5/F10/F11/Shift+F11, Locals, Watch, Call Stack, DataTips | ✅ | — |
| D2 | Conditional, hit-count and log-point breakpoints; enable/disable | ✅ (right-click a breakpoint for its settings; Enable/Disable All) | P2 |
| D3 | Exception settings (break on thrown/unhandled), Exception helper | ✅ (Break on: unhandled / all thrown / never; exception type and message shown when stopped) | P2 |
| D4 | Autos, Immediate window, Run to Cursor, Set Next Statement | 🟡 (Autos, Immediate, Run to Cursor Ctrl+F10; Set Next Statement not supported by netcoredbg) | P2 |
| D5 | Debug from Test Explorer and from a scenario's gutter | ✅ (Shift+click a margin glyph) | P1 |

## 7. Source control (Git)
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| V1 | Git Changes: status, stage, commit, amend, discard; gutter change markers | ✅ | P1 |
| V2 | Branches (create, switch, merge), pull/push/fetch, sync | 🟡 (create, switch incl. remote branches, fetch / pull --ff-only / push with publish; no merge yet) | P2 |
| V3 | History, blame, compare with previous | 🟡 (recent history list) | P2 |

## 8. Environment
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| W1 | Dockable tool windows (Explorer, Error List, Output, Test Explorer, Debug) with bottom panel tabs | 🟡 | P1 |
| W2 | Command palette / Feature Search (Ctrl+Q), customizable keyboard shortcuts | 🟡 | P2 |
| W3 | Themes, accents, density | ✅ | — |
| W4 | Auto save, hot exit, file conflict detection | ✅ | — |
| W5 | Open Folder (desktop native, web File System Access) | ✅ | — |
| W6 | Status bar: branch, errors/warnings, configuration, line/column, encoding | ✅ (configuration lives in the build windows) | P2 |

## Proposed first slice (P1, solution support)
1. S1–S4: open `.sln`/`.slnx`/`.csproj`, parse it, scan every project, real Solution Explorer tree.
2. S5: language service with one Roslyn project per `.csproj` + project references.
3. B1–B2: Build Solution with Output and Error List.
4. T1–T2: Test Explorer with run/debug.
5. E3, E8, E9: signature help, Quick Actions (Ctrl+.), Format Document.
6. S10–S11: Find in Files and Go to All.

## Progress log
- 2026-10-11 — **Open and scan a solution (S1, S2, S4; S3 partial).** `server/solution.ts` + `src/solutionFormat.ts` parse `.sln`/`.slnx`; `/api/solution/open`, `/api/solution/find`; workspace config gains `solution`; Explorer renders solution folders, multiple projects with their own Dependencies (frameworks, packages with versions, project references) and files. Desktop: File ▸ Open Project/Solution… (Ctrl+Shift+O; Open Folder moves to Ctrl+Shift+Alt+O), `.sln` on the command line. Also fixed: a delayed rescan could overwrite the index after switching workspaces.
- 2026-10-11 — **Per-project language service (S5).** `langserver` builds a Roslyn solution with one project per `.csproj`: its own packages (and their dependencies), framework assemblies, built output, and `ProjectReference`s; files outside projects go to a Miscellaneous Files project. Go to definition, completion and rename now follow project boundaries (`tests/langserver.test.ts`).
- 2026-10-11 — **Build (B1, B2).** `server/build.ts` runs `dotnet build|clean` (rebuild = `--no-incremental`) for the open solution / project, streams Output and parses diagnostics into an Error List (`/api/build`, `/api/build/events`); Build menu (web title bar and desktop), Ctrl+Shift+B, Ctrl+Break to cancel, configuration box. Also fixed: go-to-line in a newly opened tab landed on line 1.
- 2026-10-11 — **Test Explorer (T1, T2; T3 and D5 partial).** Roslyn discovers NUnit/xUnit/MSTest methods per project (`op: tests`); scenarios come from the index (class/method from the generated code-behind). `server/testRunner.ts` runs `dotnet test --logger trx` and parses TRX (outcome, duration, message, stack). Side bar Test Explorer (activity bar, Test menu): Run All, Run selected, Run Failed, Debug, filter, details with stack links. Calculator sample gains NUnit tests.
- 2026-10-11 — **Signature help, Quick Actions, Format (E3, E8, E9).** Language service: `signature` (overloads + active parameter from the invocation), `actions`/`applyAction` (Roslyn's exported CodeFixProviders and CodeRefactoringProviders, loaded by reflection; multi-file changes written by the server), `format` (Formatter with `.editorconfig` analyzer-config documents, original line endings kept). Editor: parameter-info tooltip, Ctrl+. popup, Shift+Alt+F.
- 2026-10-11 — **Find in Files and Go to All (S10, S11).** `server/search.ts` (find / replace with case, whole word, regex, globs; skips build output), `/api/search/text|replace`; language service `symbols` (Roslyn pattern search). Search side-bar view (Ctrl+Shift+F, Ctrl+Shift+H) and Go to All dialog (Ctrl+T, Ctrl+P in browsers) with Files / Types / Members / Features filters; Edit menus in both apps. Feature editor full screen moves to Shift+Alt+Enter.

**Slice 1 (P1) complete:** S1–S5, B1–B2, T1–T2, E3/E8/E9, S10–S11. Next candidates: W1 dockable tool windows, D5 gutter debug/run icons, G3 step usages, V1 Git Changes.
- 2026-10-11 — **Step usages (G3).** `/api/steps/lenses` maps each binding in a C# file to the feature steps that bind to it; the C# editor shows a CodeLens line above every [Given]/[When]/[Then] ("2 step usages · 2 scenarios") that lists them in the references panel; context menu Find Step Usages.
- 2026-10-12 — **Run glyphs in the editor margin (T2, D5).** Feature editor: ▶ beside every scenario and the Feature line; C# editor: beside every test method; the glyph shows the last outcome (✓ / ✕ / running), click runs, Shift+click debugs. Fixed: files of a project whose .csproj is at the repository root were hidden in the Explorer when unclassified; test results of a previous repository were kept after opening another.
- 2026-10-12 — **Git Changes (V1).** `server/git.ts` (status relative to the workspace folder inside a larger repo, stage/unstage, discard to HEAD or delete untracked, commit / Commit All / amend, HEAD text, history); Git Changes side-bar view with branch and ahead/behind, Commit Staged / Commit All (Ctrl+Enter), per-file and bulk stage / unstage / discard (confirmed), history. Tests: the global teardown now always points the dev server back at fixtures/.
- 2026-10-12 — **Change bars (V1 complete).** Feature and C# editors show added / modified / deleted lines against the last commit (`/api/git/head`, `diffLines`), refreshed after commits, discards and window focus; line-ending differences ignored.
- 2026-10-12 — **Branches and sync (V2 partial).** Branch picker in Git Changes (local and remote branches, New Branch…), Fetch, Pull (fast-forward only) and Push (publishes a new branch with its upstream), ahead / behind counts; tested against a local bare remote.
- 2026-10-12 — **Peek / Implementation / Base (E5).** Language service `implementations` (interface members, overrides, derived classes) and `base`; C# editor: Alt+F12 peek window (read-only, highlighted, Open), Ctrl+F12, Go To Base; several results go to the references list.
- 2026-10-12 — **Breakpoint settings (D2).** Conditions go to netcoredbg; hit counts (`5`, `>= 5`, `% 5`) and tracepoints (log message with `{expressions}`, continues) are handled by the server on stop; enabled flag, Enable/Disable All; margin markers per kind (conditional +, tracepoint diamond, disabled hollow); right-click a breakpoint for Breakpoint Settings. Fixed: parameterized-test filters contained `(`, which vstest/NUnit reject.
- 2026-10-12 — **Autos, Immediate, Run to Cursor (D4).** Autos evaluates the variables of the current and previous line; Immediate window evaluates expressions in the paused frame (history with ↑/↓); Run to Cursor (Ctrl+F10) sets a one-shot breakpoint removed at the next stop. Fixed: Ctrl+F10 also stepped over.
- 2026-10-12 — **Exception Settings (D3).** Debug windows toolbar: Break on Unhandled / All thrown / Never (netcoredbg `user-unhandled` / `all` filters), applied to the live session and remembered.
- 2026-10-12 — **Status bar (W6).** Ln/Col (and selection length), line endings and encoding of the focused editor; errors / warnings of the last build (opens the Error List); Git branch with pending-changes mark and ahead / behind (opens Git Changes).
- 2026-10-12 — **Code snippets (E14).** prop, propfull, ctor (class name filled in), for, foreach, if, else, while, try, tryf, using, switch, cw, class, interface, test, testa, fact, given / when / then step definitions; shortcut + Tab or from IntelliSense. Fixed: the editors (and the Test Generator's) passed new `basicSetup` / `onUpdate` objects each render, so @uiw/react-codemirror reconfigured them on every keystroke (dropping snippet fields).
- 2026-10-12 — **Navigation bar (E13).** Language service `outline` (types and members with ranges, from syntax); a 22px breadcrumb above the C# editor shows project › type › member at the cursor, and the type / member parts list the file's types and the type's members to jump to.
