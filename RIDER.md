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
| J13 | Copy Reference (Ctrl+Alt+Shift+C) | ✅ 2026-10-18 |
| J14 | Highlight Usages in File (Ctrl+Shift+F7) | ✅ 2026-10-18 |
| J15 | File Structure popup (Ctrl+Alt+F12; Ctrl+F12 stays Go To Implementation) | ✅ 2026-10-18 |
| J16 | Structure tool window (Alt+7) | ✅ 2026-10-18 |
| J17 | Type Hierarchy (Ctrl+H) | ✅ 2026-10-18 |
| J18 | Call Hierarchy (Ctrl+Alt+H) | ✅ 2026-10-18 |
| J19 | Problems tool window: solution-wide analysis (Alt+Shift+6; Alt+3 is the Features page) | ✅ 2026-10-18 |
| J20 | Terminal tool window (Alt+F12) | ✅ 2026-10-18 |
| J21 | Run Anything (Ctrl twice) | ✅ 2026-10-18 |
| J22 | HTTP Client (`.http` / `.rest` files) | ✅ 2026-10-18 |
| J23 | Markdown preview | ✅ 2026-10-18 |
| J24 | Distraction-Free Mode (Alt+Shift+Z) | ✅ 2026-10-18 |
| J25 | Presentation Mode | ✅ 2026-10-18 |
| J26 | Hide All Tool Windows (Ctrl+Shift+F12) | ✅ 2026-10-18 |
| J27 | Key Promoter (shortcut hints when a command is used from a menu) | ✅ 2026-10-18 |
| J28 | Productivity Guide | ✅ 2026-10-18 |
| J29 | Tip of the Day | ✅ 2026-10-18 |
| J30 | Evaluate Expression (Alt+F8, debugger) | ✅ 2026-10-18 |
| J31 | Mute Breakpoints | ✅ 2026-10-18 |
| J32 | Check RegExp (step definition patterns) | ✅ 2026-10-18 |
| J33 | Compare with Clipboard | ✅ 2026-10-18 |
| J34 | Recent Changes (Alt+Shift+C) | ✅ 2026-10-18 |
| J35 | Shelf (shelve / unshelve changes; Git stash) | ✅ 2026-10-18 |
| J36 | Power Save Mode | ✅ 2026-10-18 |
| J37 | Go to Related Files (Ctrl+Alt+Home) | ✅ 2026-10-18 |
| J38 | Move Statement Up / Down (Ctrl+Shift+Alt+↑/↓): whole blocks and scenarios | ✅ 2026-10-18 |
| J39 | Comment with Block Comment (Ctrl+Shift+/) | ✅ 2026-10-18 |
| J40 | Code Cleanup (Ctrl+E, C): format and organize usings (C#), format (Gherkin) | ✅ 2026-10-18 |
| J41 | Next / Previous Change (Ctrl+Alt+Shift+↓/↑) | ⬜ |
| J42 | Rollback Lines (undo the uncommitted change at the caret) | ⬜ |
| J43 | Scratch Files (Ctrl+Alt+Shift+Insert) | ⬜ |
| J44 | Numbered bookmarks (Ctrl+Shift+digit toggles, Ctrl+digit jumps) | ⬜ |
| J45 | Expand All / Collapse All / Collapse to Definitions | ⬜ |
| J46 | Select In… (Alt+F1): Explorer, Structure, Terminal, file manager | ⬜ |
| J47 | Compare With… another file | ⬜ |
| J48 | Complete Current Statement (Ctrl+Shift+Enter) | ⬜ |
| J49 | Unwrap / Remove (Ctrl+Shift+Delete) | ⬜ |
| J50 | Column Selection Mode (Alt+Shift+Insert) | ⬜ |
| J51 | Copy Path / Reference… popup (Ctrl+Shift+C) | ⬜ |
| J52 | TODO highlighting in the editor | ⬜ |
| J53 | Breadcrumbs for feature files (Feature › Rule › Scenario) | ⬜ |
| J54 | Git: Show History for Selection | ⬜ |
| J55 | Git Log tool window (Alt+9) with commit details | ⬜ |
| J56 | Git: Compare with Branch… | ⬜ |
| J57 | External Tools (commands with $FilePath$-style macros) | ⬜ |
| J58 | New File from Template (class, interface, test, step definitions, feature, .http, .md) | ⬜ |
| J59 | Line separators (CRLF ⇄ LF) from the status bar | ⬜ |
| J60 | Show Line Numbers toggle | ⬜ |
| J61 | Indent guides | ⬜ |
| J62 | Highlight usages of the identifier at the caret (automatic) | ⬜ |

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
- 2026-10-18 J13: Copy Reference: C# symbol at the cursor (or the enclosing member/type) as a fully qualified name via the new language-server op symbolId; other files as path:line. Language server also gains typeHierarchy, callers and solutionDiagnostics ops.
- 2026-10-18 J14: Highlight Usages in File: Roslyn references of the C# symbol in this file, whole-word matches elsewhere; F3 / Shift+F3 move between them, Esc or an edit clears. New Navigate menu.
- 2026-10-18 J15: File Structure popup: C# types and members (Roslyn outline), Gherkin Feature/Rule/Background/Scenario/Examples, Markdown headings; opens on the entry at the caret; filter and Enter jumps.
- 2026-10-18 J16: Structure tool window (bottom panel tab, Alt+7): outline of the file being edited, entry at the caret highlighted, sort alphabetically, click to go. Rider tool windows are now tabs of the shared bottom panel.
- 2026-10-18 J17: Type Hierarchy in a Hierarchy tool window: base chain to System.Object, the type, derived types as a tree (transitive), implemented interfaces; click to go. Roslyn op typeHierarchy.
- 2026-10-18 J18: Call Hierarchy in the Hierarchy tool window: callers of the method/property at the caret with their call sites (Roslyn FindCallers), expand a caller for its callers (lazy), click goes to the call.
- 2026-10-18 J19: Problems tool window: C# compiler errors/warnings of every project (Roslyn solutionDiagnostics) and unbound / ambiguous feature steps, grouped by file, filter by severity, click to go.
- 2026-10-18 J20: Terminal tool window (xterm.js): PowerShell (sh elsewhere) in the repository folder, line editing with history, cd tracked in the prompt, Ctrl+C stops the command tree, Ctrl+L clears, several tabs. Line-based shell over pipes (no native pty), so the desktop bundle needs nothing extra.
- 2026-10-18 J21: Run Anything (press Ctrl twice, Tools menu): type any command or pick a suggestion (recent commands, dotnet build/test/restore per project and solution, git); it runs in the Terminal (opened if needed). New Tools menu.
- 2026-10-18 J22: HTTP Client for .http / .rest files: ### separated requests, headers, body, @variables and {{$guid}}/{{$timestamp}}/{{$randomInt}}; ▶ in the gutter or Ctrl+Enter sends (server-side fetch), response panel with status, time, pretty JSON body, headers. Bug fixes on the way: the editors could only save .cs/.feature/.xml (now any text file: .csproj, .json, .md, scripts…), the source reader and the Explorer skipped .http and script files.
- 2026-10-18 J23: Markdown preview for .md files: editor only / editor and preview / preview only (remembered), live while typing, GitHub-flavoured Markdown via marked, sanitized with DOMPurify, links open outside.
- 2026-10-18 J24: Distraction-Free Mode (View menu, Alt+Shift+Z): header, activity bar, explorer, panels, tabs and status bar hidden, text centred; an Exit pill at the top edge.
- 2026-10-18 J25: Presentation Mode: Distraction-Free layout, full screen and a 22 px editor font; Exit pill restores.
- 2026-10-18 J26: Hide All Tool Windows (Ctrl+Shift+F12): explorer and bottom panel hidden, editors take the room; the same key brings them back.
- 2026-10-18 J27: Key Promoter: a Rider command run from a menu or the palette shows its shortcut and how many times it was used without it; toggle in Help.
- 2026-10-18 J28: Productivity Guide (Help): every Rider feature with its use count, share used with the shortcut, last use and key; unused ones listed; click a feature to try it.
- 2026-10-18 J29: Tip of the Day (Help): studio tips plus one per Rider command with a shortcut, previous / next, Try it runs the feature; Show tips on startup (off by default), once per session.
- 2026-10-18 J30: Evaluate Expression (Alt+F8) while paused: starts from the selection / word at the caret, evaluates in the selected frame (netcoredbg), members expand lazily, history with ↑/↓, errors shown.
- 2026-10-18 J31: Mute Breakpoints (Tools): all breakpoints are sent to the debugger disabled while their own settings are kept; margin dots go grey; remembered.
- 2026-10-18 J32: Check RegExp (Code menu): takes the [Given/When/Then] pattern at the caret (C# string unescaped), converts Cucumber expressions like Reqnroll, tests a sample (match + groups) and lists the feature steps it matches (click to open).
- 2026-10-18 J33: Compare with Clipboard (Edit): the selection, or the whole file, against the clipboard as a unified diff with a summary.
- 2026-10-18 J34: Recent Changes (Alt+Shift+C): the newest Local History versions across all files (saved / changed / deleted, when); pick one to open the file with its history, compare and revert.
- 2026-10-18 J35: Shelf tool window: unsaved editors are saved, then Shelve Changes puts every uncommitted change (new files too) aside under a name (git stash -u); Unshelve (pop) or Apply, keep; delete asks twice; open editors reload changed files.
- 2026-10-18 J36: Power Save Mode (Tools): C# diagnostics as you type, CodeLens reference counts and inlay hints pause; a Power Save badge shows it and turns it off.
- 2026-10-18 J37: Go to Related Files (Ctrl+Alt+Home): from a feature, the C# files whose step definitions its steps use (with counts) and its code-behind; from a step file, the features that use its bindings.
- 2026-10-18 J38: Move Statement Up / Down: moves the statement with its { } block or indented body (C# blocks, Gherkin scenarios with their steps, steps with tables) past its neighbour, never out of its parent.
- 2026-10-18 J39: Comment with Block Comment (Ctrl+Shift+/): /* */ in C#, <!-- --> in XML, toggles off when already commented; Gherkin (no block comments) gets # per line.
- 2026-10-18 J40: Code Cleanup (Ctrl+K, Ctrl+E as in Visual Studio): C# usings organized and formatted by Roslyn, features formatted, trailing whitespace trimmed, final newline. Bug fixes: Ctrl+K inside an editor no longer opens the command palette (it starts the editor's chords; the palette is also Ctrl+Shift+P), and Ctrl+K Ctrl+E no longer opens Recent Files.
