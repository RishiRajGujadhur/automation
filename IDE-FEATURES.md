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
