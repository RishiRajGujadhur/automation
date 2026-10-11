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

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** | Index counts, project classification indicators (§11), files per layer, scan diagnostics, quick entry points. |
| **Test Generator** | The guided flow below. A context bar shows the active project, target framework, browser and dictionary sync status. |
| **Features** | Feature editor, scenario builder and Playwright recorder. |
| **Step Catalog / Backgrounds / Selectors** | Worker-backed, paged searches over bindings, backgrounds and C# locator calls. |
| **Dictionary Inspector** | XML fields in document order, static vs browser-verified selector badges, locator code, and a hand-off to the Test Generator. |
| **Project Explorer** | Files grouped by layer (Feature, Step, UI, Selector data, Support, Config, Data, Build, Output), plus a folder browser. |
| **Config** | The current workspace configuration, with a link to the settings dialog. |

The tab bar shows only the four primary pages. To reach Step Catalog, Backgrounds, Selectors, Project Explorer or Config, use either:
- the **studio menu**: right-click any empty space, or click **⋯** in the tab bar; or
- the command palette (Ctrl/Cmd+K).

The studio menu is a Radix context menu (`@radix-ui/react-context-menu`). It also offers Command palette, Start a recording, New feature, Rescan, Workspace settings and Keyboard shortcuts. Menus on cards and rows take priority over it. Text inputs and code editors keep the browser's own right-click menu (copy, paste, spellcheck).

### Basic and Advanced mode

**Basic mode is the default.** The navigation shows **Dashboard**, **Test Generator** and **Playwright Recorder**, and a new visitor lands on the Dashboard. **Advanced mode** adds Features, Dictionary Inspector and the ⋯ menu (Step Catalog, Backgrounds, Selectors, Project Explorer, Config).

Ways to switch: the **Basic / Advanced** pill in the nav bar, Settings → General → Interface mode, the studio menu, or **Ctrl/Cmd+Shift+A**. In Basic mode, Alt+1/2/3 open Dashboard, Test Generator and Recorder.

Hidden pages stay reachable through Ctrl/Cmd+K and links. When you open one in Basic mode, a banner explains it's an Advanced page and offers **Switch to Advanced** or **Back to Dashboard**.

### Accent colours

There are eleven accents: Violet, Indigo, Blue, Cyan, Teal, Green, Amber, Orange, Rose, Pink and Slate. They're defined in `src/accents.ts`. Each one has two tones:
- a light tone for text and indicators on dark surfaces;
- a strong tone for filled buttons (and for text on the Light theme).

`tests/accents.test.ts` checks every accent against WCAG 2.x relative luminance: at least 4.5:1 as text on all dark-theme surfaces, as button labels, and as text on the Light theme's surfaces. The accent picker shows each accent's measured ratio. **Reset appearance** restores the default theme, accent, density, text size and editor theme.

The **wordmark** is text only, with "TestAuthoring" in the accent colour.

### Settings, themes and editor themes

Settings open from the sliders icon, the studio menu, or the command palette. The layout follows Claude Code's settings:
- **Sidebar:** a search field, then the categories: General, Appearance, Code editor, Accessibility, Layout, Ports, Playwright tracing, Workspace, Storage, and Keyboard shortcuts.
- **Rows:** each setting is a row with a title and description on the left and its control on the right.
- **Search:** filters rows across all categories, highlights the matches, and shows how many matches each category has.

**App themes:** Studio Dark (default), Midnight, Nord, Light and **Matrix**. Matrix is phosphor green on black with monospace text everywhere. Every theme is checked with axe for WCAG 2.2 AA (`tests/e2e/themes.spec.ts`), including colour contrast.

