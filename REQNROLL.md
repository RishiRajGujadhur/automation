# Reqnroll features in the desktop and web apps — progress

Source: [Reqnroll docs](https://docs.reqnroll.net/latest/): the Visual Studio extension
([editing](https://docs.reqnroll.net/latest/ide-integrations/visual-studio/editing-features.html),
[navigation](https://docs.reqnroll.net/latest/ide-integrations/visual-studio/navigation-features.html),
[defining steps](https://docs.reqnroll.net/latest/ide-integrations/visual-studio/defining-steps.html),
[EditorConfig](https://docs.reqnroll.net/latest/ide-integrations/visual-studio/editorconfig.html)) and
[Automation](https://docs.reqnroll.net/latest/automation/index.html) (bindings, hooks, scoped bindings, Cucumber
expressions, step argument conversions).

Already in the app before this work: Gherkin highlighting, keyword and step completion, go to step definition (F12),
find step usages, rename step, comment/uncomment, outlining, table formatting, format document, Create Step for one
step, feature-file debugging, step-usage CodeLens.

Status: ✅ done · 🟡 in progress · ⬜ to do

| # | Reqnroll feature | Status |
| --- | --- | --- |
| N1 | Step matching like Reqnroll: expression detection rules and `ExpressionType`, Cucumber alternatives / optional text / all parameter types, `[StepDefinition]`, scoped-binding precedence | ✅ |
| N2 | Hooks: index every hook (`BeforeScenario`… with tags, `Order`, `[Scope]`) and **Go To Hooks** from a scenario | ✅ |
| N3 | **Define Steps** for every unbound step of a feature: class name, Create file or Copy methods (Cucumber expressions, DataTable / DocString parameters) | ✅ |
| N4 | **Find unused step definitions** | ✅ |
| N5 | Highlighting like the extension: unbound steps, bound steps, parameters in bound steps | ✅ |
| N6 | Gherkin formatting from `.editorconfig` (`gherkin_indent_*`, cell padding, right-aligned numbers) | ✅ |
| N7 | Scenario Outline checks: placeholders missing from Examples, unused Examples columns | ⬜ |

## Progress log
- 2026-10-17 — **Step matching like Reqnroll (N1).** Scanner and TypeScript matcher share Reqnroll's rules: expression detection (`^…$` regex; `{…}` Cucumber; regex syntax regex; otherwise Cucumber) with the attribute's `ExpressionType` winning; Cucumber optional text `(s)`, alternatives `belly/tummy`, escapes `\(`, and every parameter type (`{int}` `{long}` `{byte}` `{float}` `{double}` `{decimal}` `{word}` `{string}` `{}` `{DateTime}` `{Guid}`, enums and named transformations); `[StepDefinition]` binds any keyword (and shows under every keyword in completion); scoped bindings win over unscoped ones and the most specific scope wins, equal scopes stay ambiguous; Reqnroll's `DataTable` accepted as a trailing argument. Tests: `tests/reqnrollMatch.test.ts` (the examples from the Reqnroll docs).
- 2026-10-17 — **Hooks and Go To Hooks (N2).** The scanner indexes every hook attribute (`BeforeTestRun` … `AfterStep`, `Before`/`After` aliases) with its `Order` (default 10000), tag filter (positional or array arguments) and `[Scope]` on the method or class. Feature editor context menu ▸ **Go To Hooks** lists the hooks that run for the scenario at the cursor (feature, scenario and Examples tags; tag filters OR-ed; scopes checked) in execution order (run → feature → scenario → block → step, then the After hooks), sorted by `Order`; clicking one opens it. Test: `tests/e2e/reqnroll.spec.ts`.
- 2026-10-17 — **Define Steps (N3).** Feature editor context menu ▸ **Define Steps…** lists the feature's unbound steps (And/But resolved to their keyword; data table / doc string shown), with a class name (`<Feature>Steps`) and file (beside the existing step definitions; an existing file gets the methods appended to its [Binding] class). **Create…** previews the diff and writes on approval; **Copy methods to clipboard** copies them. Skeletons follow the repository's majority style (Cucumber expressions or regex): quoted values → `{string}`, numbers → `{int}` / `{float}`, Scenario Outline `<placeholder>` → `{}` with a parameter named after the column; a data table becomes a trailing `DataTable` (Reqnroll) / `Table` (SpecFlow) parameter and a doc string a `string docString`; steps with the same pattern are defined once; method bodies throw `PendingStepException`.
- 2026-10-17 — **Find unused step definitions (N4).** Test menu (web and desktop) ▸ **Find Unused Step Definitions** lists the bindings no feature step resolves to (from the index's usage counts, so scoped and Cucumber matching apply), with keyword, pattern, class.method and location; clicking one opens it.
- 2026-10-17 — **Step highlighting (N5).** The feature editor colours unbound steps (purple) and the parameters of bound steps (accent, bold), from the same check that flags unbound steps; marks follow edits until the next check. Fixed on the way: the editor's binding check ignored `[Scope]` and `[StepDefinition]` — it now sends each step's tags (feature + scenario) and feature/scenario names, and the server resolves with Reqnroll's precedence (`resolveStep`), which also returns the parameter spans.
- 2026-10-17 — **Gherkin formatting from .editorconfig (N6).** `/api/editorconfig` resolves the `.editorconfig` chain for a feature file (up to `root = true` or the workspace root; globs `*`, `**`, `?`, `{a,b}`, `[…]`; nearer files and later sections win). When any `gherkin_*` setting (or a `*.feature` section) applies, Format Document (Shift+Alt+F and the menu) uses Reqnroll's rules and defaults: `gherkin_indent_feature_children`, `…_rule_children`, `…_steps`, `…_and_steps`, `…_datatable`, `…_docstring`, `…_examples`, `…_examples_table`, `gherkin_table_cell_padding_size`, `gherkin_table_cell_right_align_numeric_content`, with `indent_style` / `indent_size`; doc strings keep their relative indentation, tags and comments take the next element's level, `# language:` stays at column 0. Without such settings the studio's own layout is unchanged.
