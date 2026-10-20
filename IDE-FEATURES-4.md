# Visual Studio 2026 and JetBrains Rider features: fourth batch (Y1–Y100)

Goal: 100 more IDE features that none of the earlier batches has, each pushed on its own, in the web and desktop apps.
Earlier batches: [RIDER.md](RIDER.md) (J1–J62), [VS2026-PARITY.md](VS2026-PARITY.md), [IDE-FEATURES.md](IDE-FEATURES.md)
(X1–X200) and the quality-of-life list [QOL-50.md](QOL-50.md) (QL1–QL100).

Every feature gets a switch under **Settings ▸ Features** (`src/features.ts`). **Essential** means Visual Studio 2026
has it on by default, so the desktop app starts with it on. The others start off on the desktop and on in the web app.

| # | Feature | From | Essential | Status |
| --- | --- | --- | --- | --- |
| Y1 | URL Encode / Decode (Edit ▸ Convert) | Rider | no | ✅ 2026-10-20 |
| Y2 | Base64 Encode / Decode (Edit ▸ Convert) | Rider | no | ✅ 2026-10-20 |
| Y3 | Escape / Unescape C# String | Rider | no | ✅ 2026-10-20 |
| Y4 | HTML Encode / Decode | Rider | no | ✅ 2026-10-20 |
| Y5 | Increment / Decrement Number | Rider | no | ✅ 2026-10-20 |
| Y6 | Insert Sequence at carets | Rider | no | ✅ 2026-10-20 |
| Y7 | Toggle Quotes | Rider | no | ✅ 2026-10-20 |
| Y8 | Join Lines with Separator… | Rider | no | ✅ 2026-10-20 |
| Y9 | Split at Separator… | Rider | no | ✅ 2026-10-20 |
| Y10 | Align Assignments (Ctrl+Alt+]) | VS 2026 | no | ✅ 2026-10-20 |
| Y11 | Swap Selections | Rider | no | ✅ 2026-10-20 |
| Y12 | Count Occurrences | Rider | no | ✅ 2026-10-20 |
| Y13 | Trim Lines | Rider | no | ✅ 2026-10-20 |
| Y14 | Insert Date and Time | Rider | no | ✅ 2026-10-20 |
| Y15 | Insert Lorem Ipsum | Rider | no | ✅ 2026-10-20 |
| Y16 | Shuffle Lines | Rider | no | ✅ 2026-10-20 |
| Y17 | Reformat XML | VS 2026 | yes | ✅ 2026-10-20 |
| Y18 | Minify XML | Rider | no | ✅ 2026-10-20 |
| Y19 | Escape / Unescape JSON String | Rider | no | ✅ 2026-10-20 |
| Y20 | Number Lines | Rider | no | ✅ 2026-10-20 |
| Y21 | Convert to File-Scoped Namespace | VS 2026 | yes | ✅ 2026-10-20 |
| Y22 | Convert to Block-Scoped Namespace | VS 2026 | yes | ✅ 2026-10-20 |
| Y23 | Remove #region Directives | Rider | no | ✅ 2026-10-20 |
| Y24 | Convert to Raw String Literal | VS 2026 | yes | ✅ 2026-10-20 |
| Y25 | Markdown: Toggle Task | Rider | no | ✅ 2026-10-20 |
| Y26 | Markdown: Format Table | Rider | no | ✅ 2026-10-20 |
| Y27 | Markdown: Insert Table of Contents | Rider | no | ✅ 2026-10-20 |
| Y28 | Markdown: Insert Table | Rider | no | ✅ 2026-10-20 |
| Y29 | Remove Comments | Rider | no | ✅ 2026-10-20 |
| Y30 | Convert to Interpolated String | VS 2026 | yes | ✅ 2026-10-20 |
| Y31 | Table: Delete Empty Rows | Rider | no | ✅ 2026-10-20 |
| Y32 | Table: Remove Duplicate Rows | Rider | no | ✅ 2026-10-20 |
| Y33 | Table: Copy as Markdown | Rider | no | ✅ 2026-10-20 |
| Y34 | Tag All Scenarios… | Rider | no | ✅ 2026-10-20 |
| Y35 | Remove Tag Everywhere… | Rider | no | ✅ 2026-10-20 |
| Y36 | Sort Tags | Rider | no | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 Y1: Percent-encodes the selection (or line) and decodes it.
- 2026-10-20 Y2: UTF-8 Base64 of the selection, and back.
- 2026-10-20 Y3: Escapes quotes, backslashes and control characters for a C# literal, and back.
- 2026-10-20 Y4: Entities for < > & and quotes, and numeric entities when decoding.
- 2026-10-20 Y5: The number at each caret changes by one; zero padding kept.
- 2026-10-20 Y6: 1, 2, 3… at several carets, or counting on from a selected number.
- 2026-10-20 Y7: The string at the caret switches between double and single quotes.
- 2026-10-20 Y8: The selected lines joined with a separator you choose.
- 2026-10-20 Y9: The line (or selected lines) split into one line per part.
- 2026-10-20 Y10: Lines up the = of the selected lines or the assignment block at the caret.
- 2026-10-20 Y11: With two selections, their text changes places.
- 2026-10-20 Y12: How often the selection or word at the caret appears, and on how many lines.
- 2026-10-20 Y13: Leading and trailing white space of the selected lines removed.
- 2026-10-20 Y14: Code menu: the local date and time at each caret.
- 2026-10-20 Y15: Code menu: a sentence of placeholder text.
- 2026-10-20 Y16: The selected lines in random order.
- 2026-10-20 Y17: One element per line, indented with the editor's unit; short text inline.
- 2026-10-20 Y18: White space between tags removed (well-formed XML only).
- 2026-10-20 Y19: The selection as a JSON string body, and back.
- 2026-10-20 Y20: 1., 2., 3.… before the selected lines.
- 2026-10-20 Y21: namespace X { … } becomes namespace X; with the body unindented.
- 2026-10-20 Y22: namespace X; becomes a namespace block with the body indented.
- 2026-10-20 Y23: Every #region / #endregion line removed, code kept.
- 2026-10-20 Y24: The string at the caret becomes a C# 11 raw string (multi-line when it has new lines).
- 2026-10-20 Y25: Checks / unchecks - [ ] tasks; a line becomes a task.
- 2026-10-20 Y26: The pipes of the table at the caret lined up, alignment kept.
- 2026-10-20 Y27: A nested list of links to the headings (code fences skipped).
- 2026-10-20 Y28: An empty two-column table.
- 2026-10-20 Y29: Comments of the selection or file removed; strings and # language: kept.
- 2026-10-20 Y30: A selected "a" + b concatenation becomes $"a{b}".
- 2026-10-20 Y31: Rows whose cells are all empty removed; header kept.
- 2026-10-20 Y32: Repeated rows removed, the first kept.
- 2026-10-20 Y33: The table at the caret copied as a Markdown table.
- 2026-10-20 Y34: A tag added to every scenario of the file that lacks it.
- 2026-10-20 Y35: A tag removed from every tag line; empty tag lines deleted.
- 2026-10-20 Y36: Tags of each tag line sorted (natural order), repeats dropped.
