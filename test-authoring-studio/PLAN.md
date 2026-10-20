# Test Design & Algorithms Plan

Goal: add deterministic (non-AI) test-design algorithms to TestAuthoring Studio, surface them in a new **Test Design** page and in the Gherkin editor, and let every algorithm be switched on or off in **Settings → Algorithms** (each row has a tooltip explaining it).

Libraries researched (2026-10): **covertable** (TypeScript pairwise generator, Apache-2.0) is used as an extra generator. **graphology/graphlib** (graphs), **talisman/natural** (string metrics, phonetics, stemming) and **pict-node** (needs the PICT binary) were considered; the studio keeps small hand-written, unit-tested implementations instead so every algorithm runs in the browser with no native binary and can be switched off individually. Research references: IPOG (Lei, Kacker, Kuhn et al., NIST), AETG (Cohen et al.), test-suite minimization with greedy set cover / HGS, prioritization (Rothermel et al. additional greedy; Jiang et al. ART; APFD), flaky-test flip rate & entropy (Kowalczyk et al.), BDD duplicate-step detection (cukereuse, 2026; Binamungu et al.), prime-path coverage (Ammann & Offutt).

Architecture:
- `src/algorithms/*.ts` — pure, unit-tested TypeScript modules (no React).
- `src/algorithms/registry.ts` — one entry per algorithm: `id`, `name`, `category`, `tooltip`, `defaultEnabled`.
- `prefs.algorithms` — `Record<id, boolean>` overrides, read with `useAlgorithm(id)` / `isAlgorithmEnabled(id)`.
- `src/TestDesign.tsx` — the Test Design page (tools: Examples generator, Flow generator, Step library, Suite optimizer, Duplicates & smells, Flaky analysis, Plans & filters, Living docs, Text lab).
- `GET /api/design/corpus` — all features (with steps/tags) and bindings for the client-side tools.

Legend: `[x]` done · `[ ]` to do. Each feature group is committed and pushed when finished.

## Features

- [x] F1 Algorithm registry, `prefs.algorithms`, Settings → Algorithms section with switch + tooltip per algorithm, enable/disable all, per category
- [x] F2 Test Design page (Advanced ⋯ menu + command palette + deep link `#/test-design`)
- [x] F3 Combinatorial Examples generator (IPOG etc.) → Scenario Outline Examples table
- [x] F4 Step library: reusable steps with parameters, usage counts, rename-everywhere refactor preview
- [x] F5 Editor: trie autocomplete from the feature corpus, duplicate-step and smell lint
- [x] F6 Suite optimizer (greedy set cover over tags/requirements) and prioritization
- [x] F7 FSM flow → scenarios generator
- [x] F8 Tags, saved filters (tag expressions), test plans / cycles
- [x] F9 Living documentation export (HTML/Markdown) with pass/fail status from imported results
- [x] F10 Flaky analysis from imported JUnit / Cucumber JSON history

## Algorithms (94)

### A. Combinatorial design (16)
- [x] A1 `ipog` IPOG (t-way)
- [x] A2 `aetg` AETG
- [x] A3 `covertable` covertable (PICT-style)
- [x] A4 `cartesian` All combinations
- [x] A5 `each-choice` Each-choice
- [x] A6 `base-choice` Base-choice
- [x] A7 `random-sample` Seeded random sampling
- [x] A8 `bva` Boundary value analysis
- [x] A9 `equivalence` Equivalence partitioning
- [x] A10 `constraints` Constraint rules
- [x] A11 `seeds` Seed rows
- [x] A12 `tway-coverage` t-way coverage meter
- [x] A13 `orthogonal` Orthogonal arrays
- [x] A14 `decision-table` Decision tables
- [x] A15 `quine-mccluskey` Quine–McCluskey minimization
- [x] A16 `weighted-values` Weighted values

### B. String similarity (14)
- [x] B1 `levenshtein` Levenshtein ratio
- [x] B2 `damerau` Damerau–Levenshtein
- [x] B3 `jaro-winkler` Jaro–Winkler
- [x] B4 `lcs` Longest common subsequence
- [x] B5 `jaccard` Token Jaccard
- [x] B6 `dice` Sørensen–Dice
- [x] B7 `tfidf-cosine` TF-IDF cosine
- [x] B8 `ncd` Compression distance (NCD)
- [x] B9 `simhash` SimHash
- [x] B10 `minhash` MinHash + LSH
- [x] B11 `soundex` Soundex
- [x] B12 `metaphone` Metaphone
- [x] B13 `porter` Porter stemmer
- [x] B14 `ngram` Character n-grams