**Editor themes:** every CodeMirror instance (feature editor, scenario text, XML, C#, diffs) uses the selected theme. **Automatic** follows the app theme. The options are:
- **Studio Dark** and **Studio Light:** tuned to meet AA contrast.
- **Matrix**.
- **One Dark**.
- **ThemeMirror** (https://thememirror.net): Amy, Barf, Bespin, Birds of Paradise, Boys and Girls, Cobalt, Cool Glow, Dracula, Espresso, Ayu Light, Clouds, Noctis Lilac, Rosé Pine Dawn, Smoothy, Solarized Light and Tomorrow.

A live Gherkin preview shows the selected theme. The third-party themes are offered as-is, and some (e.g. Ayu Light's strings, One Dark's red) fall slightly below AA contrast. That's why the defaults are the Studio variants.

**Accent colour** drives primary buttons, active states, focus rings, the **logo**, and the **scrollbars**. Scrollbars are styled with the native CSS `scrollbar-color` / `scrollbar-width: thin`, not WebKit pseudo-elements.

### Studio settings (ports, tracing, storage)

| Setting | Effect |
| --- | --- |
| **Web UI port / API port** | Saved to `.local/settings.json` and used by the API server, the Vite dev server (and its `/api` proxy), the allowed-host/origin checks, and `playwright.config.ts`. Validation requires 1024–65535 and two different ports. Takes effect after restarting `npm run dev`. `STUDIO_WEB_PORT` / `STUDIO_API_PORT` override the file. |
| **Record Playwright traces** | Recordings run with `context.tracing` (screenshots, DOM snapshots and sources are each optional). Stopping saves `.local/traces/recording-<time>.zip`; download it from the recorder toolbar or the settings list, then open it with `npx playwright show-trace <zip>`. Test runs get `STUDIO_PLAYWRIGHT_TRACING=1`, so your hooks can opt in. |
| **Show dashboard statistics** | Shows or hides the counts row at the top of the Dashboard. |
| **Cached UI state** | **Reset card states** reopens all cards. **Clear cache** removes every `tas:*` item this app stores in the browser (drafts, preferences, layout, history) and reloads. Repository files are never touched. Both ask for confirmation first. |

Cards (Dashboard panels, Project Explorer model, the generator's project model) are **collapsible**. Each card's state is remembered under `tas:card:<id>`.

### Layout

- **Compact header:** the header (48 px) holds a smaller logo and a breadcrumb: workspace › section › **page title (the page's single `<h1>`)** with an unsaved-changes dot. The nav bar (44 px) carries the Editor / Builder / Recorder switch on the right. The tall page heading is gone; its description is announced to screen readers through `aria-describedby` on `<main>`.
- **Scenario text:** in the Test Generator this is a CodeMirror editor with Gherkin highlighting, binding warnings, step hover and the same step autocomplete as the feature editor.
- **Full screen editor:** the feature editor has a full-screen button (also in its right-click menu and Ctrl/Cmd+Shift+F). It fills the window and asks the browser for fullscreen; Esc exits.

### Web standards and accessibility

The app is checked against the W3C standards it relies on (HTML, CSS, WAI-ARIA) and **WCAG 2.2 level AA**.
- **Automated audit:** `tests/e2e/a11y.spec.ts` runs [axe-core](https://github.com/dequelabs/axe-core) with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` rule sets on all 11 pages, plus the Preferences and Workspace dialogs and the studio menu. The suite fails on any violation.
- **Document structure (also tested):** `lang="en"`, a descriptive `<title>` per page, one `banner`, `main` and `contentinfo` landmark, exactly one `<h1>`, and a **Skip to main content** link as the first focus stop.
- **Fixes this audit drove:**
  - muted text raised to at least 4.5:1 contrast, and 9 px text raised to 11 px;
  - every CodeMirror editor has an accessible name and is keyboard-focusable (read-only ones are marked `aria-readonly`);
  - the view switch is a radio group, since it has no tab panels;
  - the dictionary list no longer misuses `listbox`;
  - Radix menus are non-modal, so they don't `aria-hide` focusable content;
  - visible focus outlines on every interactive role.
- **Still in place from earlier:** labelled inputs with linked hints and errors (`aria-describedby`, `aria-invalid`), reduced-motion and contrast preferences, 44 px touch targets on coarse pointers, and the Radix primitives' keyboard and screen-reader behaviour.
- **Limits:** automated checks catch most, not all, WCAG issues. Screen-reader passes (NVDA/VoiceOver) and a keyboard-only walkthrough remain worthwhile before a release.

### Test Design (deterministic algorithms)

**Test Design** is an Advanced page (⋯ menu, Ctrl/Cmd+K, Alt+5, `#/test-design`). It runs 140 non-AI algorithms from `src/algorithms/` over the whole feature corpus (`GET /api/design/corpus`). Each tool is a tab, and the last tab you used is remembered.

| Tool | What it does | Algorithms |
| --- | --- | --- |
| **Examples generator** | Parameters (or CSV import) → a Scenario Outline Examples table, with a t-way coverage meter. Constraints (`a = x & b = y`, `if a = x then b != y`), seed rows, weights (`value*3`), `18..65` boundary values, `[0..17|18..64]` classes. Includes a decision table with minimized rules. | IPOG, AETG, covertable, orthogonal arrays, each-choice, base-choice, seeded random, Cartesian, BVA, equivalence partitioning, Quine–McCluskey |
| **Logic & techniques** | Logic coverage for a business rule (MC/DC, condition, decision, multiple-condition), cause–effect graphs → decision tables, classification trees (minimal or pairwise), domain-testing ON/OFF points, tricky-value catalogue. | MC/DC independence pairs, cause–effect merging, classification tree method, domain testing, error guessing |
| **Impact & risk** | Changed files (typed or read from git) → impacted scenarios with reasons; traceability matrix from requirement tags; risk = likelihood × impact; quarantine advice; best suite for a time budget and the coverage/time Pareto front; next-run failure prediction; scenario themes. | Test impact analysis, RTM, risk-based testing, quarantine policy, 0/1 knapsack, Pareto front, logistic regression, naive Bayes, k-means++, silhouette, RAKE |
| **Step library** | Searchable reusable steps with usage counts, "parameterize repeated steps" proposals, similar-step clusters with a threshold slider, **rename everywhere** (Cucumber expression → new wording, diff preview per file, approve to write), expression converters. | BM25, fuzzy, trie, inverted index, BK-tree, frecency, Aho–Corasick, 11 similarity measures, union-find / HAC / DBSCAN, MinHash-LSH, SimHash |
| **Suite optimizer** | The fewest scenarios that still cover every tag and/or distinct step; run order with APFD. | Greedy / weighted set cover, HGS, exact branch and bound, simulated annealing, genetic, total/additional greedy, adaptive random |
| **Flow generator** | `From -> To : action [cost]` state machine → Gherkin scenarios, plus dead-state warnings, a route finder and feature dependency order. | Transition, state, 1-switch and prime-path coverage, Chinese postman + Hierholzer, simple paths, random walks, BFS, Dijkstra, Tarjan, Kahn |
| **Duplicates & smells** | Missing Then, long scenarios, conjunction steps, imperative UI detail, keyword order, Outline/Examples mismatches, duplicate names, duplicate scenarios, readability. | Rule checks, scenario fingerprints, Flesch reading ease |
| **Results & flakiness** | Drop JUnit XML or Cucumber JSON reports; history is stored per browser. | Flip rate, entropy, flakiness score, Wilson interval, EWMA, Beta posterior |
| **Plans & filters** | Cucumber tag expressions, folder filter, saved filters, test plans/cycles with per-scenario status, tag co-occurrence heat map. | Shunting-yard parser, co-occurrence matrix |
| **Living docs** | HTML (printable, dark-mode aware) or Markdown spec with the latest imported status. | Status roll-up |
| **Similarity lab** | Compare two steps with every enabled measure, phonetic code and stemmer. | — |

Batch 2 also extends existing tools:
- **Examples generator:** simulated-annealing covering arrays, **Reduce** (drops rows while keeping coverage), and a list of uncovered combinations.
- **Flow generator:** basis paths, Markov usage journeys, Yen's alternative routes, cyclomatic complexity, PageRank hub states, an all-pairs distance matrix and sneak-path negative scenarios.
- **Results:** CUSUM change points, SPRT rerun verdicts, Mann–Kendall duration trends, MAD slow-test outliers, percentiles, MTBF and co-failure pairs.
- **Smells:** passive voice, vague wording, Gunning fog, lexical diversity and feature keywords.
- **Step library:** next-step suggestions and repeated step runs (Background candidates).
- **Plans:** Apriori tag rules and tag entropy.
- **Similarity lab:** Needleman–Wunsch scenario alignment.

The **feature editor** uses the same library: steps already written in feature files appear in autocomplete after the bindings, a step that is almost identical to an existing one gets a **Use existing step** quick fix (quoted values are kept), and scenario smells show as info diagnostics.

**Settings → Algorithms** lists every algorithm with a switch and an ⓘ tooltip explaining it. There are also per-category switches, Enable all / Disable all / Reset, and an "N of 140 on" count. Settings search matches what an algorithm does (try "phonetic"). A tool whose algorithm is off says so and offers **Turn on**. The full checklist and research notes are in [PLAN.md](PLAN.md).

### Test Generator wizard

The four steps form a **wizard**: one step at a time, built on Radix Tabs. I chose this over a driver.js-style tour because it gates progress and keeps step state. The existing Joyride tour remains for walkthroughs.
- **Stepper:** each step shows a live summary and a status (done ✓, needs attention, current). Clicking a step jumps to it. A progress bar tracks completion.
- **Back / Next:** Next is blocked while the current step has problems, and a "Before continuing" list explains what to fix. Step 3 allows **Continue without a match**. Entering step 4 runs the dry-run validation automatically. The final step's primary button is **Regenerate code & save**.
- **Remembered:** the current step survives a reload. "Add dictionary entry" on step 4 jumps to step 3's form.

### Resizable sidebar

Drag the explorer's right edge to resize it, as in the Claude desktop app.
- **Cursor:** the edge shows a `col-resize` cursor and an accent line on hover, and the whole page keeps that cursor while dragging.
- **Collapse and reset:** drag it nearly shut to collapse it (Ctrl/Cmd+B brings it back). Double-click resets it to 260 px.
- **Keyboard:** the edge is focusable; ←/→ resize (Shift for bigger steps), Home/End jump to the minimum/maximum, Enter resets.
- **Limits:** the width (180–520 px) is remembered per browser.

### Feature editor

The editor is CodeMirror 6 with `@codemirror/lint` and `@codemirror/autocomplete`.
- **Syntax errors as you type:** checked with the official `@cucumber/gherkin` parser, shown with wavy underlines, gutter markers and a live "N errors · N warnings" count. F8 or the count jumps to the next problem; Ctrl+Shift+M lists them all.
- **Binding check:** step lines are checked against the repository index. Unbound steps get a warning; ambiguous ones say how many bindings match. Scenario Outline steps with `<placeholders>` are skipped.
- **Step autocomplete from real bindings:** type `When Login` and the existing step appears, e.g. `When Login as ${roleName} to ${appName}`. Placeholders are named after the C# method parameters, and Tab moves between them. Ctrl+Space opens suggestions. Each suggestion shows its C# attribute, class and source location.
- **Keyword autocomplete** at the start of a line: Feature, Scenario, Scenario Outline, Background, Examples, Rule, Given…But.
- **Hover a step** to see the binding it resolves to.
- **Format document** (Shift+Alt+F): canonical indentation and aligned table columns. **Toggle comment** (Ctrl+/).
- **Right-click menu:** Run tests…, Preview changes (Ctrl+S), Validate bindings (Ctrl+Enter), Suggest steps, Format, Toggle comment, Next problem, Show problems, Cut, Copy, Paste, Select all.

### XML dictionary checking

Dictionary XML (Dictionary Inspector source tab, source previews, and generator snippets) uses `@codemirror/lang-xml` for parsing and highlighting.
- **Well-formedness:** errors come from the browser's XML parser, located by line and column.
- **Dictionary rules:** missing `XRefCode`, a Field with no Selector, an unsupported selector `Type`, an empty value, duplicate fields in a section, a CSS/XPath selector listed first, brittle `nth-child` selectors, and XPath that needs a documented exception.

### Modern design layer (2025–2026)

Styles are in `src/modern.scss`. Preferences are stored per browser and applied as `data-*` attributes on `<html>`.

| Area | What you get |
| --- | --- |
| Radix Dialog | All dialogs: focus trap, scroll lock, Escape and outside-click close, labelled title. They become **bottom sheets with a drag handle** on phones. |
| Radix Alert Dialog | Confirms destructive actions: clear recording, reset generator, discard unsaved edits when opening another feature. Cancel has focus by default. |
| Radix Accordion | Test Generator steps (state persisted). **Expand all / Collapse all** buttons. Animated height. |
| Radix Navigation Menu | Primary tabs, with arrow-key navigation between them. |
| Radix Tabs | Editor / Builder / Recorder switch. Dictionary field details (Resolution / Locator code / Source, last tab remembered). |
| Radix Toast | Notifications stack, **swipe to dismiss** (right on desktop, down on phones), pause on hover, have a close button and an Undo action, and are announced to screen readers. |
| Radix Tooltip | Icon buttons show their label, plus a keyboard shortcut where one exists. |
| Radix Progress | Busy bar, quality-gate score, "steps reusing bindings" meter, getting-started progress, test-run indicator. |
| Radix Separator, Toggle Group, Switch | Toolbar dividers. Given/When/Then filter and preference choices. Preference switches. |
| Radix Hover Card, Popover | Hover a matched step to preview its binding. Click "Active project" to see projects and packages. |
| Preferences | Density (comfortable/compact), text size (A−/A/A+), accent colour (violet/teal/blue/amber), reduce motion, high contrast, haptics, show explorer, focus mode. |
| Mobile | Bottom navigation bar, sticky generator actions, safe-area insets, `dvh` heights, 44 px touch targets on coarse pointers, haptic feedback on accept/remove/validate. |
| Visual polish | Glass header when content scrolls under it. Fluid `clamp()` headings. `text-wrap: balance`/`pretty`. Press micro-interactions. Skeleton loaders (dashboard stats, step catalogue, dictionary list). View Transitions between pages. Accent colour reserved for primary actions and active states. |
| Accessibility | Follows the OS reduce-motion and contrast settings (`prefers-reduced-motion`, `prefers-contrast`), with manual overrides. Focus rings use the accent colour. `scrollbar-gutter: stable` prevents layout shift. `overscroll-behavior: contain` in menus and sheets. |
| Navigation | Deep links (`#/dictionary-inspector`, `#/features/editor`) that work with back/forward and can be shared. Copy link to this page. Focus mode (Ctrl/Cmd+.). Explorer toggle (Ctrl/Cmd+B). |
| Onboarding | Getting-started checklist with progress on the Dashboard; open items link to the right page. |
| Efficiency | The health check pauses while the tab is hidden. Installable as a PWA (manifest, icon, `theme-color`, `viewport-fit=cover`). |

### UI primitives (Radix)

All interactive controls are built on Radix UI primitives, wrapped in `src/radix.tsx`:

| Control | Radix package | Wrapper |
| --- | --- | --- |
| Right-click menus | `@radix-ui/react-context-menu` | `RowMenu`, `AppMenu` |
| ⋯ menus (tab bar, card hover) | `@radix-ui/react-dropdown-menu` | `Dropdown` |
| Dropdown selects | `@radix-ui/react-select` | `Select`, `FormikSelect` |
| Checkboxes | `@radix-ui/react-checkbox` | `Checkbox` |
| Buttons | `@radix-ui/react-slot` | `Button` (variants `primary`, `soft`, `ghost`, `success`; sizes `small`, `tiny`) |

- **Buttons:** `asChild` lends a button's styling to another element.
- **Menus:** context menus and dropdown menus are built from the same entry list (`MenuEntries`), so right-click and ⋯ always show identical actions.
- **Selects:** Radix Select can't use an empty value, so the "all" options map to an internal placeholder value.

### Form validation

Every form uses **Formik** with **Yup** schemas from `src/validators.ts`. Each rule is also unit-tested.
- **When errors show:** after you leave a field, or after a submit attempt. Submit stays disabled while the form is invalid. Server errors appear inline in the form.

| Form | What it rejects |
| --- | --- |
| Workspace settings | Relative repository roots, a target that isn't `.`/folder/`.csproj`, empty or absolute glob lists |
| Record | URLs without `http://`/`https://` or that don't parse |
| New feature | Absolute paths, `..`, backslashes, illegal file characters, non-`.feature` files, non-PascalCase names, paths that already exist |
| Step parameters | Empty values, non-numeric values for numeric types, non-`true`/`false` for booleans, embedded quotes, table rows not wrapped in `|` |
| Run tests | Non-`.csproj` projects, empty or malformed `dotnet test` filters (so the whole suite never runs by accident) |
| Dictionary entry | Non-`.xml` files, empty selector values, duplicate rows, CSS/XPath listed before a stable selector |
| Recording → dictionary | Page names with spaces or symbols, non-`.xml` dictionaries, non-`.cs` page objects |
| Test Generator | Lines not starting with a Gherkin keyword, a first step of And/But, folders in the file name, missing section/field, fill actions with no test data. Problems are listed in a summary before saving. |

The server repeats the critical checks (selector type and value, `.csproj`, `..`), so nothing slips through if the UI is bypassed.

### Usability

**Right-click menus:** secondary actions live in right-click menus. Hovering a card also shows a **⋯** button that opens the same menu.

| Where | Menu actions |
| --- | --- |
| Step cards | Add, inspect evidence, open source, copy pattern, copy as Gherkin, copy location, filter by keyword |
| Selector cards | Copy selector, copy owner.member, open source, filter by type, search the owner |
| Background cards | Reuse, open source, copy steps |
| Dictionary fields | Use in Test Generator, open source, copy Section/Field path, copy first locator, copy field XML, show the section |
| Selector resolution rows | Copy value, copy Playwright locator, copy as XML |
| Recorded actions | Accept top match, undo acceptance, propose a step or dictionary entries, search steps, copy as Playwright C#, remove |
| Validation rows | Open the related file, copy details, re-run |
| Feature explorer files | Open, view source, copy path, new feature beside |
| Feature explorer folders | New feature here, collapse or expand, collapse all, expand all, copy path |
| Project files | Open or view, copy path |

**Keyboard:**
- Ctrl/Cmd+K opens the command palette.
- Alt+1…4 jumps to the primary pages.
- `/` searches feature files, and `?` lists all shortcuts.
- Ctrl/Cmd+S previews a save in the Test Generator, and Ctrl/Cmd+Enter validates.
- Arrow keys move through dictionary fields.
- Esc clears a search box before it closes anything.

**Less on screen at once:**
- The Test Generator steps are collapsible cards that show a one-line summary when closed.
- Generated locator code and dictionary source start collapsed, and code blocks have a copy button.
- Each view has one filled primary button. Secondary actions use ghost buttons or icons.
- Catalogue cards show the source location as muted metadata. Backgrounds show their first three steps.

**Remembered in this browser:** the last page and editor view, the Test Generator draft, the step-type filter, collapsed panels, the project sidebar setting, the selector verification URL, the Project Explorer folder, and recently opened files (listed on the Dashboard).

**Writing scenarios (Test Generator):**
- **Live step check:** each step line shows matched (with a link to its binding), ambiguous, or needs a binding, plus an "N of M steps reuse existing bindings" count.
- **Suggestions:** existing steps are suggested for the line you're typing on. Clicking one replaces that line with the existing step's wording.
- **Faster typing:** + Given / + When / + Then / + And buttons, and Copy-scenario-as-Gherkin.
- **Pick lists:** feature area suggests existing feature folders. Page, section and field suggest existing dictionary entries, and the field list narrows to the chosen section.
- **File status:** the target file shows "Existing file. The scenario will be appended." or "New file. It will be created on save." The filename is turned into PascalCase with `.feature` added when you leave the box.
- **Quick fixes:** failed checks offer **Find similar steps** or **Add dictionary entry**. The second scrolls to the entry form and puts the cursor in it.

**Recorder and editor:**
- **Accept all top matches** in one click. Removing a recorded action can be undone from the toast.
- Arrow keys move through recorded actions, and recent start URLs are suggested.
- Ctrl/Cmd+S previews changes in the feature editor.
- Unsaved edits show a dot in the heading and the browser tab title, and the browser warns before you leave the page.

**Navigation and status:**
- **Command palette commands:** rescan, start recording, new feature, settings, shortcuts, diagnostics, and the guided tour. Recently visited pages are listed first.
- **Status signals:**
  - The browser tab title shows the current page.
  - A thin progress bar appears while work is running.
  - A banner appears if the local API stops responding, with a Retry button.
  - The sidebar shows when the repository was last scanned ("Scanned 2 min ago").
  - Error banners have a copy button.
  - A back-to-top button appears on long pages.
- **Dashboard:** a "Continue where you left off" card reopens your Test Generator draft.
- **Dictionary Inspector:** the last field you inspected is selected again when you return. **Needs attention** shows only fields with brittle, XPath or unsupported selectors.
- **Step Catalog:** the search box is focused when the page opens. **Clear** resets the search and filters. Empty results suggest example searches.

**Small conveniences:**
- Search terms are highlighted in results.
- An "Unused" filter shows bindings no feature uses yet.
- Project Explorer has clickable breadcrumbs.
- The project-model sidebar can be hidden.
- Validation results clear when you change inputs, so stale results are never shown.
- Enter on a step card adds it.
- Enter in the dictionary field finder picks the first match.
- The Test Generator has a reset button.

### Test Generator

1. **Scenario & feature context.** Feature area, target `.feature` file, scenario name, and Gherkin steps.
2. **Page object & locator mapping.** Page, section, field, field type, action, and test data. "Find an existing dictionary field" fills these from the index.
3. **Selector resolution.** Shows the matched `<Field>` XML, every selector in document order with its rule priority, and the generated Playwright call for the first supported selector. **Verify in browser** counts matches on the live recording page, or on a URL you enter. If the field doesn't exist yet, you enter selectors in priority order, choose an existing or new dictionary file, and preview the XML diff.
4. **Validation & quality gate.** The §12 checks, each shown as passed, review, failed or skipped:
   - **Step pattern match:** every step resolves to exactly one binding (regex or Cucumber expression).
   - **Dictionary existence:** the page, section and field are found after normalization.
   - **Field has selectors:** at least one selector uses a supported type.
   - **Selector stability:** the first selector's priority, plus brittle, XPath and generated-id warnings.
   - **Lifecycle compliance:** `[BeforeScenario]`/`[AfterScenario]` browser hooks exist, and no step definition launches a browser.
   - **Output directory check:** the nearest `.csproj` copies or embeds the dictionary (MSBuild globs are evaluated).
   - **Naming & folder conventions:** `Features/<Area>/<PascalCase>.feature`.
5. **Actions:**
   - **Regenerate code & save** appends the scenario to the feature file. It shows a diff and writes only after approval.
   - **Run dry-run validation** writes nothing.
   - **Export to feature file** opens the result in the editor.

A sidebar shows the project model and highlights the files the current test touches.

## Workflow

1. **Configure.** Open Config and select the repository root and a project directory or `.csproj`. Set the source, feature, and XML globs, the ignored directories, and whether to scan direct references. The last working config is saved to `.local/workspace.json`.
2. **Scan.** Search steps, backgrounds, selectors and dictionary fields. Inspect binding parameters, usages, source locations, and call evidence.
3. **Build a scenario.** Use the Test Generator, or add steps from the catalogue or the command palette. Fill in parameters, reorder steps, and optionally switch to a Scenario Outline.
4. **Record.** Launch Chromium from the recorder. You can pause, resume, and stop. The studio captures navigation, clicks, input, and the Enter, Tab, and Escape keys.
5. **Match.** The studio ranks each recorded action against existing bindings. Accept candidates explicitly.
6. **Fill gaps.**
   - For unmatched actions, **Propose dictionary entries** creates Section/Field/Selector entries from the recorded test id, role and accessible name. It never invents CSS or XPath. It also creates a new page object whose methods resolve through the dictionary. Each file is written only after its own diff approval.
   - Existing fields are reused. New selectors are appended without reordering existing ones.
   - **Propose a step** creates Gherkin wording or a C# binding scaffold.
7. **Write.** Every write goes through a previewed diff and **Approve and write**. A file changed outside the app invalidates stale previews. The app never commits.
8. **Run (optional).** Select **Run tests** and give a `.csproj` and a `dotnet test --filter` expression. This is the only path that executes repository code.

The **Feature explorer** mirrors repository paths at any depth. **Guide me** starts a tour that never records or writes anything.

## Search architecture

The client never downloads full collections. One worker thread per scan hosts FlexSearch indexes for every collection:

```text
Step catalogue / autocomplete / palette ─> GET /api/steps         ─┐
Selector catalogue                      ─> GET /api/selectors     ─┤
Background catalogue                    ─> GET /api/backgrounds   ─┼─> WorkspaceSearch ─> worker (FlexSearch)
Dictionary inspector / generator        ─> GET /api/dictionaries  ─┘    collections × facets (keyword / locator type)
```

- **Normalization:** camelCase is split, accents are stripped, and a small fixed alias table maps verb forms (for example, `clicked` → `click`). This is deterministic, not AI.
- **Capped responses:** `limit` is at most 50 and `q` at most 200 characters. Responses include `items`, `hasNext`, an exact `total` (capped at 100,000 matches) and `indexedTotal`.
- **Stats-only workspace payload:** `/api/workspace` returns counts only. Features load on demand through `/api/feature`, and binding call evidence through `/api/step`.
- **Workspace changes:** a rescan replaces the worker and rejects its pending searches.

## Dictionary authoring

- **Parsing:** `Page → Section → Field → Selector` is parsed with SAX, so each field and selector carries its own line number.
- **Matching:** section and field lookups normalize spaces, `/`, `(` and `)`, and ignore case.
- **Writing:** merges are text-based, so comments, formatting and selector order survive. A new selector is appended, a new field goes at the end of its section, and a new section goes at the end of the page. A missing file is created with a `<Page>` root.
- **Static preview vs browser verification:** a static preview shows XML order and rule priority only. A browser verification reports per-selector results (verified, multiple matches, no match, error) and which selector the page would resolve to. Results are labeled with the page URL they came from, with the query string and fragment removed.

## Layout

| Path | Contents |
| --- | --- |
| `server/core.ts` | Workspace resolution, Gherkin parsing, index assembly, classification, action matching |
| `server/stepSearch.ts`, `server/search-worker.mjs` | Worker-backed search for steps, selectors, dictionaries, backgrounds |
| `server/dictionaries.ts` | Dictionary XML parsing, ranking, warnings, text merge, field proposals |
| `server/validation.ts` | Quality gate checks, including MSBuild output inclusion |
| `server/projectModel.ts` | Layer classification, packages, frameworks, indicators |
| `server/recorder.ts` | Playwright capture, redaction, selector verification |
| `server/proposals.ts` | C# binding scaffolds and dictionary-backed page objects |
| `scanner/` | Roslyn static scanner. It never runs MSBuild or project code |
| `src/` | React client: `App.tsx` shell, `Dashboard`, `TestGenerator`, `DictionaryInspector`, `SelectorResolution`, `ProjectExplorer`, `Catalogues`, `StepCatalogue`, `SearchPalette`, `RecordingDictionary`, `DiffApproval` |
| `fixtures/` | Small sample repository (features, steps, hooks, a checkout dictionary, a `.csproj`). It is not executable |

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
- **Matching:** ranking, Cucumber expressions.
- **Recording:** redaction, real Chromium capture, pause and stop.
- **Safety:** path confinement, preview approval, external file changes, one-time apply tokens.
- **Dictionaries and validation:** XML merge order, field proposals, MSBuild globs, the quality gate on fixtures, project model, worker search totals, and browser selector verification.
- **UI:** catalogue-to-builder authoring and mobile overflow.

E2E tests run serially because they share one API workspace.

## Status

### Done

- **Scanning:** Roslyn scanning of steps, page objects, locator calls and call evidence. Supports Cucumber expressions and `[Scope]` (tag, feature, scenario).
- **Gherkin:** parsing and a full-syntax editor.
- **Authoring UI:** scenario builder with outlines and backgrounds, and a feature explorer with nested folders.
- **Pages:** Dashboard, Test Generator, Project Explorer, Dictionary Inspector and Config.
- **Recording:** Playwright recorder with redaction, and deterministic matching of recorded actions to bindings.
- **Recording to dictionary to page object:** proposals for unmatched actions.
- **Dictionaries:** new dictionary files and entries, merged without reordering. Browser-verified selector matches, kept separate from static previews.
- **Validation gate:** step match, dictionary, selector stability, lifecycle, build output and conventions.
- **Search:** worker-backed search for every collection, with exact totals and capped, paged responses.
- **Writes:** diff preview, approved writes and stale-preview protection.
- **Running:** optional `dotnet test` execution.
- **Tooling:** guided tour, CLI, unit tests and E2E tests.

### Todo

- [ ] **More recorder actions.** Uploads, downloads, drag-and-drop, assertions, frame identity, and shadow-DOM chains.
- [ ] **Multi-action steps.** Compress several actions into one binding, and infer assertions.
- [ ] **Environment and browser selection.** The context bar shows Chromium only. Target environments are not modeled.
- [ ] **Generator step bindings.** The Test Generator doesn't scaffold missing bindings for scenario steps yet. Use the recorder's **Propose a step** instead.
- [ ] **Optional integrations.** AI ranking, an MCP server, and IDE extensions.

## Boundaries

- **The sample repository is not executable.** Running tests needs your real project with its SDK, package restore, browsers, and configuration.
- **Static analysis only.** Roslyn parses source without MSBuild. It does not guess about external assemblies, reflection, dynamic selectors, or unresolved calls. Direct references are scanned but not built.
- **Regex limits.** Binding regexes run on the .NET engine with a 100 ms timeout. Cucumber expressions support `{int}`, `{float}`, `{word}`, `{string}`, `{}`, custom types (treated as `.*`), and optional text `(s)`. Alternation (`a/b`) is not supported.
- **Heuristic scores.** Ranking scores are evidence, not probabilities.
- **Scaffolds are not verified code.** New C# scaffolds throw until you choose a verified locator. The generated `DictionaryFieldResolver` is a starting point; replace it with your repository's resolver if one exists (the notes list candidates). Existing C# files are never replaced.
- **Browser verification is a snapshot.** It reflects the page state at that moment, after the page loads, with no login or navigation beyond the URL.
- **Redaction.** Passwords and recognizable secret fields are redacted. URL credentials, query strings, and fragments are stripped. Secrets typed into ordinary unlabeled fields cannot be detected.
- **Local only.** The service binds to loopback only and rejects unexpected origins and hosts. All reads and writes are confined to the selected repository, including symlink checks. Do not expose it publicly.
