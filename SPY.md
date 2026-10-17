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
| S2 | Spy page in the studio: URL bar, Track toggle, element browser tree synced with the selection, properties grid, candidates | ✅ |
| S3 | Selector editor: edit type / value, live match count, Highlight all matches | ✅ |
| S4 | Add to dictionary (page / section / field, chosen selectors) with diff approval; Copy as Playwright C# | ✅ |
| S5 | Snapshots: save the page's element tree + properties to a file and browse it offline | ✅ |
| S6 | Desktop menu / command palette, README screenshot | ✅ |

## Progress log
- 2026-10-17 — **Spy engine (S1).** `server/spy.ts`: Chromium (headed; headless with a CDP port under tests) with an in-page script (plain JavaScript, see the recorder's tsx lesson) that keeps element ids, draws a Ranorex-style red frame with role / name, swallows clicks while tracking (so links and submits do nothing) and reports the clicked element. Properties: tag, role (explicit or implicit), accessible name (aria-labelledby, aria-label, label, alt, value, text, title, placeholder), test id (`data-testid` / `data-test-id` / `data-test` / `data-qa`), id, classes, text, attributes, visible / enabled, bounds, ancestor path. Candidates in the dictionary's order (test id → role + name → text → unique id / CSS path → XPath), each counted with Playwright locators, unique ones first. API: `/api/spy` (state), `start`, `stop`, `track`, `tree`, `select`, `verify` (count + highlights matches), `screenshot`. Test: `tests/spy.test.ts`.
- 2026-10-17 — **Spy page (S2–S4).** Features ▸ **Spy** (beside Editor / Builder / Recorder): URL bar, **Start Spy**, **Track** toggle (on by default), refresh, Stop. Three panes: **Element browser** (role / tag, accessible name, test id and id badges; small pages open fully, large ones three levels; the selection's path opens and scrolls into view; click selects and highlights in the page), **Properties** (ancestor breadcrumb, general properties, all attributes, element screenshot), **Selectors** (verified candidates with unique / n matches / no match badges, highlight in page, copy as Playwright C#; a selector editor to check any type / value and add it; **Add to dictionary** with page / section / field / file — field name and type from the element — previewed as a diff and written on approval). Test: `tests/e2e/spy.spec.ts` (clicks in the Spy browser over CDP).
- 2026-10-17 — **Snapshots (S5).** **Snapshot** saves the page's element tree, every element's properties and a screenshot as `<host>-<time>.spy.json` (studio data folder, `.local/spy-snapshots`). The **Snapshots** list opens one offline: same tree and properties panes, page screenshot, selectors suggested in the same order but marked *not verified* (highlight / check disabled), **Download** the file, **Close snapshot** returns to the live page. Fixed on the way: Express refuses files under dot-folders, so Playwright trace downloads (`/api/traces/<name>`, from the recorder and from test runs) returned 400 — now served with `dotfiles: 'allow'`; covered by `tests/e2e/downloads.spec.ts`.
- 2026-10-17 — **Menus and README (S6).** Desktop Test menu ▸ **Spy (find elements and selectors)…**, command palette **Spy**, and a bindable shortcut (Tools ▸ Spy). The README screenshot is captured from the packaged app by `tests/screenshots.spec.ts` (Spy browser headless with CDP for the capture).
