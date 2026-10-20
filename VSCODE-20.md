# VS Code features with their settings (V1–V20)

Twenty VS Code editor and workbench features, each with the settings VS Code has for it (same ids, e.g.
`editor.minimap.enabled`). They are listed under **Settings ▸ Text Editor** and **Settings ▸ Workbench** (Ctrl+,),
by sub-category as in VS Code: a changed setting has a bar on its left and a reset button, `@modified` lists the changed
ones, and **Settings (JSON)** copies or imports them as a `settings.json`. A feature's own `enabled` setting is its
switch. Web and desktop share the implementation.

| # | Feature | Settings | Status |
| --- | --- | --- | --- |
| V1 | Settings editor (Text Editor / Workbench categories, modified bar, reset, @modified, settings.json) and Line Numbers | editor.lineNumbers | ✅ 2026-10-20 |
| V2 | Minimap | editor.minimap.enabled, autohide, side, showSlider, scale, maxColumn, renderCharacters, size | ✅ 2026-10-20 |
| V3 | Minimap section headers | editor.minimap.showRegionSectionHeaders, showMarkSectionHeaders, markSectionHeaderRegex, sectionHeaderFontSize, sectionHeaderLetterSpacing | ✅ 2026-10-20 |
| V4 | Cursor style and width | editor.cursorStyle, editor.cursorWidth | ✅ 2026-10-20 |
| V5 | Cursor blinking and smooth caret animation | editor.cursorBlinking, editor.cursorSmoothCaretAnimation | ✅ 2026-10-20 |
| V6 | Cursor surrounding lines | editor.cursorSurroundingLines, editor.cursorSurroundingLinesStyle | ✅ 2026-10-20 |
| V7 | Font family, weight and ligatures | editor.fontFamily, editor.fontWeight, editor.fontLigatures | ✅ 2026-10-20 |
| V8 | Line height and letter spacing | editor.lineHeight, editor.letterSpacing | ✅ 2026-10-20 |
| V9 | Render whitespace | editor.renderWhitespace | ✅ 2026-10-20 |
| V10 | Word wrap | editor.wordWrap, editor.wordWrapColumn, editor.wrappingIndent | ✅ 2026-10-20 |
| V11 | Rulers | editor.rulers | ✅ 2026-10-20 |
| V12 | Render line highlight | editor.renderLineHighlight, editor.renderLineHighlightOnlyWhenFocus | ✅ 2026-10-20 |
| V13 | Files: trim and final newline on save | files.trimTrailingWhitespace, files.insertFinalNewline, files.trimFinalNewlines | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 V1: Schema-driven VS Code settings with sub-categories, modified marker, reset, @modified and settings.json copy/import; editor.lineNumbers on / off / relative / interval; Ctrl+, opens Preferences in the web app.
- 2026-10-20 V2: A canvas minimap beside the code and Gherkin editors: click to jump, drag the slider, left or right, scale 1–3, column limit, characters or blocks, proportional / fill / fit, autohide on mouse over or scroll.
- 2026-10-20 V3: // MARK: comments (C#, Gherkin and XML comments) and named #region lines labelled in the minimap, a line above for MARK: -; the regex is configurable (label / separator groups).
- 2026-10-20 V4: line, block, underline, line-thin, block-outline, underline-thin in the caret's theme colour; a line caret 1–10 px wide.
- 2026-10-20 V5: blink, smooth, phase, expand or solid; the caret glides between positions (always, or only for explicit moves, not typing).
- 2026-10-20 V6: Keeps n lines visible above and below the caret when it moves by keyboard (or, with all, also by mouse).
- 2026-10-20 V7: The editors' (and gutters') font from a VS Code–style family list, a weight from 100 to 900, and ligatures on or off.
- 2026-10-20 V8: Line height automatic, as a multiple of the font size (< 8) or in pixels; letter spacing in pixels; the gutters follow.
- 2026-10-20 V9: Spaces and tabs drawn as · and → in the selection (VS Code's default), at boundaries, trailing only, everywhere or nowhere.
- 2026-10-20 V10: Wrap off, at the viewport, at a column or bounded by both; wrapped rows keep the line's indent, one more or two more (or none).
- 2026-10-20 V11: Vertical rulers after the listed columns (80, 120…), drawn together with the right margin guide.
- 2026-10-20 V12: The current line highlighted in the text (VS Code's default), the gutter, both or neither; optionally only while the editor has focus.
- 2026-10-20 V13: A save trims trailing whitespace, adds a final newline and removes extra final newlines (CRLF kept); the editor takes the saved text line by line, so the caret stays.
