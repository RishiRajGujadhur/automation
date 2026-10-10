# TestAuthoring Studio

A local tool that turns **Playwright recordings** into **SpecFlow feature files** for an existing C# SpecFlow + Microsoft Playwright test repository. It reuses the repository's existing steps, page objects, and XML selector dictionaries wherever it can. Where nothing exists yet, it proposes new Gherkin, step bindings, and selector entries, and you review them before anything is written.

The stack:

- **Client:** React 19, TypeScript, Tailwind CSS 4 + SCSS, CodeMirror 6, cmdk, Motion, Lucide icons.
- **API:** loopback-only Express service.
- **Scanning:** standalone Roslyn scanner (C#).
- **Recording:** Playwright recorder.
- **Search:** FlexSearch running in a Node worker thread.

The tool adds nothing to the target repository except files you explicitly approve.

## Start

You need Node.js 24+, the .NET 10 SDK, and Playwright Chromium.

```powershell
npm install
npm run scanner:build
npx playwright install chromium
npm run dev
```

- **Client:** http://127.0.0.1:5173
- **API:** http://127.0.0.1:4310
- **Production:** run `npm run build`, then `npm start`, then open http://127.0.0.1:4310.

The scanner uses `dotnet` on your PATH. Set `DOTNET_PATH` to use a different SDK (for example, the local SDK at `../.tools/dotnet`). The SDK version only affects the scanner build. It does not change the target framework of the repository you scan.

## Target repository model

The studio expects the generic layered BDD pattern:

| Layer | Typical folders | What the studio uses it for |
| --- | --- | --- |
| Feature | `Features/<Area>/*.feature` | Gherkin scenarios, backgrounds, outlines, tables, doc strings |
| Step | `Steps/`, `StepDefinitions/` | `[Given]`/`[When]`/`[Then]` bindings, plus parameters and usages |
| UI | `Pages/`, `PageObjects/`, `Helpers/` | Page objects and locator calls (Roslyn call evidence) |
| Selector data | `Dictionaries/**/*.xml` | Page → Section → Field → Selector metadata |
| Support | `Support/`, `Hooks/` | Browser lifecycle. The studio reads these files but never generates them |
| Config / data | `Config/`, `Data/`, `TestData/` | Referenced but not modified |

Folder names are configurable through scan globs.

### How a step reaches a selector

1. A feature step matches a step definition.
2. The step definition calls a page object or helper.
3. The page object resolves the page, section, and field.
4. The page object looks the field up in the dictionary XML.
5. It tries the field's selectors **in document order**.
6. The first valid selector becomes the Playwright locator.

### Dictionary XML

```xml
<Page name="Login">
  <Section XRefCode="credentials">
    <Field XRefCode="username" Type="TextBox">
      <Selector Type="testid">login-username</Selector>
      <Selector Type="ariarole.textbox">Username</Selector>
      <Selector Type="css">#username</Selector>
    </Field>
  </Section>
</Page>
```

- **Matching:** sections and fields are matched by `XRefCode`. Lookups are normalized: spaces, `/`, `(` and `)` are removed, and text is lowercased.
- **Selector types:** `testid`, `ariarole.<role>` (textbox, combobox, button, link, checkbox, radio, option, tab, menuitem, heading), `text`, `css`, `xpath`.
- **Preference order:** `GetByTestId`, then `GetByRole(..., Name)`, then `GetByText`, then CSS id, then XPath.
- **Warnings:** the studio flags XPath because it needs a documented exception. It also flags `nth-child`/`nth-of-type` and deep CSS chains as brittle.

### Generation rules

- Reuse existing steps, then existing page objects, then existing dictionary entries.
- Add dictionary entries instead of hardcoding selectors in C#.
- Keep step definitions thin. Locator details belong in page objects.
- Never create browser instances in steps. Use the repository's existing hooks and lifecycle.
- Keep scenarios short. State selector and data assumptions explicitly.
- Before accepting a test, validate it:
  - the step pattern exists or is proposed;
  - the page, section, and field exist;
  - the field has at least one supported selector;
  - the dictionary file is included in build output;
  - the test follows the repository's naming and folder conventions.

## Workflow

1. **Configure.** Open Config and select the repository root and a project directory or `.csproj`. Set the source, feature, and XML globs, the ignored directories, and whether to scan direct references. The last working config is saved to `.local/workspace.json`.
2. **Scan.** Search steps, backgrounds, and selectors. Inspect binding parameters, usages, source locations, and resolved or unresolved call evidence.
3. **Build a scenario.** Add steps from the catalogue, the autocomplete, or the command palette (Ctrl/Cmd+K). Fill in parameters and reorder steps. Optionally switch to a Scenario Outline with Examples. Reuse backgrounds. The Gherkin editor supports the full syntax.
4. **Record.** Launch Chromium from the recorder. You can pause, resume, and stop. The studio captures navigation, clicks, input, and the Enter, Tab, and Escape keys.
5. **Match.** The studio ranks each recorded action against existing bindings. Review the alternatives and accept candidates explicitly.
6. **Fill gaps.** Search the repository first. If nothing fits, the studio proposes Gherkin wording or previews a C# binding or page-object scaffold. Existing selectors and methods are highlighted.
7. **Write.** Apply the accepted actions to the editor, validate the Gherkin, and preview the real file diff. **Approve and write file** is the only write operation. A file changed outside the app invalidates stale previews. The app never commits.
8. **Run (optional).** Select **Run tests** and give a `.csproj` and a `dotnet test --filter` expression. This is the only path that executes repository code. Scanning never does.

The **Feature explorer** mirrors repository paths at any depth. Folder search keeps matching ancestors visible. **+** creates a draft in that folder, and approving the draft creates any new subfolders. **Guide me** starts a Joyride tour that never records or writes anything.

## Search architecture

The client used to download every binding and filter them in the browser. Search now runs on the server:

```text
Catalogue ─┐
Autocomplete ├─> GET /api/steps?q&offset&limit&keyword ─> StepSearch ─> worker thread (FlexSearch)
Palette ───┘                                                  (byId map)    indexes: all / Given / When / Then
```

- **Worker indexes:** `server/stepSearch.ts` builds a FlexSearch index in a worker (`server/search-worker.mjs`) on every scan. The worker keeps one index per keyword.
- **Indexed text:** each document combines the pattern, class, method, file, parameter names, and examples.
- **Normalization:** camelCase is split, accents are stripped, and a small fixed alias table maps verb forms (for example, `clicked` → `click` and `login` → `signin`). This is deterministic expansion, not AI inference.
- **Capped responses:** `limit` is at most 50 and `q` at most 200 characters. Responses return `items`, `hasNext`, `total` (null for text queries), and `indexedTotal`.
- **Slim workspace payload:** `/api/workspace` returns stats only, with no bindings, selectors, methods, call edges, or dictionary entries. Detail endpoints (`/api/step`, `/api/feature`, `/api/dictionaries`, `/api/project/files`) page separately.
- **One client hook:** the catalogue, autocomplete, and command palette all use `useStepSearch`, which debounces input and aborts stale requests.
- **Workspace changes:** rescanning or switching workspaces terminates the old worker and rejects its pending searches.

## Dictionary inspector

- Lists Page / Section / Field entries with their file and line (each field's line, not the top of the file). Results are paged 12 at a time.
- Shows selectors **in XML document order**. It labels the first supported selector and the fallbacks, and marks unsupported types.
- Generates the C# locator code for Fill, Click, or Verify-visible, and shows the dictionary source.
- Every candidate is labeled a **static preview**. Browser verification is not implemented yet (see Todo).

## Layout

| Path | Contents |
| --- | --- |
| `server/core.ts` | Workspace resolution, Gherkin parsing, index assembly, classification, action matching |
| `server/stepSearch.ts`, `server/search-worker.mjs` | Worker-backed step search |
| `server/dictionaries.ts` | SAX parser for dictionary XML, locator code generation, selector warnings |
| `server/recorder.ts` | Playwright capture and redaction |
| `server/proposals.ts` | Reviewable C# scaffolds |
| `scanner/` | Roslyn static scanner. It never runs MSBuild or project code |
| `src/` | React client (`App.tsx`, `StepCatalogue`, `SearchPalette`, `DictionaryInspector`, `FeatureExplorer`, `ProjectExplorer`, `StudioTour`) |
| `fixtures/` | Small sample repository. It is not executable |

## CLI

```powershell
npm run cli -- scan --root C:/Source/Repository
npm run cli -- search steps search --root C:/Source/Repository
npm run cli -- search backgrounds browser
npm run cli -- search selectors Search
npm run cli -- show Steps/SearchSteps.cs:11
```

The CLI defaults to `fixtures/`. `scan` prints the index to stdout and does not save it.

## Verification

```powershell
npm run scanner:build
npm run build
npm test
npm run test:e2e
npm audit
```

The tests cover:

- **Parsing:** Gherkin outlines, tables, and doc strings; inherited keywords; ambiguous bindings; multiple attributes; parameters; static call evidence.
- **Matching:** ranking.
- **Recording:** redaction, real Chromium capture, pause and stop.
- **Safety:** path confinement, preview approval, external file changes, one-time apply tokens.
- **UI:** catalogue-to-builder authoring and mobile overflow.

E2E tests run serially because they share one API workspace.

## Status

### Done

- Roslyn scanning of steps, page objects, locator calls, and call evidence
- Gherkin parsing and a full-syntax editor
- Scenario builder with outlines and backgrounds
- Feature explorer with nested folders
- Playwright recorder with redaction
- Deterministic matching of recorded actions to bindings
- Gherkin and C# scaffold proposals
- Diff preview, approved writes, and stale-preview protection
- Optional `dotnet test` execution
- Worker-backed step search with capped, paged API responses, shared by the catalogue, autocomplete, and palette
- Page / Section / Field / Selector dictionary parsing with document order preserved and per-field line numbers
- Dictionary inspector with static locator previews
- Guided tour, CLI, and unit and E2E tests

### Todo

- [ ] **Browser-verified selector matches.** Resolve a dictionary field's selectors against a live page in the recorder, then show "verified match", "no match", or "multiple matches" next to each static candidate.
- [ ] **New selector dictionaries.** Propose new XML dictionary files and Section/Field/Selector entries from recorded actions. Preferred types: testid, then role, then text, then css. Follow the existing preview, approve, and write flow, and append to an existing dictionary without reordering it.
- [ ] **Recording → dictionary → page object.** For unmatched actions, generate the dictionary entry and a page-object call that uses it, instead of an inline locator scaffold.
- [ ] **Validation rule checks.** Confirm that the page, section, and field exist for generated steps. Check that dictionary files are copied to build output (`.csproj` `CopyToOutputDirectory`).
- [ ] **Searchable selectors and backgrounds.** Move selector and background search onto the worker index. Dictionary search is still a linear filter on the server.
- [ ] **Exact totals.** Report total counts for text search queries, not just paging.
- [ ] **Binding coverage.** Support scoped bindings (`[Scope]`) and Cucumber expressions, which currently need manual review.
- [ ] **More recorder actions.** Uploads, downloads, drag-and-drop, assertions, frame identity, and shadow-DOM chains.
- [ ] **Multi-action steps.** Compress several actions into one binding, and infer assertions.
- [ ] **Optional integrations.** AI ranking, an MCP server, and IDE extensions.

## Boundaries

- **The sample repository is not executable.** Running tests needs your real project with its SDK, package restore, browsers, and configuration.
- **Static analysis only.** Roslyn parses source without MSBuild. It does not guess about external assemblies, reflection, dynamic selectors, or unresolved calls. Direct references are scanned but not built.
- **Regex limits.** Binding regexes run on the .NET engine with a 100 ms timeout.
- **Heuristic scores.** Ranking scores are evidence, not probabilities.
- **Scaffolds are not verified code.** New C# scaffolds throw until you choose a verified locator. Existing C# files are never replaced.
- **Redaction.** Passwords and recognizable secret fields are redacted. URL credentials, query strings, and fragments are stripped. Secrets typed into ordinary unlabeled fields cannot be detected.
- **Local only.** The service binds to loopback only and rejects unexpected origins and hosts. All reads and writes are confined to the selected repository, including symlink checks. Do not expose it publicly.
