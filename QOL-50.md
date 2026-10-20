# Quality of life: 50 improvements (QL1–QL50)

Goal: 50 small improvements to everyday work in the studio (web and desktop apps alike: the desktop app runs the same
UI), each pushed on its own. Desktop-only items stay in [DESKTOP-QOL.md](DESKTOP-QOL.md).

Every improvement is verified by a unit or Playwright test (`tests/e2e/qol50.spec.ts` unless noted).

| # | Improvement | Area | Status |
| --- | --- | --- | --- |
| QL1 | Window title: active file and folder, dot when unsaved | Window | ✅ 2026-10-20 |
| QL2 | Scroll past the end | Editor | ✅ 2026-10-20 |
| QL3 | Find: match counter | Editor | ✅ 2026-10-20 |
| QL4 | Ctrl+click web links | Editor | ✅ 2026-10-20 |
| QL5 | Ctrl+click file:line references | Editor / Navigation | ✅ 2026-10-20 |
| QL6 | Multi-caret count in the status bar | Status bar | ✅ 2026-10-20 |
| QL7 | Drag files into the editor | Explorer / Editor | ✅ 2026-10-20 |
| QL8 | Reopen files where you left them | Editor | ✅ 2026-10-20 |
| QL9 | Gherkin smart indent | Gherkin | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 QL1: Title names the file and workspace folder
- 2026-10-20 QL2: Last line can scroll to the top
- 2026-10-20 QL3: N of M in the find panel
- 2026-10-20 QL4: Underlined URLs open on Ctrl+click
- 2026-10-20 QL5: path:line opens the file there
- 2026-10-20 QL6: N selections
- 2026-10-20 QL7: Explorer drag inserts the path
- 2026-10-20 QL8: Caret restored per file, also after reload
- 2026-10-20 QL9: Indent after Scenario:/Examples:/step ending in :
