# TestAuthoring Studio

A local IDE for **SpecFlow / Reqnroll + Playwright (C#)** test repositories. It indexes a .NET test solution with
Roslyn, and lets you write Gherkin features that reuse your existing step definitions, record browser flows into
feature files and XML selector dictionaries, edit, refactor and debug C#, manage projects, and run tests. Everything
runs on your machine; nothing is uploaded.

It ships as a **Windows desktop app** (`test-authoring-desktop/`, Electron) and as a **web app**
(`test-authoring-studio/`, React + a local Node API), kept at feature parity.

## Key advanced features

| Area | Feature | What it does |
| --- | --- | --- |
| Projects | **Project Properties** | Property pages for a `.csproj`: Application, Build, Package, Code Analysis, Build Events, Global Usings, Project References, Debug launch profiles. Values the file does not set show what the build really uses (SDK defaults, `Directory.Build.props`), evaluated by the .NET SDK. Debug and Release can differ. |
| Projects | **Safe project edits** | Every change to a project file is shown as a diff and written only when you approve it: Upgrade Target Framework, Build Action / Copy to Output, Exclude From Project, Suppress in Project File, Tidy Project File. |
| Projects | **Project tools** | Manage User Secrets, an EditorConfig designer, `.csproj` value completions, `Directory.Build.props`, a project dependency graph. |
| C# | **Refactorings on the keyboard** | Refactor This (Ctrl+Alt+Shift+T), Extract Method (Ctrl+Alt+M), Introduce Variable (Ctrl+Alt+V), Introduce Parameter (Ctrl+Alt+P), Inline (Ctrl+Alt+N), Generate (Ctrl+Alt+G), Move Type to Matching File — powered by Roslyn. |
| C# | **Code generation** | Extract Interface, Create Unit Tests (NUnit, xUnit or MSTest), equality members, `ToString`, null checks, postfix templates (`expr.var`, `.if`, `.foreach` + Tab). |
| C# | **Code insight** | Inheritance gutter (↑ overrides / implements, ↓ overridden / implemented), exit points, inline Git blame, unused step definitions faded, CodeLens, inlay hints. |
| C# | **Search with Pattern** | Structural search and replace across the solution with `$placeholders$` (`$x$ == null` → `$x$ is null`), one previewed diff per file. Code Cleanup in Solution organizes usings and formats every file. |
| Debugging | **Breakpoints** | Labels, search and hit counts in the Breakpoints window; dependent breakpoints; "when changed" conditions; disable once hit; temporary and function breakpoints; tracepoints with `$FUNCTION`, `$CALLER`, `$TID`. |
| Debugging | **Inspecting** | Edit values while paused, search in Locals, Text / JSON / XML and collection (table) visualizers, pinned DataTips, inline values in the editor, Threads window. |
| Debugging | **Execution control** | Force Run to Cursor, Step Out to a call-stack frame, Just My Code, break on specific exception types, Debug Last Test Run. |
| Testing | **Test runs** | Test history per test, Run Repeatedly (flaky tests), continuous testing on save, Run Impacted Tests (from uncommitted changes), environment variables for runs, slowest tests, CSV export, living documentation (HTML). |
| Gherkin | **Feature files** | Preview / expand Scenario Outlines, steps bound to the same definition highlighted, parameter-name hints, tag tools, Examples merge, CSV import, duplicate scenario and Examples-row warnings. |
| Git | **Git in the editor** | Inline blame, authors above scenarios, merge conflict actions (accept current / incoming / both), Stage Selected Lines, commit message helpers. |
| Editing | **Convert and edit** | Encode / decode (URL, Base64, HTML, JSON, Unicode), number tools, sort tokens, align assignments, Markdown tools, test data, and 100 quality-of-life improvements. |

Every optional feature has a switch under **Settings ▸ Features**. Details: [ADVANCED-20.md](ADVANCED-20.md),
[CSHARP-20.md](CSHARP-20.md), [DEBUG-20.md](DEBUG-20.md), [IDE-FEATURES-4.md](IDE-FEATURES-4.md),
[IDE-FEATURES.md](IDE-FEATURES.md) and [QOL-50.md](QOL-50.md).

## Screenshots

Captured from the Windows desktop build, using a temporary copy of the Calculator sample. These are running-app
captures, not mockups.

### Advanced features

**Project Properties.** The Build page of the test project; settings the file does not set show their effective
value, and changes are previewed as a diff of the `.csproj` before anything is written.

![Project Properties](docs/screenshots/project-properties.png)

**C# refactoring.** Refactor This lists the refactorings for the selection. The gutter marks members that override
or are overridden, and the caret's line shows who changed it last.

![C# refactoring](docs/screenshots/csharp-refactoring.png)

**Search with Pattern.** A structural search with placeholders across the solution, with a replacement to preview.

![Search with Pattern](docs/screenshots/search-pattern.png)

**Debugger visualizer.** Paused in a step definition: a list shown as a table, one row per item and a column per
property.

![Debugger visualizer](docs/screenshots/debugger-visualizer.png)

### The studio

**Feature editor and Explorer.** Open a `.sln` / `.slnx` / `.csproj`; projects, dependencies and files appear in
the Explorer.

![Feature editor](docs/screenshots/feature-editor.png)

**C# editor.** Roslyn IntelliSense, CodeLens (step usages, references, test results), go to definition, rename,
quick actions, and a navigation bar.

![C# editor](docs/screenshots/csharp-editor.png)

**Debugging a feature file.** Breakpoints on Gherkin lines, step into the C# step definition, then Locals, Watch,
Call Stack and Immediate.

![Debugger](docs/screenshots/debugger.png)

**Test Explorer.** Discovers NUnit / xUnit / MSTest tests and scenarios. Run, debug, run failed, playlists and code
coverage.

![Test Explorer](docs/screenshots/test-explorer.png)

**Playwright recorder.** Record a browser flow, match each action to existing steps, and generate the feature file
and dictionary entries.

![Recorder](docs/screenshots/recorder.png)

**Spy (GUI object recognition).** Track an element on any page, browse the element tree, read its properties, and
pick a selector that is verified against the live page (unique / n matches) before it goes into an XML dictionary.
Snapshots keep a page to explore offline.

![Spy](docs/screenshots/spy.png)

**Start Window.** Open recent, clone a repository, open a project, solution or folder.

![Start Window](docs/screenshots/start-window.png)

**Settings.** Search across categories, adjust preferences and open workspace settings. Ctrl+F focuses search;
Escape clears the query before closing.

![Settings](docs/screenshots/desktop-settings.png)

### Productivity tools

**File Structure and Structure window.** Ctrl+Alt+F12 lists the file's types and members (or a feature's scenarios),
and the Structure window (Alt+7) follows the caret.

![File Structure](docs/screenshots/file-structure.png)

**Call Hierarchy.** Ctrl+Alt+H shows who calls a method, and you can expand each caller in turn. Ctrl+H shows the
type hierarchy.

![Call Hierarchy](docs/screenshots/call-hierarchy.png)

**Terminal.** Alt+F12 opens PowerShell in the repository folder, with history, several tabs, zoom and copy / paste.

![Terminal](docs/screenshots/terminal.png)

**Problems.** Alt+Shift+6 runs a solution-wide analysis: C# compiler errors and warnings from every project, plus
feature steps that have no step definition.

![Problems](docs/screenshots/problems.png)

**HTTP Client.** `.http` files can define variables and several requests. Send a request with ▶ or Ctrl+Enter to see
the status, the headers and the JSON body; convert to and from cURL.

![HTTP Client](docs/screenshots/http-client.png)

**Markdown preview.** Show Markdown as the editor alone, the editor and preview side by side, or the preview alone.

![Markdown preview](docs/screenshots/markdown-preview.png)

**Run Anything.** Press Ctrl twice, then type a command or pick a suggestion: build, test, restore or Git. It runs in
the Terminal.

![Run Anything](docs/screenshots/run-anything.png)

**Git Log.** Alt+9 lists every branch's commits with the graph. Select a commit to see its message, changed files and
patch.

![Git Log](docs/screenshots/git-log.png)

**Productivity Guide.** Shows which features you use, how often, and how often with the shortcut.

![Productivity Guide](docs/screenshots/productivity-guide.png)

## Highlights

- **Solutions:** `.sln` / `.slnx` / `.csproj`, multiple projects, Project Properties, NuGet package management,
  build, Error List and Output.
- **Gherkin:** step completion from your bindings, F12 to the step definition, table alignment as you type, Create
  Step, Rename Step, outline and table refactorings.
- **C#:** IntelliSense, signature help, CodeLens, inlay hints, folding, sticky scroll, split editor, Roslyn
  refactorings, Git blame and compare.
- **Testing and debugging:** Test Explorer, run glyphs in the margin, netcoredbg debugging (conditional, dependent
  and function breakpoints, tracepoints, exception settings, visualizers), code coverage, Playwright traces.
- **Git:** changes, stage (also single lines), commit, branches, merge, fetch, pull and push, Git Log, shelves.
- **Reqnroll / SpecFlow:** step matching with Reqnroll's rules (Cucumber expressions, `[Scope]` precedence,
  `[StepDefinition]`), Go To Hooks, Define Steps, Find Unused Step Definitions, bound/unbound step highlighting,
  Scenario Outline checks, and Gherkin formatting from `.editorconfig`. See [REQNROLL.md](REQNROLL.md).
- **Spy:** element tracking, element browser, properties, verified selectors, add to dictionary, snapshots. See
  [SPY.md](SPY.md).
- **Settings ▸ Features:** every optional feature has a switch, grouped by area, with per-group switches and two
  presets: **Essentials** (the desktop app's default) and **All features** (the web app's default). A feature that is
  off disappears from the menus (including the desktop's native menus), the palette and the keyboard, and stops
  drawing in the editors.

## Getting started

```bash
# Web app (from test-authoring-studio/)
npm install
npm run scanner:build && npm run langserver:build && npm run debugger:setup
npm run dev            # http://localhost:5173

# Desktop app (from test-authoring-desktop/)
npm install
npm run dist           # release/TestAuthoring Studio Setup 1.0.0.exe (installer) and a portable exe
```

The .NET helpers need the .NET 10 SDK. The repository can use a local SDK in `.tools/dotnet/`. See
[CLAUDE.md](CLAUDE.md) for the architecture and development notes.

To refresh the screenshots after building the desktop app:

```powershell
cd test-authoring-desktop
npm run dist
$env:TAS_SCREENSHOTS = '1'
$env:TAS_EXE = 'release/win-unpacked/TestAuthoring Studio.exe'
npx playwright test screenshots
Remove-Item Env:TAS_SCREENSHOTS, Env:TAS_EXE
```
