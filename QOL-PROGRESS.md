# Quality of life & recorder workflow — progress

Goal: quality-of-life improvements and bug fixes across the web and desktop apps, desktop screenshots in the README,
and a seamless **Playwright recording → SpecFlow feature file + XML selector dictionary** workflow.

Status: ✅ done · 🟡 in progress · ⬜ to do

| # | Item | Status |
| --- | --- | --- |
| Q1 | Desktop screenshots in the README (captured from the packaged app by a Playwright script) | ✅ |
| Q2 | Explorer and status bar wording (1 feature file, 1 diagnostic), solution name ellipsis | ✅ |
| R1 | Recorder workflow audit: record → steps → feature file → dictionary entries, end to end | ⬜ |

## Progress log
- 2026-10-17 — **README screenshots (Q1).** `test-authoring-desktop/tests/screenshots.spec.ts` (runs only with `TAS_SCREENSHOTS=1`) launches the packaged app on a copy of the Calculator sample and captures the feature editor, C# editor, debugger, Test Explorer, recorder and Start Window into `docs/screenshots/`; README rewritten around them. Fixed on the way (Q2): singular/plural wording in the Explorer summary and status bar, and the solution name now ends in an ellipsis instead of being clipped.
