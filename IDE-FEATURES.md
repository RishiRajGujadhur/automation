# Visual Studio 2026 and JetBrains Rider features: third batch (X1–X200)

Goal: 200 more IDE features, each pushed on its own, in the web and desktop apps. Earlier batches are in
[RIDER.md](RIDER.md) (J1–J62) and [VS2026-PARITY.md](VS2026-PARITY.md).

Every feature gets a switch under **Settings ▸ Features** (`src/features.ts`). **Essential** means Visual Studio 2026
has it on by default, so the desktop app starts with it on. The others start off on the desktop and on in the web app.

| # | Feature | From | Essential | Status |
| --- | --- | --- | --- | --- |
| X1 | Sort Lines (Edit) | Rider | no | ✅ 2026-10-20 |
| X2 | Reverse Lines (Edit) | Rider | no | ✅ 2026-10-20 |
| X3 | Delete Horizontal White Space (Ctrl+K, Ctrl+\) | VS 2026 | yes | ✅ 2026-10-20 |
| X4 | Make Uppercase | VS 2026 | yes | ✅ 2026-10-20 |
| X5 | Make Lowercase | VS 2026 | yes | ✅ 2026-10-20 |
| X6 | Transpose Line (Shift+Alt+T) | VS 2026 | yes | ✅ 2026-10-20 |
| X7 | Transpose Characters | VS 2026 | yes | ✅ 2026-10-20 |
| X8 | Transpose Words | VS 2026 | yes | ✅ 2026-10-20 |
| X9 | Go to Matching Brace (Ctrl+]) | VS 2026 | yes | ✅ 2026-10-20 |
| X10 | Select to Matching Brace (Ctrl+Shift+]) | VS 2026 | yes | ✅ 2026-10-20 |
| X11 | Find Next Selected (Ctrl+F3) | VS 2026 | yes | ✅ 2026-10-20 |
| X12 | Find Previous Selected (Ctrl+Shift+F3) | VS 2026 | yes | ✅ 2026-10-20 |
| X13 | Go to Last Edit Location (Ctrl+Shift+Backspace) | VS 2026 | yes | ✅ 2026-10-20 |
| X14 | Insert GUID | VS 2026 | yes | ✅ 2026-10-20 |
| X15 | Cyclic Expand Word (Alt+/) | Rider | no | ✅ 2026-10-20 |
| X16 | Overtype mode (Insert) | VS 2026 | yes | ✅ 2026-10-20 |
| X17 | Highlight Current Line toggle (View) | VS 2026 | yes | ✅ 2026-10-20 |
| X18 | Next / Previous Member (Alt+PageDown / PageUp) | Rider | no | ✅ 2026-10-20 |
| X19 | To Verbatim / Regular String | Rider | no | ✅ 2026-10-20 |
| X20 | Convert Case (camel, Pascal, snake, kebab, CONSTANT, Title, Sentence) | Rider | no | ✅ 2026-10-20 |
| X21 | XML documentation comments (///) | VS 2026 | yes | ✅ 2026-10-20 |
| X22 | Generate Constructor | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X23 | Paste JSON as Classes | VS 2026 | yes | ✅ 2026-10-20 |
| X24 | Reformat / Minify JSON | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X25 | Run Tests in Context (Ctrl+R, T) | VS 2026 | yes | ✅ 2026-10-20 |
| X26 | Debug Tests in Context (Ctrl+R, Ctrl+T) | VS 2026 | yes | ✅ 2026-10-20 |
| X27 | Repeat Last Test Run (Ctrl+R, L) | VS 2026 | yes | ✅ 2026-10-20 |
| X28 | Enable / Disable Breakpoint (Ctrl+F9) | VS 2026 | yes | ✅ 2026-10-20 |
| X29 | Show Next Statement (Alt+Num *) | VS 2026 | yes | ✅ 2026-10-20 |
| X30 | Copy Call Stack | VS 2026 | yes | ✅ 2026-10-20 |
| X31 | Export / Import Breakpoints | VS 2026 | yes | ✅ 2026-10-20 |
| X32 | Save / Apply Window Layout | VS 2026 | yes | ✅ 2026-10-20 |
| X33 | Reset Window Layout | VS 2026 | yes | ✅ 2026-10-20 |
| X34 | Reopen Closed Tab | Rider / VS 2026 | no | ✅ 2026-10-20 |
| X35 | Close Unmodified Tabs | Rider | no | ✅ 2026-10-20 |
| X36 | Switcher (Ctrl+Tab) | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X37 | Tabs in multiple rows | VS 2026 | no | ✅ 2026-10-20 |
| X38 | Notifications window | VS 2026 | yes | ✅ 2026-10-20 |
| X39 | File Properties (Alt+Enter) | VS 2026 | yes | ✅ 2026-10-20 |
| X40 | Analyze Stack Trace | Rider | no | ✅ 2026-10-20 |
| X41 | Git Log: Copy Revision Number | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X42 | Git Log: New Branch from Commit | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X43 | Git Log: New Tag | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X45 | Git Log: Revert Commit | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X46 | Git Log: Checkout Revision | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X47 | Git Log: Reset Current Branch to Here | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X48 | Branches popup | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X44 | Git Log: Cherry-Pick | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X49 | Cycle Step Keyword | Rider | yes | ✅ 2026-10-20 |
| X50 | Convert Scenario to Outline | Rider | yes | ✅ 2026-10-20 |
| X51 | Table: Insert Row | Rider | yes | ✅ 2026-10-20 |
| X52 | Table: Add Column | Rider | yes | ✅ 2026-10-20 |
| X53 | Table: Delete Column | Rider | yes | ✅ 2026-10-20 |
| X54 | Table: Sort by Column | Rider | no | ✅ 2026-10-20 |
| X55 | Copy Test Filter | Rider / VS Test Explorer | yes | ✅ 2026-10-20 |
| X56 | Select Scenario | Rider | yes | ✅ 2026-10-20 |
| X57 | Bracket pair colorization | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X58 | Editor zoom in the status bar | VS 2026 | yes | ✅ 2026-10-20 |
| X59 | Strip Trailing Spaces | Rider | yes | ✅ 2026-10-20 |
| X60 | Custom TODO patterns | Rider / VS Task List | no | ✅ 2026-10-20 |
| X61 | Right margin guide | Rider / VS | no | ✅ 2026-10-20 |
| X62 | Explorer: Scope to This | VS 2026 | yes | ✅ 2026-10-20 |
| X63 | Explorer: New File… | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X64 | Run Until Failure | VS 2026 | no | ✅ 2026-10-20 |
| X65 | Error List scope | VS 2026 | yes | ✅ 2026-10-20 |
| X66 | Error List: Copy and Error Help | VS 2026 | yes | ✅ 2026-10-20 |
| X67 | Error List: sort by column | VS 2026 | yes | ✅ 2026-10-20 |
| X68 | Output: Find | VS 2026 | yes | ✅ 2026-10-20 |
| X69 | Calculate Code Metrics | VS 2026 | no | ✅ 2026-10-20 |
| X70 | Fade unnecessary usings | VS 2026 | yes | ✅ 2026-10-20 |
| X71 | Test Explorer: Group By | VS 2026 | yes | ✅ 2026-10-20 |
| X72 | Test Explorer: search filters | VS 2026 | yes | ✅ 2026-10-20 |
| X73 | Test Explorer: Copy details | VS 2026 | yes | ✅ 2026-10-20 |
| X75 | Test Explorer: Collapse / Expand All | VS 2026 | yes | ✅ 2026-10-20 |
| X74 | Run All Tests in File | Rider / VS 2026 | yes | ✅ 2026-10-20 |
| X76 | Tags window | Rider / SpecFlow | yes | ✅ 2026-10-20 |
| X77 | Rename Tag | Rider | yes | ✅ 2026-10-20 |
| X78 | Run Tagged Scenarios | VS Test Explorer traits | yes | ✅ 2026-10-20 |
| X79 | Sync Namespace with Folder | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X80 | Rename File to Match Type | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X81 | Split String | Rider | yes | ✅ 2026-10-20 |
| X82 | Tabify Selected Lines | VS 2026 | no | ✅ 2026-10-20 |
| X83 | Untabify Selected Lines | VS 2026 | no | ✅ 2026-10-20 |
| X84 | Move Caret to Code Block Start | Rider | yes | ✅ 2026-10-20 |
| X85 | Move Caret to Code Block End | Rider | yes | ✅ 2026-10-20 |
| X86 | Extract Examples Parameter | Rider | yes | ✅ 2026-10-20 |
| X87 | Convert Outline to Scenario | Rider | yes | ✅ 2026-10-20 |
| X88 | Duplicate Scenario | Rider | yes | ✅ 2026-10-20 |
| X89 | Close Tabs to the Left | VS Code / Rider | yes | ✅ 2026-10-20 |
| X90 | Tab: Reveal in Explorer | VS 2026 | yes | ✅ 2026-10-20 |
| X91 | Search history | VS Code / VS 2026 | yes | ✅ 2026-10-20 |
| X92 | Search: Collapse / Expand All | VS Code / VS 2026 | yes | ✅ 2026-10-20 |
| X93 | Search: Copy All Results | VS Code | yes | ✅ 2026-10-20 |
| X94 | Search Only in Open Editors | VS Code / VS 2026 | yes | ✅ 2026-10-20 |
| X95 | Indentation (status bar) | VS Code / VS 2026 | yes | ✅ 2026-10-20 |
| X96 | Menu groups (Code ▸ Gherkin) | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X97 | Move Scenario Up | Rider | yes | ✅ 2026-10-20 |
| X98 | Move Scenario Down | Rider | yes | ✅ 2026-10-20 |
| X99 | Extract Background | Rider / SpecFlow | yes | ✅ 2026-10-20 |
| X100 | Add Examples Table | Rider | yes | ✅ 2026-10-20 |
| X101 | Toggle Tag | Rider | yes | ✅ 2026-10-20 |
| X102 | Output: Clear All | VS 2026 | yes | ✅ 2026-10-20 |
| X103 | Output: Word Wrap | VS 2026 | yes | ✅ 2026-10-20 |
| X104 | Next / Previous Error | VS 2026 | yes | ✅ 2026-10-20 |
| X105 | Explorer: Compare Selected Files | VS Code / Rider | yes | ✅ 2026-10-20 |
| X106 | Add Watch | VS 2026 / Rider | yes | ✅ 2026-10-20 |
| X107 | Locals / Watch: Copy Value | VS 2026 | yes | ✅ 2026-10-20 |
| X108 | Undo Last Commit | Rider | yes | ✅ 2026-10-20 |
| X109 | Save As… | VS 2026 | yes | ✅ 2026-10-20 |
| X110 | Explorer: Find in Folder… | VS Code / VS 2026 | yes | ✅ 2026-10-20 |
| X111 | Explorer: Copy Full Path | VS 2026 | yes | ✅ 2026-10-20 |
| X112 | Comment / Uncomment Scenario | Rider | yes | ✅ 2026-10-20 |
| X113 | Quick Info (Ctrl+K, Ctrl+I) | VS 2026 | yes | ✅ 2026-10-20 |
| X114 | Code Coverage for selected tests | VS 2026 | yes | ✅ 2026-10-20 |
| X115 | Run Not Run Tests | VS 2026 | yes | ✅ 2026-10-20 |
| X116 | Run Passed Tests | VS 2026 | no | ✅ 2026-10-20 |
| X117 | Paste as Gherkin Table | Rider | yes | ✅ 2026-10-20 |
| X118 | Copy Table as CSV | Rider | yes | ✅ 2026-10-20 |
| X119 | Scroll bar annotations | VS 2026 | yes | ✅ 2026-10-20 |
| X120 | Report a Problem | VS 2026 | yes | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 X1: Sort Lines: the selected lines (or the whole file) in natural, case-insensitive order, blank lines last. Third-batch plumbing: src/rider/more.ts, src/editor/textTools.ts, IDE-FEATURES.md.
- 2026-10-20 X2: Reverse Lines: the selected lines or the file, last first.
- 2026-10-20 X3: Delete Horizontal White Space: collapses runs of spaces in the selection (indentation kept), or deletes the spaces around the caret.
- 2026-10-20 X4: Make Uppercase: the selection or the word at the caret.
- 2026-10-20 X5: Make Lowercase: the selection or the word at the caret.
- 2026-10-20 X6: Transpose Line: the caret's line swaps with the next, the caret follows.
- 2026-10-20 X7: Transpose Characters: the two characters around the caret swap (at a line end, the last two).
- 2026-10-20 X8: Transpose Words: the word at the caret swaps with the next word.
- 2026-10-20 X9: Go to Matching Brace: Ctrl+] jumps to the bracket matching the one at the caret.
- 2026-10-20 X10: Select to Matching Brace: Ctrl+Shift+] selects through the matching bracket.
- 2026-10-20 X11: Find Next Selected: the next match of the selection or word, wrapping.
- 2026-10-20 X12: Find Previous Selected: the previous match, wrapping.
- 2026-10-20 X13: Go to Last Edit Location: back to where you last typed, in any file.
- 2026-10-20 X14: Insert GUID: a new GUID at every caret (VS Create GUID tool, Rider nguid).
- 2026-10-20 X15: Cyclic Expand Word: completes the word from other words of the file, nearest first; again cycles.
- 2026-10-20 X16: Overtype mode: Insert toggles overwriting characters in every editor; OVR in the status bar (click to leave).
- 2026-10-20 X17: Highlight Current Line: View toggle for the caret line's background in every editor.
- 2026-10-20 X18: Next / Previous Member: jump between C# methods and properties, or scenarios in features.
- 2026-10-20 X19: To Verbatim / Regular String: the C# string at the caret switches between regular and @ form (other escapes left alone).
- 2026-10-20 X20: Convert Case: a popup of seven styles for the selection or identifier at the caret.
- 2026-10-20 X21: XML doc comments: typing /// above a C# member writes summary, param and returns tags.
- 2026-10-20 X22: Generate Constructor: readonly fields and get-only properties of the class at the caret become constructor parameters.
- 2026-10-20 X23: Paste JSON as Classes: C# classes from the JSON on the clipboard (lists, nested objects, JsonPropertyName).
- 2026-10-20 X24: Reformat JSON / Minify JSON for the file or selection.
- 2026-10-20 X25: Run Tests in Context: the test or scenario at (or above) the caret runs, else the file's tests.
- 2026-10-20 X26: Debug Tests in Context: the test at the caret starts under the debugger.
- 2026-10-20 X27: Repeat Last Test Run: the last selection of tests runs again (same configuration and coverage).
- 2026-10-20 X28: Enable / Disable Breakpoint: Ctrl+F9 turns the caret line's breakpoint off or on (a disabled one when there is none).
- 2026-10-20 X29: Show Next Statement: Alt+Num * opens the file and line where the debugger is paused.
- 2026-10-20 X30: Copy Call Stack: the paused frames as text. Verified with Debug Tests in Context and Show Next Statement on the Calculator sample. Fix: app shortcuts no longer also fire on the second key of an editor chord (Ctrl+R, Ctrl+T opened Go to All).
- 2026-10-20 X31: Export / Import Breakpoints: every breakpoint with its condition, hit count and log message, to and from a JSON file.
- 2026-10-20 X32: Window Layouts: save the panel / side bar / tool window arrangement under a name, apply or delete it.
- 2026-10-20 X33: Reset Window Layout: default panel, side bar and tool windows (after a confirmation).
- 2026-10-20 X34: Reopen Closed Tab: the last closed editors come back, newest first (single closes and bulk closes).
- 2026-10-20 X35: Close Unmodified Tabs: closes tabs without unsaved changes; pinned and active stay. Fix: a feature load started by a tab switch no longer overrides a newer tab choice (Reopen Closed Tab could bounce back).
- 2026-10-20 X36: Switcher: open editors most recent first plus tool windows; Ctrl+Tab on desktop (browsers keep Ctrl+Tab).
- 2026-10-20 X37: Tabs in Multiple Rows: the editor tab strip wraps instead of scrolling (VS option, off by default).
- 2026-10-20 X38: Notifications window: every notice of the session, newest first, with Clear.
- 2026-10-20 X39: File Properties: size, dates, encoding (BOM), line endings, line count, read-only.
- 2026-10-20 X40: Analyze Stack Trace: paste a .NET stack trace; frames in the solution link to file:line (machine paths matched by suffix).
- 2026-10-20 X41: Git Log commit action bar; Copy Revision
- 2026-10-20 X42: Branch at the selected commit
- 2026-10-20 X43: Tag the selected commit
- 2026-10-20 X45: Revert with a new commit, aborted on conflicts
- 2026-10-20 X46: Detached checkout of a commit
- 2026-10-20 X47: Soft/mixed/hard reset; hard confirms
- 2026-10-20 X48: Status bar branch opens a switch/create popup
- 2026-10-20 X44: Cherry-pick, aborted on conflicts (code landed with X45; tests fixed)
- 2026-10-20 X49: Given/When/Then/And/But cycling
- 2026-10-20 X50: Quoted values to <params> + Examples
- 2026-10-20 X51: Empty aligned row below
- 2026-10-20 X52: Empty column after the caret's
- 2026-10-20 X53: Removes the caret's column
- 2026-10-20 X54: Natural sort, toggles descending
- 2026-10-20 X55: dotnet test --filter for scenario/feature
- 2026-10-20 X56: Selects tags through Examples
- 2026-10-20 X57: Depth colours, strings/comments skipped
- 2026-10-20 X58: Zoom % with click to reset
- 2026-10-20 X59: Selection or whole file
- 2026-10-20 X60: Configurable highlighted keywords
- 2026-10-20 X61: Guide after column 120, configurable
- 2026-10-20 X62: Folder-scoped Explorer with Home
- 2026-10-20 X63: Create any file (sub-folders too) and open it
- 2026-10-20 X64: Repeats the last run until failure or N passes
- 2026-10-20 X65: Entire Solution / Open Documents / Current Document
- 2026-10-20 X66: Ctrl+C row, F1 / code link to Learn
- 2026-10-20 X67: Header click sorts asc/desc/build order
- 2026-10-20 X68: Filter build output to matching lines
- 2026-10-20 X69: Roslyn metrics op: MI, CC, coupling, LOC
- 2026-10-20 X70: Roslyn unnecessary op; hint marks faded
- 2026-10-20 X71: Project/Class/Outcome/Duration grouping
- 2026-10-20 X72: outcome:/class:/project:… terms, quotes, -exclusions
- 2026-10-20 X73: Copy test detail summary
- 2026-10-20 X75: Toolbar toggle for all groups
- 2026-10-20 X74: Runs the active file's tests
- 2026-10-20 X76: Tags with scenarios, filter, open
- 2026-10-20 X77: Tag rename across features via diff approval
- 2026-10-20 X78: Tags window runs a tag's scenarios
- 2026-10-20 X79: Project name + folders
- 2026-10-20 X80: File named after its first type
- 2026-10-20 X81: String literal split at caret
- 2026-10-20 X82: Leading spaces to tabs
- 2026-10-20 X83: Leading tabs to spaces
- 2026-10-20 X84: Enclosing {, repeat goes outward
- 2026-10-20 X85: Enclosing }, repeat goes outward
- 2026-10-20 X86: Selection to <param> + Examples column
- 2026-10-20 X87: Single-row outline inlined
- 2026-10-20 X88: Copy of the scenario below
- 2026-10-20 X89: Tab menu closes unpinned tabs before it
- 2026-10-20 X90: Tab menu shows the file in the Explorer
- 2026-10-20 X91: Up/Down recall earlier searches
- 2026-10-20 X92: Toggle every result file
- 2026-10-20 X93: file / line / text to the clipboard
- 2026-10-20 X94: Limit to open tabs
- 2026-10-20 X95: Spaces/tabs and size, convert
- 2026-10-20 X96: Gherkin commands in a submenu (web + desktop)
- 2026-10-20 X97: Swap with the scenario above
- 2026-10-20 X98: Swap with the scenario below
- 2026-10-20 X99: Common leading Givens into Background
- 2026-10-20 X100: Examples with a column per parameter
- 2026-10-20 X101: Add or remove a scenario tag
- 2026-10-20 X102: Clears the Output window
- 2026-10-20 X103: Wrap long Output lines
- 2026-10-20 X104: Navigate build errors from anywhere
- 2026-10-20 X105: Select for Compare + Compare with
- 2026-10-20 X106: Selection or name to the Watch window
- 2026-10-20 X107: Copy value / expression, add watch
- 2026-10-20 X108: Soft reset of HEAD, changes staged
- 2026-10-20 X109: Copy of the editor text to a new file
- 2026-10-20 X110: Search limited to the folder
- 2026-10-20 X111: Absolute path to the clipboard
- 2026-10-20 X112: Whole scenario commented out or back
- 2026-10-20 X113: Hover information from the keyboard; menu commands keep the caret
- 2026-10-20 X114: Context menu runs with coverage
- 2026-10-20 X115: More run options: tests without a result
- 2026-10-20 X116: More run options: passed tests
- 2026-10-20 X117: TSV/CSV clipboard to aligned table
- 2026-10-20 X118: Table at caret to CSV
- 2026-10-20 X119: Errors, warnings, caret over the scroll bar
- 2026-10-20 X120: GitHub issue template
