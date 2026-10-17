# Spy — GUI object recognition (like Ranorex Spy) — progress

Inspiration: [Ranorex Spy / GUI object recognition](https://www.ranorex.com/ranorex-spy-gui-object-recognition/) —
track an element, browse the element tree, see its properties, build a robust path (RanoreXPath), verify it, and
store it in the object repository. Here, for web pages driven by Playwright: the repository is the XML selector
dictionary (Page → Section → Field → Selector) and the "path" is a dictionary selector (`testid`,
`ariarole.<role>`, `text`, `css`, `xpath`), verified against the live page.

Status: ✅ done · 🟡 in progress · ⬜ to do

| # | Feature | Status |
| --- | --- | --- |
| S1 | Spy engine: Spy browser, **Track** (hover highlight, click selects — the page does not react), element properties (role, accessible name, test id, id, classes, text, attributes, visible / enabled, bounds, ancestor path), element tree, selector candidates ranked by robustness and verified (match count), selector check with highlight, element screenshot | ✅ |
| S2 | Spy page in the studio: URL bar, Track toggle, element browser tree synced with the selection, properties grid, candidates | ⬜ |
| S3 | Selector editor: edit type / value, live match count, Highlight all matches | ⬜ |
| S4 | Add to dictionary (page / section / field, chosen selectors) with diff approval; Copy as Playwright C# | ⬜ |
| S5 | Snapshots: save the page's element tree + properties to a file and browse it offline | ⬜ |
| S6 | Desktop menu / command palette, README screenshot | ⬜ |

## Progress log
- 2026-10-17 — **Spy engine (S1).** `server/spy.ts`: Chromium (headed; headless with a CDP port under tests) with an in-page script (plain JavaScript, see the recorder's tsx lesson) that keeps element ids, draws a Ranorex-style red frame with role / name, swallows clicks while tracking (so links and submits do nothing) and reports the clicked element. Properties: tag, role (explicit or implicit), accessible name (aria-labelledby, aria-label, label, alt, value, text, title, placeholder), test id (`data-testid` / `data-test-id` / `data-test` / `data-qa`), id, classes, text, attributes, visible / enabled, bounds, ancestor path. Candidates in the dictionary's order (test id → role + name → text → unique id / CSS path → XPath), each counted with Playwright locators, unique ones first. API: `/api/spy` (state), `start`, `stop`, `track`, `tree`, `select`, `verify` (count + highlights matches), `screenshot`. Test: `tests/spy.test.ts`.
