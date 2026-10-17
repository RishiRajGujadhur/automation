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
| N2 | Hooks: index every hook (`BeforeScenario`… with tags, `Order`, `[Scope]`) and **Go To Hooks** from a scenario | ⬜ |
| N3 | **Define Steps** for every unbound step of a feature: class name, Create file or Copy methods (Cucumber expressions, DataTable / DocString parameters) | ⬜ |
| N4 | **Find unused step definitions** | ⬜ |
| N5 | Highlighting like the extension: unbound steps, bound steps, parameters in bound steps | ⬜ |
| N6 | Gherkin formatting from `.editorconfig` (`gherkin_indent_*`, cell padding, right-aligned numbers) | ⬜ |
| N7 | Scenario Outline checks: placeholders missing from Examples, unused Examples columns | ⬜ |

## Progress log
- 2026-10-17 — **Step matching like Reqnroll (N1).** Scanner and TypeScript matcher share Reqnroll's rules: expression detection (`^…$` regex; `{…}` Cucumber; regex syntax regex; otherwise Cucumber) with the attribute's `ExpressionType` winning; Cucumber optional text `(s)`, alternatives `belly/tummy`, escapes `\(`, and every parameter type (`{int}` `{long}` `{byte}` `{float}` `{double}` `{decimal}` `{word}` `{string}` `{}` `{DateTime}` `{Guid}`, enums and named transformations); `[StepDefinition]` binds any keyword (and shows under every keyword in completion); scoped bindings win over unscoped ones and the most specific scope wins, equal scopes stay ambiguous; Reqnroll's `DataTable` accepted as a trailing argument. Tests: `tests/reqnrollMatch.test.ts` (the examples from the Reqnroll docs).