### C. Search & autocomplete (9)
- [x] C1 `trie` Prefix trie autocomplete
- [x] C2 `fuzzy` Fuzzy subsequence scoring
- [x] C3 `bm25` BM25 ranking
- [x] C4 `bktree` BK-tree "did you mean"
- [x] C5 `inverted-index` Inverted index
- [x] C6 `stopwords` Stop-word removal
- [x] C7 `synonyms` Synonym expansion
- [x] C8 `frecency` Frecency ranking
- [x] C9 `aho-corasick` Aho–Corasick highlighting

### D. Step library (9)
- [x] D1 `template-inference` Step template inference
- [x] D2 `param-types` Parameter type inference
- [x] D3 `union-find` Union-find clustering
- [x] D4 `hac` Hierarchical clustering
- [x] D5 `dbscan` DBSCAN
- [x] D6 `rename-refactor` Rename everywhere
- [x] D7 `cucumber-to-regex` Cucumber → regex
- [x] D8 `regex-to-cucumber` Regex → Cucumber
- [x] D9 `keyword-resolution` And/But resolution

### E. Model-based testing (14)
- [x] E1 `fsm-parse` State-machine model
- [x] E2 `bfs` BFS shortest path
- [x] E3 `simple-paths` All simple paths
- [x] E4 `state-coverage` State coverage
- [x] E5 `transition-coverage` Transition coverage
- [x] E6 `n-switch` N-switch coverage
- [x] E7 `prime-paths` Prime path coverage
- [x] E8 `chinese-postman` Chinese postman tour
- [x] E9 `hierholzer` Hierholzer Euler circuit
- [x] E10 `dijkstra` Dijkstra weighted path
- [x] E11 `tarjan` Tarjan SCC
- [x] E12 `kahn` Kahn topological sort
- [x] E13 `reachability` Reachability / dead states
- [x] E14 `random-walk` Random walks

### F. Suite optimization (10)
- [x] F1 `greedy-set-cover` Greedy set cover
- [x] F2 `weighted-set-cover` Weighted set cover
- [x] F3 `hgs` Harrold–Gupta–Soffa
- [x] F4 `exact-cover` Exact minimum (branch and bound)
- [x] F5 `simulated-annealing` Simulated annealing
- [x] F6 `genetic` Genetic algorithm
- [x] F7 `total-greedy` Total-greedy prioritization
- [x] F8 `additional-greedy` Additional-greedy prioritization
- [x] F9 `art` Adaptive random prioritization
- [x] F10 `apfd` APFD metric

### G. Results & flakiness (8)
- [x] G1 `junit-parse` JUnit XML import
- [x] G2 `cucumber-json` Cucumber JSON import
- [x] G3 `flip-rate` Flip rate
- [x] G4 `entropy` Outcome entropy
- [x] G5 `flaky-score` Flakiness score
- [x] G6 `wilson` Wilson interval
- [x] G7 `ewma` EWMA trend
- [x] G8 `beta-posterior` Bayesian failure rate

### H. Gherkin quality (10)
- [x] H1 `smell-missing-then` Scenario without Then
- [x] H2 `smell-long` Long scenario
- [x] H3 `smell-conjunction` Conjunction step
- [x] H4 `smell-imperative` Imperative UI detail
- [x] H5 `smell-order` Keyword order
- [x] H6 `smell-outline` Outline/Examples mismatch
- [x] H7 `scenario-fingerprint` Duplicate scenarios
- [x] H8 `smell-dup-names` Duplicate scenario names
- [x] H9 `flesch` Flesch reading ease
- [x] H10 `duplicate-step-lint` Near-duplicate step lint

### I. Tags, plans & docs (4)
- [x] I1 `tag-expression` Tag expressions
- [x] I2 `tag-cooccurrence` Tag co-occurrence
- [x] I3 `status-rollup` Status roll-up
- [x] I4 `living-docs` Living documentation

