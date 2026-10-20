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
| QL10 | Enter adds a table row | Gherkin | ✅ 2026-10-20 |
| QL11 | Align pasted table rows | Gherkin | ✅ 2026-10-20 |
| QL12 | Explorer remembers collapsed folders | Explorer | ✅ 2026-10-20 |
| QL13 | Explorer arrow keys | Explorer | ✅ 2026-10-20 |
| QL14 | Explorer: type to select | Explorer | ✅ 2026-10-20 |
| QL15 | Explorer: Enter opens and moves to the editor | Explorer | ✅ 2026-10-20 |
| QL16 | Explorer: middle-click keeps the tab | Explorer | ✅ 2026-10-20 |
| QL17 | Copy actions confirm what they copied | Explorer / Tabs | ✅ 2026-10-20 |
| QL18 | Drag a file onto a folder to move it | Explorer | ✅ 2026-10-20 |
| QL19 | Active tab scrolls into view | Tabs | ✅ 2026-10-20 |
| QL20 | Double-click the tab bar for a scratch file | Tabs | ✅ 2026-10-20 |
| QL21 | Search remembers the last search | Search | ✅ 2026-10-20 |
| QL22 | Search results by keyboard | Search | ✅ 2026-10-20 |
| QL23 | Search: the found text is selected | Search | ✅ 2026-10-20 |
| QL24 | Test Explorer remembers its view | Test Explorer | ✅ 2026-10-20 |
| QL25 | Test Explorer shows the first failure | Test Explorer | ✅ 2026-10-20 |
| QL26 | Test run elapsed time | Test Explorer | ✅ 2026-10-20 |
| QL27 | Test Explorer explains an empty tree | Test Explorer | ✅ 2026-10-20 |
| QL28 | Commit message draft kept | Git | ✅ 2026-10-20 |
| QL29 | Commit message hints | Git | ✅ 2026-10-20 |
| QL30 | Build time in the status bar | Build | ✅ 2026-10-20 |

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
- 2026-10-20 QL10: Enter at row end adds an aligned row
- 2026-10-20 QL11: Pasted rows aligned
- 2026-10-20 QL12: Collapsed folders kept after reload
- 2026-10-20 QL13: Up/Down/Home/End, Right/Left expand/collapse
- 2026-10-20 QL14: Typing jumps to the matching row
- 2026-10-20 QL15: Enter keeps the tab and focuses the editor
- 2026-10-20 QL16: Middle-click opens a normal tab
- 2026-10-20 QL17: Notice after Copy path / name
- 2026-10-20 QL18: Drop on a folder moves (confirmed)
- 2026-10-20 QL19: Active tab always visible
- 2026-10-20 QL20: Tab bar double-click: New Scratch File
- 2026-10-20 QL21: Query, options and filters kept after reload
- 2026-10-20 QL22: Down into results, Up/Down, Enter
- 2026-10-20 QL23: Opening a result selects the match
- 2026-10-20 QL24: Collapsed groups and search kept
- 2026-10-20 QL25: First failed test selected after a run
- 2026-10-20 QL26: running N s while tests run
- 2026-10-20 QL27: Why no tests + Refresh
- 2026-10-20 QL28: Draft survives reload
- 2026-10-20 QL29: 72-char summary, blank second line
- 2026-10-20 QL30: Building… N s
