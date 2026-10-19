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
