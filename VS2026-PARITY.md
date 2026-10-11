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
| S7 | Startup project / test project selection; active configuration dropdown in the toolbar | ⬜ | P2 |
| S8 | Add ▸ New Project / Existing Project, Remove project, Unload/Reload project | ⬜ | P3 |
| S9 | Edit project file (`.csproj`) with XML IntelliSense for common properties | 🟡 (XML editor) | P3 |
| S10 | Solution-wide search (Ctrl+Shift+F, Find in Files) with replace | ⬜ | P1 |
| S11 | Go to All (Ctrl+T): files, types, members, features, steps | 🟡 (Ctrl+K palette) | P1 |

## 2. Build
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| B1 | Build / Rebuild / Clean Solution and per project (Ctrl+Shift+B) | ⬜ | P1 |
| B2 | Output window (Build pane) and Error List (errors, warnings, messages; click to go to line; filter by project) | 🟡 (editor problems only) | P1 |
| B3 | NuGet: restore on open, Manage NuGet Packages (browse, installed, updates), package versions | ⬜ | P2 |
| B4 | Build on save / before run and debug | ⬜ | P2 |

## 3. Editor (C#)
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| E1 | Syntax colouring, Roslyn diagnostics as you type | ✅ | — |
| E2 | IntelliSense completion, quick info on hover | ✅ | — |
| E3 | Signature help (parameter info while typing `(`) | ⬜ | P1 |
| E4 | Go To Definition (F12, Ctrl+click), Find All References (Shift+F12) | ✅ | — |
| E5 | Peek Definition (Alt+F12), Go To Implementation (Ctrl+F12), Go to Base | ⬜ | P2 |
| E6 | Rename symbol across the solution (F2 / Ctrl+R,R) | ✅ | — |
| E7 | Remove and Sort Usings | ✅ | — |
| E8 | Quick Actions and Refactorings (Ctrl+.): add using, generate method, extract method, implement interface, fix code style | ⬜ | P1 |
| E9 | Format Document / Selection (Ctrl+K,D) with `.editorconfig` | ⬜ | P1 |
| E10 | CodeLens: reference counts, test status above methods | ⬜ | P2 |
| E11 | Inlay hints (parameter names, types) | ⬜ | P3 |
| E12 | Code folding, outlining, sticky scroll, bracket matching, multi-caret, column select | 🟡 (CodeMirror basics) | P2 |
| E13 | Navigation bar (project / type / member dropdowns) and breadcrumbs | ⬜ | P2 |
| E14 | Snippets (prop, ctor, for, test method, step definition) | ⬜ | P2 |
| E15 | Comment/uncomment, duplicate line, move line, go to line (Ctrl+G) | 🟡 | P2 |
| E16 | Split editor, tab groups, preview tab, pinned tabs, colour-coded tabs | 🟡 (pinned + colours) | P2 |

## 4. Gherkin / BDD (Reqnroll/SpecFlow extension parity)
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| G1 | Feature editor: colouring, binding checks, step completion, F12 to step definition | ✅ | — |
| G2 | Create step definition for unbound steps | ✅ | — |
| G3 | Find step usages (from a C# binding back to feature lines) | ⬜ | P1 |
| G4 | Rename step (update pattern and all feature usages) | ⬜ | P2 |
| G5 | Table formatting, Scenario Outline examples editing | 🟡 | P2 |

## 5. Testing
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| T1 | Test Explorer: discover tests per project (features/scenarios, NUnit/xUnit/MSTest), tree by project/namespace/class/trait | ⬜ | P1 |
| T2 | Run / Debug selected, Run all, Run failed, repeat last run; live pass/fail icons in Explorer and editor gutters | 🟡 (run dialog) | P1 |
| T3 | Test detail: output, stack trace with links, duration; playlists | ⬜ | P2 |
| T4 | Playwright traces from failed runs | 🟡 | P2 |
| T5 | Code coverage per run | ⬜ | P3 |

## 6. Debugging
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| D1 | Breakpoints in .feature and .cs, F5/F10/F11/Shift+F11, Locals, Watch, Call Stack, DataTips | ✅ | — |
| D2 | Conditional, hit-count and log-point breakpoints; enable/disable | ⬜ | P2 |
| D3 | Exception settings (break on thrown/unhandled), Exception helper | 🟡 | P2 |
| D4 | Autos, Immediate window, Run to Cursor, Set Next Statement | ⬜ | P2 |
| D5 | Debug from Test Explorer and from a scenario's gutter | 🟡 | P1 |

## 7. Source control (Git)
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| V1 | Git Changes: status, stage, commit, amend, discard; gutter change markers | ⬜ | P1 |
| V2 | Branches (create, switch, merge), pull/push/fetch, sync | ⬜ | P2 |
| V3 | History, blame, compare with previous | ⬜ | P2 |

## 8. Environment
| # | Feature | Status | Pri |
| --- | --- | --- | --- |
| W1 | Dockable tool windows (Explorer, Error List, Output, Test Explorer, Debug) with bottom panel tabs | 🟡 | P1 |
| W2 | Command palette / Feature Search (Ctrl+Q), customizable keyboard shortcuts | 🟡 | P2 |
| W3 | Themes, accents, density | ✅ | — |
| W4 | Auto save, hot exit, file conflict detection | ✅ | — |
| W5 | Open Folder (desktop native, web File System Access) | ✅ | — |
| W6 | Status bar: branch, errors/warnings, configuration, line/column, encoding | 🟡 | P2 |

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
