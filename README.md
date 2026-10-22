# TestAuthoring Studio

A local IDE for **SpecFlow / Reqnroll + Playwright (C#)** test repositories, as a Windows desktop app
(`test-authoring-desktop/`) and a web app (`test-authoring-studio/`) at feature parity. Everything runs on your
machine; nothing is uploaded.

## Key features

| Area | Highlights |
| --- | --- |
| **Test authoring** | Edit Gherkin features, scenarios, backgrounds and tables; browse the solution structure; navigate between bindings and C#; discover tests and review run results in Test Explorer. |
| **C# editing** | Code completion and navigation, CodeLens, inlay hints, quick fixes, code generation and conversions, plus structural refactorings such as Extract Method, Introduce Variable and Change Signature. Cross-file changes are previewed before they are applied. |
| **Analysis and search** | Roslyn diagnostics; duplicate-code, dependency and layer analysis; control/data flow; public API compatibility checks; semantic symbol search; structural Search with Pattern and decompiled framework sources. |
| **Testing and debugging** | Run and debug scenarios, stop on feature-file breakpoints, inspect values with text/JSON/XML/table visualizers, and review line and branch coverage. |
| **Browser tools** | Record Playwright interactions, inspect pages with Spy, and use the built-in HTTP client to exercise endpoints. |
| **Test design and reuse** | Apply test-design algorithms, search existing step bindings and selector dictionaries, and review generated feature and C# changes before writing them to the target repository. |
| **Git and projects** | Review history and diffs, use interactive rebase and three-way merge, and inspect effective `.csproj` properties with an approval diff before writing changes. |
| **Workbench** | Resizable panels, editor groups, file structure and call hierarchy, terminal, problems, Run Anything, Markdown preview, productivity guide, customizable settings, minimap, and layout controls. The web app starts with essential toolbar buttons and offers 70 individual visibility switches in Settings. |
| **Front-end languages** | JavaScript and TypeScript refactorings and imports; React actions and Hooks checks; HTML validation and accessibility checks; CSS, SCSS, LESS and CSS Modules support. See [FRONTEND-100.md](FRONTEND-100.md). |
| **Windows desktop integration** | Native menus and folder selection, recent repositories, remembered window placement and zoom, taskbar progress, and background test-run notifications. |

The desktop and web apps share the core authoring features. Optional capabilities can be managed in **Settings > Features**. Detailed inventories and progress: [RIDER-VSCODE-FEATURES.md](RIDER-VSCODE-FEATURES.md), [FRONTEND-100.md](FRONTEND-100.md), [VSCODE-20.md](VSCODE-20.md), [ADVANCED-20.md](ADVANCED-20.md), [CSHARP-20.md](CSHARP-20.md), [DEBUG-20.md](DEBUG-20.md), [REQNROLL.md](REQNROLL.md), [SPY.md](SPY.md) and [GUI-QOL.md](GUI-QOL.md).

In the web app, **Settings > General > Show Guide Me button** controls the tour button; it is hidden initially. **Settings > Workbench > Buttons** controls individual buttons in the activity bar, title bar, Explorer, editor, test, build and debug tools, and status bar. This keeps the VS Code style shell compact while retaining Visual Studio and Rider tools when needed.

## Screenshots

### Web workbench

Advanced mode with the essential button profile, using the sample repository:

![Web workbench with essential buttons](docs/screenshots/web-workbench-essential.png)

The gallery below contains running-app captures of the Windows desktop build using a temporary Calculator sample repository. It covers authoring, debugging, Git, and the workbench tools.

### Authoring, editing and navigation

| Feature editor | C# editor | C# refactoring |
| --- | --- | --- |
| <img src="docs/screenshots/feature-editor.png" alt="Feature editor" width="320"> | <img src="docs/screenshots/csharp-editor.png" alt="C# editor" width="320"> | <img src="docs/screenshots/csharp-refactoring.png" alt="C# refactoring" width="320"> |

| Change Signature | Semantic search | Decompiled source |
| --- | --- | --- |
| <img src="docs/screenshots/change-signature.png" alt="Change Signature" width="320"> | <img src="docs/screenshots/semantic-search.png" alt="Semantic search" width="320"> | <img src="docs/screenshots/decompiled-source.png" alt="Decompiled source" width="320"> |

| File structure | Call hierarchy | Search with Pattern |
| --- | --- | --- |
| <img src="docs/screenshots/file-structure.png" alt="File structure" width="320"> | <img src="docs/screenshots/call-hierarchy.png" alt="Call hierarchy" width="320"> | <img src="docs/screenshots/search-pattern.png" alt="Search with Pattern" width="320"> |

### Test runs, debugging and browser tools

| Test Explorer | Debugger | Debugger visualizer |
| --- | --- | --- |
| <img src="docs/screenshots/test-explorer.png" alt="Test Explorer" width="320"> | <img src="docs/screenshots/debugger.png" alt="Debugger" width="320"> | <img src="docs/screenshots/debugger-visualizer.png" alt="Debugger visualizer" width="320"> |

| Branch coverage | Playwright recorder | Spy |
| --- | --- | --- |
| <img src="docs/screenshots/branch-coverage.png" alt="Branch coverage" width="320"> | <img src="docs/screenshots/recorder.png" alt="Recorder" width="320"> | <img src="docs/screenshots/spy.png" alt="Spy" width="320"> |

### Git, projects and workbench

| Workbench | Git Log | Interactive rebase |
| --- | --- | --- |
| <img src="docs/screenshots/workbench.png" alt="Workbench" width="320"> | <img src="docs/screenshots/git-log.png" alt="Git Log" width="320"> | <img src="docs/screenshots/interactive-rebase.png" alt="Interactive rebase" width="320"> |

| Three-way merge | Project Properties | Settings editor |
| --- | --- | --- |
| <img src="docs/screenshots/merge-editor.png" alt="Merge editor" width="320"> | <img src="docs/screenshots/project-properties.png" alt="Project Properties" width="320"> | <img src="docs/screenshots/settings-editor.png" alt="Settings editor" width="320"> |

### More tools

| Start window | Productivity guide | Run Anything |
| --- | --- | --- |
| <img src="docs/screenshots/start-window.png" alt="Start window" width="320"> | <img src="docs/screenshots/productivity-guide.png" alt="Productivity guide" width="320"> | <img src="docs/screenshots/run-anything.png" alt="Run Anything" width="320"> |

| Terminal | Problems | HTTP client |
| --- | --- | --- |
| <img src="docs/screenshots/terminal.png" alt="Terminal" width="320"> | <img src="docs/screenshots/problems.png" alt="Problems" width="320"> | <img src="docs/screenshots/http-client.png" alt="HTTP client" width="320"> |

| Markdown preview | Public API | Desktop settings |
| --- | --- | --- |
| <img src="docs/screenshots/markdown-preview.png" alt="Markdown preview" width="320"> | <img src="docs/screenshots/public-api.png" alt="Public API" width="320"> | <img src="docs/screenshots/desktop-settings.png" alt="Desktop settings" width="320"> |

## Build

```bash
# Web app (from test-authoring-studio/): http://localhost:5173
npm install && npm run scanner:build && npm run langserver:build && npm run debugger:setup && npm run dev
# Desktop app (from test-authoring-desktop/): installer and portable exe in release/
npm install && npm run dist
```

The .NET helpers need the .NET 10 SDK (a local one in `.tools/dotnet/` works). Architecture notes: [CLAUDE.md](CLAUDE.md).
To refresh the screenshots, from `test-authoring-desktop/` run:

```powershell
npm run pack
$env:TAS_SCREENSHOTS = '1'
$env:TAS_EXE = 'release/win-unpacked/TestAuthoring Studio.exe'
npx playwright test screenshots
```
