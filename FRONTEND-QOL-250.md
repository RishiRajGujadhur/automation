# Frontend developer quality of life improvements

This tracks **additional** improvements beyond the existing features in `FRONTEND-100.md`, `VSCODE-250.md`, and `QOL-50.md`. Each numbered item is a distinct implemented user action or behavior and receives its own commit and push.

| # | Improvement | Verification | Source |
|---|---|---|---|
| 1 | Expand Emmet HTML abbreviations at the caret from the editor context menu, with editable snippet fields. | Build and focused test | Microsoft's MIT-licensed [`@vscode/emmet-helper`](https://github.com/microsoft/vscode-emmet-helper); [VS Code Emmet documentation](https://code.visualstudio.com/docs/languages/emmet) |
| 2 | Press Tab after a structural HTML Emmet abbreviation to expand it without opening a menu; ordinary Tab behavior remains available. | Focused browser test | [VS Code Emmet Tab setting](https://code.visualstudio.com/docs/languages/emmet#_using-tab-for-emmet-expansions) |
| 3 | Expand CSS property abbreviations such as `m10` to `margin: 10px;` from the style editor context menu. | Focused browser test | Microsoft's MIT-licensed [`@vscode/emmet-helper`](https://github.com/microsoft/vscode-emmet-helper) |
| 4 | Expand JSX/TSX markup abbreviations with React-compatible `className` attributes. | Focused browser test | Microsoft's MIT-licensed [`@vscode/emmet-helper`](https://github.com/microsoft/vscode-emmet-helper) |
| 5 | Press Tab after numeric CSS Emmet shorthands such as `p20` to insert the full property. | Focused browser test | [VS Code Emmet Tab setting](https://code.visualstudio.com/docs/languages/emmet#_using-tab-for-emmet-expansions) |
| 6 | Wrap selected HTML text with nested elements from an Emmet abbreviation. | Focused browser test | [VS Code Emmet wrap documentation](https://code.visualstudio.com/docs/languages/emmet#_wrap-with-abbreviation) |
| 7 | Wrap selected JSX/TSX text with React-compatible Emmet markup. | Focused browser test | [VS Code Emmet wrap documentation](https://code.visualstudio.com/docs/languages/emmet#_wrap-with-abbreviation) |
| 8 | Select the enclosing HTML element, then its parent on repeated use. | Focused browser test | [VS Code Emmet balance documentation](https://code.visualstudio.com/docs/languages/emmet#_balance) |
| 9 | Press Tab after a structural JSX/TSX Emmet abbreviation to expand React markup. | Focused browser test | [VS Code Emmet Tab setting](https://code.visualstudio.com/docs/languages/emmet#_using-tab-for-emmet-expansions) |