## Quality-of-life improvements (25)
- [x] Q1 Enable all / disable all / reset algorithms to defaults
- [x] Q2 Per-category toggle in Settings → Algorithms
- [x] Q3 "N of M algorithms on" count in settings
- [x] Q4 Tooltip (ⓘ) on every algorithm row
- [x] Q5 Disabled tools show an explanation and a "Turn on" button
- [x] Q6 Test Design remembers the last tool tab
- [x] Q7 Test Design tools in the command palette
- [x] Q8 Generator inputs persisted as a draft
- [x] Q9 Load sample data button in each tool
- [x] Q10 Copy result as Gherkin / Markdown
- [x] Q11 Download results (.feature, .csv, .html, .md)
- [x] Q12 Import parameters from CSV
- [x] Q13 Reproducible seed input for random algorithms
- [x] Q14 Row-count explosion warning before Cartesian product
- [x] Q15 Coverage meter for generated tables
- [x] Q16 Open the generated scenario in the feature editor
- [x] Q17 Drag-and-drop result files
- [x] Q18 Saved filters & plans persisted per browser
- [x] Q19 Empty states that explain what to do next
- [x] Q20 Similarity threshold slider for duplicate detection
- [x] Q21 Click a finding to open the file at the line
- [x] Q22 Rename refactor shows a preview diff before writing
- [x] Q23 Algorithm picker remembers its choice
- [x] Q24 Print-friendly living docs
- [x] Q25 Keyboard shortcut for Test Design (Alt+5 in Advanced mode)

## Algorithms, batch 2 (46) — added 2026-10-11

Researched: ISO/IEC/IEEE 29119-4 technique catalogue (classification tree, cause–effect graphing, decision tables, MC/DC), covering arrays by simulated annealing (Cohen et al.), test impact analysis (change-based selection), flaky-test quarantine policies, defect prediction (logistic regression, naive Bayes), requirements traceability matrices, requirements-smell detection (vague words, passive voice).

### J. Logic & specification techniques (12)
- [x] J1 `mcdc` MC/DC test set (independence pairs per condition)
- [x] J2 `condition-coverage` Condition coverage
- [x] J3 `decision-coverage` Decision (branch) coverage
- [x] J4 `multiple-condition` Multiple-condition coverage
- [x] J5 `cause-effect` Cause–effect graphing → decision table
- [x] J6 `classification-tree` Classification tree method
- [x] J7 `domain-testing` Domain testing ON/OFF points
- [x] J8 `value-catalog` Heuristic test-value catalogue (error guessing)
- [x] J9 `sa-covering` Simulated-annealing covering arrays
- [x] J10 `table-reducer` Examples table reducer (keep t-way coverage)
- [x] J11 `missing-pairs` Uncovered combinations report
- [x] J12 `sneak-paths` Invalid transition (sneak path) tests

### K. Model-based testing, more (6)
- [x] K1 `floyd-warshall` All-pairs shortest paths
- [x] K2 `cyclomatic` Cyclomatic complexity of a flow
- [x] K3 `basis-paths` Basis path set
- [x] K4 `yen-k-shortest` Yen's k shortest paths
- [x] K5 `markov-usage` Markov usage model (most probable paths, stationary distribution)
- [x] K6 `pagerank` PageRank of states (hub states)

