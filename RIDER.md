# JetBrains Rider features (desktop and web)

Goal: at least 30 Rider features in the studio. The web and desktop apps stay at parity, and each feature is pushed on its own.
Earlier Rider work (Search Everywhere, Recent Files and Locations, Back/Forward, Bookmarks, Local History, TODO) is tracked in `WORKBENCH.md`.

Shared plumbing:
- `src/rider/commands.ts` holds the registry: id, label, menu, shortcut, run.
- `src/rider/RiderHost.tsx` holds the popups, dialogs and global keys.
- `src/editor/riderKeys.ts` holds the editor keys.
- `src/editor/activeEditor.ts` tracks the last focused editor.
- On desktop, the native Code and Tools menus (plus items in Edit, View and Help) send `rider` commands.

Status: ⬜ todo · ✅ done (date)

| # | Feature (Rider name, shortcut) | Status |
| --- | --- | --- |
| J1 | Extend / Shrink Selection (Shift+Alt+→ / Shift+Alt+←; Ctrl+W stays Close Editor) | ✅ 2026-10-18 |
| J2 | Toggle Case (Ctrl+Shift+U) | ✅ 2026-10-18 |
| J3 | Join Lines (Ctrl+Shift+J) | ✅ 2026-10-18 |
| J4 | Add Selection for Next Occurrence (Alt+J), Unselect (Alt+Shift+J), Select All Occurrences (Ctrl+Alt+Shift+J) | ✅ 2026-10-18 |
| J5 | Start New Line (Shift+Enter) / Start New Line Before Current (Ctrl+Alt+Enter) | ✅ 2026-10-18 |
| J6 | Add Carets to Ends of Selected Lines (Alt+Shift+G) | ✅ 2026-10-18 |
| J7 | Paste from History (Ctrl+Shift+V) | ✅ 2026-10-18 |
| J8 | Insert Live Template (Ctrl+J) | ✅ 2026-10-18 |
| J9 | Surround With (Ctrl+Alt+J) | ✅ 2026-10-18 |
| J10 | Soft-Wrap toggle (View ▸ Active Editor) | ✅ 2026-10-18 |
| J11 | Show Whitespaces toggle | ✅ 2026-10-18 |
| J12 | Change font size with Ctrl+Mouse Wheel, Reset Font Size | ✅ 2026-10-18 |
| J13 | Copy Reference (Ctrl+Alt+Shift+C) | ⬜ |
| J14 | Highlight Usages in File (Ctrl+Shift+F7) | ⬜ |
| J15 | File Structure popup (Ctrl+F12 on desktop, Ctrl+Alt+F12 on the web) | ⬜ |
| J16 | Structure tool window (Alt+7) | ⬜ |
| J17 | Type Hierarchy (Ctrl+H) | ⬜ |
| J18 | Call Hierarchy (Ctrl+Alt+H) | ⬜ |
| J19 | Problems tool window: solution-wide analysis (Alt+3) | ⬜ |
| J20 | Terminal tool window (Alt+F12) | ⬜ |
| J21 | Run Anything (Ctrl twice) | ⬜ |
| J22 | HTTP Client (`.http` / `.rest` files) | ⬜ |
| J23 | Markdown preview | ⬜ |
| J24 | Distraction-Free Mode | ⬜ |
| J25 | Presentation Mode | ⬜ |
| J26 | Hide All Tool Windows (Ctrl+Shift+F12) | ⬜ |
| J27 | Key Promoter (shortcut hints when a command is used from a menu) | ⬜ |
| J28 | Productivity Guide | ⬜ |
| J29 | Tip of the Day | ⬜ |
| J30 | Evaluate Expression (Alt+F8, debugger) | ⬜ |
| J31 | Mute Breakpoints | ⬜ |
| J32 | Check RegExp (step definition patterns) | ⬜ |
| J33 | Compare with Clipboard | ⬜ |
| J34 | Recent Changes (Alt+Shift+C) | ⬜ |
| J35 | Shelf (shelve / unshelve changes; Git stash) | ⬜ |
| J36 | Power Save Mode | ⬜ |
| J37 | Go to Related Files (Ctrl+Alt+Home) | ⬜ |

## Progress log
- 2026-10-18 J1: Rider command registry (web menu bar, desktop native menus, palette); Extend/Shrink Selection (word → string → brackets → line → indentation block → document).
- 2026-10-18 J2: Toggle Case: selection or word at the caret; upper case, or lower case when already upper.
- 2026-10-18 J3: Join Lines: selected lines or the next line, one space, indentation dropped.
- 2026-10-18 J4: Occurrence carets: Alt+J adds the next match, Alt+Shift+J drops the last, Ctrl+Alt+Shift+J selects all (whole words for word selections). Ctrl+Alt chords match the physical key (CodeMirror reads Ctrl+Alt as AltGr on Windows).
- 2026-10-18 J5: Start New Line after the current line from anywhere in it (Shift+Enter); Start New Line Before Current with its indentation (Ctrl+Alt+Enter).
- 2026-10-18 J6: Add Carets to Ends of Selected Lines: one caret per selected line, at its end.
- 2026-10-18 J7: Paste from History: copies and cuts in the editors (and the editor's context menu) feed a 40-entry history; filter, Enter pastes, Delete forgets. Desktop: Ctrl+Shift+V moves from Paste as Plain Text (still in Edit) to Paste from History.
- 2026-10-18 J8: Insert Live Template popup: the C# snippets in .cs files, new Gherkin templates (scenario, outline, background, rule, examples, table, doc string, tag) in .feature files; fields with Tab. New Code menu.
- 2026-10-18 J9: Surround With: C# (if, if/else, while, for, foreach, try/catch, try/finally, using, lock, #region, braces, parentheses, cast, string) and Gherkin (Scenario, Scenario Outline, Rule, Background, doc string, step and outline parameters); the placeholder is selected afterwards.
- 2026-10-18 J10: Soft-Wrap toggle for every editor (View menu, remembered), via a shared view-options store.
- 2026-10-18 J11: Show Whitespaces toggle: spaces, tabs and trailing whitespace drawn in every editor.
- 2026-10-18 J12: Editor font size: Ctrl+Mouse Wheel over an editor (page zoom untouched), Increase / Decrease / Reset Font Size in View; all editors, remembered.
