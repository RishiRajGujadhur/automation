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
| 10 | Show structural HTML Emmet abbreviations with rendered previews in editor completion. | Focused browser test | Microsoft's MIT-licensed [`@vscode/emmet-helper`](https://github.com/microsoft/vscode-emmet-helper) |
| 11 | Offer numeric CSS Emmet shorthands in completion alongside normal CSS property suggestions. | Focused browser test | Microsoft's MIT-licensed [`@vscode/emmet-helper`](https://github.com/microsoft/vscode-emmet-helper) |
| 12 | Show React-compatible JSX/TSX Emmet expansions with a rendered preview in completion. | Focused browser test | Microsoft's MIT-licensed [`@vscode/emmet-helper`](https://github.com/microsoft/vscode-emmet-helper) |
| 13 | Control Emmet Tab expansion from Settings ▸ Text Editor ▸ Emmet, with normal Tab behavior when disabled. | Focused browser test | [VS Code's `emmet.triggerExpansionOnTab` setting](https://github.com/microsoft/vscode/blob/main/extensions/emmet/package.json) |
| 14 | Configure whether Emmet expansion previews appear in completion for markup, stylesheets, and JSX. | Focused browser test | [VS Code's `emmet.showExpandedAbbreviation` setting](https://github.com/microsoft/vscode/blob/main/extensions/emmet/package.json) |
| 15 | Choose HTML, XHTML, or XML self-closing tags for Emmet expansion from Settings. | Focused browser test | [VS Code's Emmet preferences](https://github.com/microsoft/vscode/blob/main/extensions/emmet/package.json) |
| 16 | Select the first nested HTML element and then its text from a whole-element selection. | Focused browser test | [VS Code Emmet balance inward action](https://github.com/microsoft/vscode/blob/main/extensions/emmet/package.json) |
| 17 | Jump between an HTML element's opening and closing tag names. | Focused browser test | [VS Code Emmet matching pair action](https://github.com/microsoft/vscode/blob/main/extensions/emmet/package.json) |
| 18 | Insert a TSX React function component from an `rfc` completion snippet, naming it from the file. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
| 19 | Insert a flexbox container with alignment and an editable gap from the `flexc` CSS snippet. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
| 20 | Insert a CSS grid container with editable column count and gap from the `gridc` snippet. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
| 21 | Insert a responsive media query block with an editable breakpoint from the `mediaq` snippet. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
| 22 | Insert a container query block with an editable size threshold from the `containerq` snippet. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
| 23 | Insert a TSX React component with a typed props shape and linked editable prop names from `rfcp`. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
| 24 | Insert a keyboard-visible focus rule with editable selector and outline from `focusv`. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
| 25 | Insert a responsive auto-fit grid with editable minimum card width from `autogrid`. | Focused browser test | [VS Code snippet workflow](https://code.visualstudio.com/docs/editing/userdefinedsnippets) |
