# TestAuthoring Studio

A local React 19 application for discovering, reusing, and authoring **C# SpecFlow + Microsoft Playwright** tests. The browser client uses TypeScript, Tailwind CSS 4, SCSS, CodeMirror 6, Motion, and animated Lucide SVG icons. A loopback-only Express service coordinates a separate Roslyn scanner and Playwright recorder. No authoring-tool reference is added to a target repository.

## Start

Requirements: Node.js 24+, .NET 10 SDK, and Playwright Chromium.

```powershell
npm install
npm run scanner:build
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:5173**. The API listens on **127.0.0.1:4310**. Both are local; no deployment or account is required. Fonts are bundled for offline use. This workspace has a local .NET SDK installed at `../.tools/dotnet`; elsewhere the commands use `dotnet` on PATH. Set `DOTNET_PATH` to override it.

For the production client: `npm run build`, then `npm start`, then open **http://127.0.0.1:4310**.

## Workflow

**Guide me** in the header starts an on-demand React Joyride walkthrough. It covers workspace setup, nested feature folders, reusable bindings/backgrounds/selectors, scenario building, recording, matching, and approved writes. Back, End tour, Escape, and Finish return control to the user; ending the tour restores the previous view and preserves drafts. The guide does not start a recording or write repository files.

The explorer mirrors repository-relative paths at any depth (for example, `Features/Payroll/Salary/Create.feature`). Folder buttons expand or collapse branches. Search matches feature names, filenames, and folder paths while keeping matching ancestors visible; duplicate filenames stay in their own folders. Select a folder or use its **+** button to create a feature draft in that folder. Edit the relative filename to add deeper subfolders; approval creates them along with the feature file. On narrow screens, the folder button in the header opens the explorer. Ctrl/Cmd+K focuses feature search.

The supplied generic automation schema is treated as architecture guidance: feature files contain Gherkin behavior, bindings connect it to C# methods, and selectors belong to page objects/helpers or dictionaries. Folder names remain configurable through the existing scan patterns. A .NET SDK version installed for the scanner does not change the target framework of the repository being managed.

1. Open workspace settings and select a repository root plus a project directory or `.csproj`. Configure source, feature, and XML globs, ignored directories, and direct-reference scanning. The last successful workspace configuration is saved locally in `.local/workspace.json`.
2. Scan the repository. Search steps, backgrounds, and selectors. Inspect binding parameters, usages, source locations, and resolved/unresolved call evidence.
3. Add existing steps to the scenario builder, enter parameters, reorder steps, and optionally enable Scenario Outline examples. Reuse backgrounds and edit tables/doc strings in the Gherkin editor. The editor supports the complete Gherkin syntax.
4. Open the recorder and launch Chromium. The default URL is an included deterministic local search page. Interact with the page, pause/resume, and stop. Match actions, inspect alternatives, and explicitly accept candidates. The initial four-action recording is labeled **Example recording**.
5. If nothing matches, search the repository first. Propose Gherkin wording or preview a C# binding/page-object scaffold. The scaffold highlights existing selectors/methods and requires review of namespace, locators, and dependency injection.
6. Apply accepted actions to the editor, validate Gherkin, and preview the actual file diff. **Approve and write file** is the only write operation. Changing a file outside the app invalidates stale previews. The application never commits.
7. With an executable test repository configured, save the feature and select **Run tests** in the editor. Specify the `.csproj` and a `dotnet test --filter` expression. This explicitly executes repository code; scanning never does. Output and pass/fail state are displayed locally.

## Architecture

```text
React / CodeMirror / Tailwind + SCSS
                 |
       Loopback Express API
          /             \
 Repository index     Playwright recorder
  |        |                 |
Gherkin  Roslyn C#      Redacted action IR
XML      static AST          |
  \       /          Deterministic ranking
   Source evidence           |
       Scenario builder / editor
                 |
       Preview token + source hash
                 |
        Explicit approved write
```

`scanner/` contains the standalone Roslyn program, built against SDK-shipped Roslyn assemblies. `server/core.ts` owns workspace resolution, Gherkin parsing, index assembly, classification, and action matching. `server/recorder.ts` captures navigation, click, input, and selected key events. `server/proposals.ts` creates reviewable C# scaffolds. `fixtures/` is a small, intentionally unbuilt sample repository.

## CLI

```powershell
npm run cli -- scan --root C:/Source/Repository
npm run cli -- search steps search --root C:/Source/Repository
npm run cli -- search backgrounds browser
npm run cli -- search selectors Search
npm run cli -- show Steps/SearchSteps.cs:11
```

The default CLI workspace is `fixtures/`. `scan` prints the index to stdout; it does not persist an index. The UI keeps repository data in memory and stores only workspace configuration locally.

## Verification

```powershell
npm run scanner:build
npm run build
npm test
npm run test:e2e
npm audit
```

Tests cover Gherkin outlines, tables, doc strings, inherited step keywords, ambiguous bindings, multiple attributes, parameters, relative paths, static call evidence, ranking, URL/password redaction, real Chromium capture, pause/stop, path confinement, preview approval, external file changes, one-time apply tokens, catalog-to-builder authoring, and mobile overflow. Browser tests use local fixtures and run serially because they share one API workspace. Screenshot output is under `test-results/`.

## Current boundaries

- The sample repository demonstrates scanning and authoring; it is **not an executable SpecFlow project**. Test execution needs your existing project, its SDK/runtime, package restore, browser installation, and application configuration. No Google/Dayforce external smoke test has been executed here. To try one, start recording at `https://www.google.com/`, search `Dayforce.com`, and review the resulting matches and locators; Google consent/CAPTCHA can intervene.
- Roslyn parses source without MSBuild or project execution. Cross-source calls that Roslyn can resolve are retained. External assemblies, runtime wrappers, reflection, overloads requiring missing metadata, dynamic selectors, and unresolved calls are not invented. Direct references are scanned, not transitively built.
- Repository indexing and editor validation use the .NET regex engine with a 100 ms match timeout. Scoped bindings and Cucumber expressions still need manual review. Ranking scores are heuristic evidence scores, not calibrated probabilities. Multi-action compression into one binding and assertion inference require developer review.
- XML dictionaries recognize entries with `name` and `value` attributes; other repository-specific schemas need an adapter. Dictionary locations currently point to the start of the XML file. C# locator and binding locations are exact.
- The recorder supports basic navigation, click, input, and Enter/Tab/Escape actions. It does not yet represent uploads, downloads, drag-and-drop, assertions, frame identity, or complex shadow-DOM locator chains. Password inputs and recognizable secret fields are redacted at capture time; credentials and all query/fragment data are removed from recorded URLs. Arbitrary secrets entered into unlabeled ordinary fields cannot be reliably inferred.
- New C# proposals are **scaffolds**, not automatically verified implementations. They deliberately throw when no verified locator is available. Existing selector expressions are shown for review, and no existing C# file is replaced. Adapt generated class names and dependency injection to your repository before running.
- AI matching, MCP integration, and IDE extensions remain optional future integrations, as described in the plan.

The tool binds only to loopback and rejects unexpected request origins/hosts. Source access and writes stay within the selected repository, including resolved link checks. Do not expose this development service publicly.