### L. Impact, traceability & risk (10)
- [x] L1 `test-impact` Change-based test selection (changed C# files → scenarios)
- [x] L2 `rtm` Requirements traceability matrix from tags
- [x] L3 `risk-score` Risk-based prioritization (likelihood × impact)
- [x] L4 `quarantine` Flaky-test quarantine policy
- [x] L5 `knapsack` Time-budget selection (0/1 knapsack)
- [x] L6 `pareto` Pareto front of suite size vs coverage
- [x] L7 `logistic-regression` Failure prediction (logistic regression)
- [x] L8 `naive-bayes` Failure prediction (naive Bayes)
- [x] L9 `kmeans` k-means scenario themes
- [x] L10 `silhouette` Silhouette score (choose k)

### M. Results statistics (7)
- [x] M1 `cusum` CUSUM change-point detection
- [x] M2 `sprt` Sequential probability ratio test (rerun decision)
- [x] M3 `mann-kendall` Mann–Kendall duration trend
- [x] M4 `mad-outliers` Slow-test outliers (median absolute deviation)
- [x] M5 `percentiles` Duration percentiles (p50/p90/p95)
- [x] M6 `mtbf` Mean runs between failures
- [x] M7 `co-failure` Co-failure clusters (shared root cause)

### N. Text & sequences (11)
- [x] N1 `gunning-fog` Gunning fog index
- [x] N2 `lexical-diversity` Lexical diversity (type–token ratio)
- [x] N3 `passive-voice` Passive voice detection
- [x] N4 `vague-words` Vague/ambiguous wording (requirements smells)
- [x] N5 `rake` RAKE keyword extraction
- [x] N6 `next-step` Next-step suggestions (step n-gram Markov model)
- [x] N7 `sequence-mining` Frequent step sequences → Background candidates
- [x] N8 `needleman-wunsch` Scenario alignment (Needleman–Wunsch)
- [x] N9 `apriori` Tag association rules (Apriori: support, confidence, lift)
- [x] N10 `hamming-steps` Step-sequence Hamming distance for same-length scenarios
- [x] N11 `entropy-tags` Tag entropy (how evenly tags spread across scenarios)

## Layout & presets (2026-10-11)
- [x] P1 VS Code layout (default) in the web app and desktop app: activity bar, slim title bar with command centre, explorer side bar, full-height editor, accent status bar; Classic tab layout kept in Settings → Appearance → Layout
- [x] P2 Algorithm presets: Essentials (default), BDD authoring, Combinatorial & logic, Model-based, Regression & CI, Minimal, Everything, Custom
- [x] P3 Individual algorithm switches only under Custom (Custom starts from the current preset); Turn on buttons switch to Custom
- [x] P4 Desktop View menu: Layout and Algorithm Preset submenus

- [x] P5 Activity bar overflow: pages that don't fit the window height move into a ☰ menu (active page stays visible); title-bar breadcrumb truncates instead of overlapping
- [x] P6 VS Code density: 8px gutters, flat 4px panels, 34px panel headers, compact recorder toolbar/action cards, tighter explorer and Test Design
- [x] P7 Editor/builder/recorder flush against the title bar and explorer; Basic/Advanced moved from the toolbar to Settings → General; title-bar heading smaller, ellipsis, full name on hover
- [x] P8 Test Generator: new Step 0 (feature area, target file, scenario name); Step 1 is a full-height scenario editor with step hints beside it
- [x] Bug: desktop app took port 4310 (the web dev API's port); on Windows both bound it and the web app's POSTs were rejected with "Origin not allowed". Desktop now uses its own stable port 47310; the web API refuses to start when its port is taken
- [x] P9 Project model panel hidden by default (Settings → General → Show project model); Test Generator edge to edge; step titles, SCENARIO TEXT label and step counter moved to screen-reader only; decorative labels removed (NORMALIZED IR, DETERMINISTIC, Rules §, status-bar slogans; status bar shows the repository)

## Recording, C# and Solution Explorer (2026-10-11)
Reference: Visual Studio Solution Explorer (Microsoft Learn "Use Solution Explorer"): solution/project/dependencies tree, file nesting, Sync with Active Document, pending-changes filter, collapse all, search.
- [x] G1 Test Generator density: keyword buttons move into the hints column header; editor and hints fill the step with no empty bands
- [x] G2 Record steps with Playwright from the Test Generator: recorded actions become Gherkin lines (existing bindings when matched, proposed wording otherwise); missing bindings are highlighted by the step check
- [x] G3 Recording updates selectors: choose an existing dictionary XML or a new file (same Page → Section → Field → Selector format); new fields only, previewed as a diff before writing
- [x] G4 Create a step definition for an unbound step: pick an existing step class (default: the feature's associated one) or a new file; the method is appended, previewed, written, then opened at its line
- [x] G5 C# editor: open .cs files, C# syntax highlighting, Roslyn syntax diagnostics plus binding checks (parameters vs. pattern groups, duplicate patterns), save with diff
- [x] G6 Feature ↔ C# association: the step files a feature's steps bind to (plus naming convention); nested under the feature in the explorer; F12 goes to a step's definition
- [x] G7 Auto save (Settings → Code editor): Off / After delay / On focus change, like VS Code; unsaved buffers are always kept and restored; disk writes refuse files changed outside the studio
- [x] G8 Solution Explorer (Visual Studio style): Solution → projects → Dependencies → folders → files with file nesting, toolbar (Sync with active document, pending changes filter, collapse all, show all files), search (Ctrl+;), context menu

## Debugger (2026-10-11)
Reference: Visual Studio debugger (breakpoints, Step Into/Over/Out, Locals, Watch, Call Stack). Engine: netcoredbg (Samsung, MIT) over the Debug Adapter Protocol; `dotnet test` runs with VSTEST_HOST_DEBUG and the debugger attaches to the test host. SpecFlow/Reqnroll code-behind carries `#line` directives, so .feature lines are real breakpoint locations.
- [x] H1 Breakpoints in .feature and .cs editors: click the left margin or F9; red dots follow edits; kept per browser and sent to the live session; Breakpoints window (go to, delete, delete all)
- [x] H2 Start Debugging (F5, or Debug ▸ feature / one scenario): builds the owning .csproj, filters to the feature's generated test class (or the scenario's method), attaches, stops at breakpoints
- [x] H3 Stepping like Visual Studio: Continue (F5), Step Over (F10), Step Into (F11, from a Gherkin step into its C# step definition), Step Out (Shift+F11), Break All, Stop (Shift+F5), Restart (Ctrl+Shift+F5); next-statement arrow and line; the stopped file opens automatically
- [x] H4 Locals (expandable), Watch 1 (add/remove expressions, kept per browser, re-evaluated per frame), Call Stack (switch frames; framework frames collapse to [External Code]), Output, DataTips on hover while paused
- [x] H5 Runnable sample `samples/Calculator` (SpecFlow + NUnit, no browser) and `npm run debugger:setup` to install netcoredbg; desktop app bundles it
- [x] Bug: the code editor's toolbar (save state, Revert, Save…) was hidden behind the title bar (inherited the feature editor's floating-toolbar position)

## Editor tabs, full-screen layout and Open Folder (2026-10-11)
- [x] T1 Full width and height: the editor area, Test Generator, Builder, Dashboard and Dictionary Inspector fill the window (flex layout instead of fixed heights); no page margins in the VS Code layout
- [x] T2 Explorer heading is just "EXPLORER"
- [x] T3 Editor tabs like VS Code: several files open at once, ● for unsaved, ×/middle-click/Ctrl+F4 to close, Close Others / to the Right / All, Ctrl+PageDown/PageUp; when tabs do not fit, ‹ › arrows reveal the next hidden tab and ⌄ lists all open editors; kept per folder
- [x] T4 Save with Ctrl+S or the save icon straight to disk (C# and feature files); Review changes (diff) and Revert stay as icons; File ▸ Save All (Ctrl+Alt+S); edits from this session survive tab switches and reloads
- [x] T5 File menu in the web title bar (New Feature, Open Folder…, Save, Save All, Close Editor, Close All, Close Folder, Preferences); the desktop app's native File menu gains Open Folder…, Save, Save All, Close Editor (Ctrl+W; window close moves to Ctrl+Shift+W)
- [x] T6 Web Open Folder uses the File System Access API: the folder is read and written in place (no upload), the Explorer is built in the browser, files open in tabs and save with Ctrl+S; the folder is reopened on the next visit when the browser allows. Indexing and debugging need the folder's path (the API never reveals it): File ▸ Index Folder with Studio Server…


## JetBrains Rider features (2026-10-18)
- [x] R7–R43 37 Rider features (J1–J37 in `../RIDER.md`): command registry (`src/rider/commands.ts`) shown in the web menu bar (Edit, View, Navigate, Code, Tools, Help), the palette and the desktop's native menus; editor keys in `src/editor/riderKeys.ts`; tool windows (Structure, Hierarchy, Problems, Terminal, Shelf) as tabs of the bottom panel
- [x] Language server ops `symbolId`, `typeHierarchy`, `callers`, `solutionDiagnostics`; server: `/api/problems`, `/api/terminal/*`, `/api/http/send`, `/api/steps/regex`, `/api/related`, `/api/history/recent`, `/api/git/shelves|shelve|unshelve|shelf/delete`
- [x] Bug: editors could only save `.cs` / `.feature` / `.xml` (now any text file: `.csproj`, `.json`, `.md`, `.http`, scripts…); the source reader and the Explorer skipped `.http` and script files

## Desktop documentation review (2026-10-18)
- [x] Review shared UI workflows for the 60-item proposal backlog in `../DESKTOP-QOL.md`; no product behavior changes in this documentation update.
- [x] Refresh the root README with screenshots from the rebuilt Electron host and link the desktop improvement backlog.

## Settings ▸ Features (2026-10-18)
- [x] F1 `src/features.ts`: a switch for every optional feature (the 62 Rider features, plus CodeLens, inlay hints, sticky scroll, change bars, Local History, the TODO window and Search Everywhere), grouped; "essential" = on by default in Visual Studio 2026
- [x] F2 Presets: VS essentials (the desktop app's default) / All features (the web app's default); group switches; single switches; Reset switches
- [x] F3 Off means gone: commands leave the menus, palette and the desktop's native menus; keys do nothing; drawing features are hidden
- [x] Bug: Settings ▸ Storage ▸ Reset card states was commented out by a stray `// Storage` on the same line
- [x] Bug: breakpoints of the previously opened folder stayed on the server and landed on files of the new one (a stale tracepoint broke Step Out)

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
