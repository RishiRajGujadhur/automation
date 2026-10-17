# Quality of life & recorder workflow — progress

Goal: quality-of-life improvements and bug fixes across the web and desktop apps, desktop screenshots in the README,
and a seamless **Playwright recording → SpecFlow feature file + XML selector dictionary** workflow.

Status: ✅ done · 🟡 in progress · ⬜ to do

| # | Item | Status |
| --- | --- | --- |
| Q1 | Desktop screenshots in the README (captured from the packaged app by a Playwright script) | ✅ |
| Q2 | Explorer and status bar wording (1 feature file, 1 diagnostic), solution name ellipsis | ✅ |
| R1 | Recorder workflow audit: record → steps → feature file → dictionary entries, end to end | ✅ |
| R2 | Fix: the recorder captured only navigations when the API runs under tsx (web app) — typing and clicks were lost | ✅ |
| R3 | Fix: Stop dropped the actions recorded since the last poll; Stop now takes the final list and matches it | ✅ |
| R4 | Save recording: feature file (new or append) + XML dictionary in one review, drafted steps for unmatched actions | ✅ |

## Progress log
- 2026-10-17 — **README screenshots (Q1).** `test-authoring-desktop/tests/screenshots.spec.ts` (runs only with `TAS_SCREENSHOTS=1`) launches the packaged app on a copy of the Calculator sample and captures the feature editor, C# editor, debugger, Test Explorer, recorder and Start Window into `docs/screenshots/`; README rewritten around them. Fixed on the way (Q2): singular/plural wording in the Explorer summary and status bar, and the solution name now ends in an ellipsis instead of being clipped.
- 2026-10-17 — **Recorder → feature + dictionary (R1–R4).** New end-to-end test (`tests/e2e/recorder-save.spec.ts`) records a real sign-in page through the studio's recorder browser (headless with a CDP port when `STUDIO_RECORDER_CDP=1`, which `playwright.config.ts` sets) and saves it. It found two real bugs: the in-page capture script was a serialized TypeScript function, and `tsx` (the web app's API runner) injects `__name(...)` helpers that do not exist in the page, so every listener died and only navigations were recorded; the script is now plain JavaScript text (`CAPTURE_SCRIPT`). And Stop ignored the actions captured since the last 1 s poll. New **Save recording…** on the recorder page: choose a new feature file (or append to an existing one), feature and scenario names, and a dictionary page/section/file; one review shows the scenario steps (accepted matches + drafted steps named after their dictionary fields, unbound ones marked), the feature diff and the dictionary diff; Save writes both and opens the feature. Clicking into a text field is no longer recorded as a click step. Also: Playwright now waits for the API (`/api/health`) instead of Vite before starting tests.
