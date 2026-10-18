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
| J6 | Add Carets to Ends of Selected Lines (Alt+Shift+G) | ⬜ |
| J7 | Paste from History (Ctrl+Shift+V) | ⬜ |
| J8 | Insert Live Template (Ctrl+J) | ⬜ |
| J9 | Surround With (Ctrl+Alt+J) | ⬜ |
| J10 | Soft-Wrap toggle (View ▸ Active Editor) | ⬜ |
| J11 | Show Whitespaces toggle | ⬜ |
| J12 | Change font size with Ctrl+Mouse Wheel, Reset Font Size | ⬜ |
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
