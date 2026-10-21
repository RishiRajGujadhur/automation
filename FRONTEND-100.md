# Front-end language features (JetBrains Rider and VS Code)

The 95 features listed (headed "100") for JavaScript, TypeScript, React (JSX / TSX), HTML and CSS / SCSS / LESS in the studio's editor, in
the web app and the desktop app. Engines: the TypeScript 5 language service (refactorings, code fixes, imports,
navigation), VS Code's HTML and CSS language services (completion, colours, validation, SCSS / LESS navigation),
and CodeMirror's JavaScript, HTML, CSS, SCSS and LESS modes. Every feature has an e2e test in
`test-authoring-studio/tests/e2e/frontend100.spec.ts`.

Status: `[x]` done, `[ ]` to do. Before this list, JS / TS / HTML / CSS files opened as plain text: no feature existed.

## JavaScript & TypeScript
- [x] F1 Extract TypeScript type alias
- [x] F2 Convert interface to type alias
- [x] F3 Convert type alias to interface
- [x] F4 Generate missing interface properties
- [x] F5 Implement interface members
- [x] F6 Infer generic type arguments
- [x] F7 Add explicit type annotations
- [x] F8 Remove redundant type annotations
- [x] F9 Convert JavaScript to TypeScript
- [x] F10 Generate JSDoc annotations
- [x] F11 Infer types from JSDoc
- [x] F12 Convert callbacks to promises
- [x] F13 Convert promise chains to async/await
- [x] F14 Convert async/await to promise chains
- [x] F15 Convert function declarations to arrow functions
- [x] F16 Convert arrow functions to function declarations
- [x] F17 Convert CommonJS to ES modules
- [x] F18 Convert ES modules to CommonJS
- [x] F19 Organize ES module imports
- [x] F20 Remove unused imports
- [x] F21 Auto-import unresolved symbols
- [x] F22 Update imports when files move
- [x] F23 Detect circular module dependencies
- [x] F24 Navigate TypeScript declaration files
- [x] F25 Navigate source maps
- [x] F26 Extract object destructuring
- [x] F27 Convert destructuring to property access
- [x] F28 Convert optional checks to optional chaining
- [x] F29 Convert null checks to nullish coalescing
- [x] F30 Convert string concatenation to template literals

## React & JSX / TSX
- [x] F31 Extract JSX into React component
- [x] F32 Extract JSX into reusable variable
- [x] F33 Convert class components to functional components
- [x] F34 Generate React component props
- [x] F35 Generate TypeScript props interfaces
- [x] F36 Navigate React component definitions
- [x] F37 Find React component usages
- [x] F38 Rename JSX component tags
- [x] F39 Rename JSX attributes
- [x] F40 Auto-close JSX tags
- [x] F41 Auto-import React components
- [x] F42 Generate missing JSX attributes
- [x] F43 Convert inline JSX styles to CSS classes
- [x] F44 Extract inline event handlers
- [x] F45 Convert inline callbacks to named functions
- [x] F46 Detect missing React Hook dependencies
- [x] F47 Apply React Hook dependency fixes
- [x] F48 Detect invalid Hook usage
- [x] F49 Navigate React context providers
- [x] F50 React component prop type validation

## HTML
- [x] F51 HTML tag name completion
- [x] F52 HTML attribute completion
- [x] F53 HTML attribute value completion
- [x] F54 Automatic closing tag insertion
- [x] F55 Linked HTML tag renaming
- [x] F56 HTML element wrapping
- [x] F57 HTML tag unwrapping
- [x] F58 HTML tag structure validation
- [x] F59 HTML attribute validation
- [x] F60 HTML nesting validation
- [x] F61 HTML entity completion
- [x] F62 HTML character entity conversion
- [x] F63 HTML accessibility inspections
- [x] F64 HTML ARIA attribute validation
- [x] F65 HTML ID reference navigation
- [x] F66 HTML class reference navigation
- [x] F67 HTML element folding
- [x] F68 HTML document formatting
- [x] F69 HTML custom element support
- [x] F70 HTML language injection

## CSS, SCSS & LESS
- [x] F71 CSS selector completion
- [x] F72 CSS property completion
- [x] F73 CSS value completion
- [x] F74 CSS custom property navigation
- [x] F75 CSS variable usage search
- [x] F76 CSS selector specificity inspection
- [x] F77 CSS shorthand expansion
- [x] F78 CSS shorthand compression
- [x] F79 CSS vendor prefix handling
- [x] F80 CSS color previews
- [x] F81 CSS color picker
- [x] F82 CSS gradient previews
- [x] F83 CSS unit conversion
- [x] F84 CSS media query completion
- [x] F85 CSS container query completion
- [x] F86 CSS pseudo-class completion
- [x] F87 CSS pseudo-element completion
- [x] F88 CSS nesting support
- [x] F89 SCSS mixin navigation
- [x] F90 SCSS variable navigation
- [x] F91 SCSS function completion
- [x] F92 SCSS partial import resolution
- [x] F93 LESS variable completion
- [x] F94 CSS Modules class completion
- [x] F95 CSS Modules class navigation

## Progress log
- 2026-10-21: Foundation: CodeMirror modes for JS / TS / JSX / TSX / HTML / CSS / SCSS / SASS / LESS; the TypeScript 5 service on the server (`server/web/`), `/api/web/*`; diagnostics, completion with auto-imports, Quick Info, F12 / Shift+F12 / Alt+F12 / F2 / Ctrl+. / Shift+Alt+F for scripts. The desktop app ships `typescript5` beside its API bundle.
- 2026-10-21: F1. Extract to type alias (and to interface) from the TypeScript service, on a selected type.
- 2026-10-21: F2, F3. Studio actions on the TypeScript syntax tree (server/web/customs/types.ts): extends clauses become an intersection and back; modifiers and type parameters kept.
- 2026-10-21: F4, F5. TypeScript code fixes Add missing properties and Implement interface in Quick Actions.
- 2026-10-21: F6, F7, F8. Studio actions on the type checker (customs/annotations.ts): explicit type arguments from the resolved signature, an annotation from the inferred type (literals widened), and removal when the initializer gives the same type.
- 2026-10-21: F9, F22. Convert to TypeScript renames the file (imports follow) and shows its typed text (JSDoc types moved into annotations, parameters typed from usage) as a diff to approve. An Explorer rename or move of a script or folder updates the imports that point at it (getEditsForFileRename), as diffs to approve. Fixed on the way: the Explorer did not list .ts / .js / .html / .css files.
- 2026-10-21: F10, F11, F13. Generate JSDoc comment (Quick Action, or /** then Enter above a declaration) from TypeScript's doc template; Annotate with type from JSDoc and Convert to async function from the TypeScript service.
- 2026-10-21: F12, F14, F15, F16. Studio actions (customs/functions.ts): a Node-style callback becomes a Promise with .then / .catch; an async function becomes a .then chain (not offered with try/catch); a function declaration becomes a const arrow function (not offered when it uses this, arguments, overloads or is a generator); the rewritten code is formatted. Arrow to function declaration: TypeScript's Convert to named function.
- 2026-10-21: F17, F18, F19, F20, F21. Convert to ES module and Add import from (TypeScript code fixes); Convert to CommonJS module (studio action: imports to require, exports to module.exports); Organize imports (Quick Action and Shift+Alt+O) and Remove unused imports from TypeScript's organizeImports.
- 2026-10-21: F23. Code ▸ Analyze ▸ Find Circular Imports (web and desktop menus): the import graph of the scripts (imports, re-exports, dynamic import, require; type-only imports left out) and its cycles with the imports that close them.
- 2026-10-21: F24, F25. F12 on a symbol declared in node_modules typings or TypeScript's lib.*.d.ts opens the declaration file read-only at the declaration. Navigate ▸ Go to Source-Mapped Location (web and desktop) jumps from generated code to the original source through its source map (sourceMappingURL file or data: URL, or a .map beside it) and back (source-map-js).
- 2026-10-21: F26, F27, F28, F29, F30. Studio actions (customs/expressions.ts): Introduce object destructuring for a variable used only through property reads; destructuring back to property access (references filtered to the variable, shorthand keys kept); null checks to ??. Optional chaining and template strings are TypeScript refactorings. Convert to CommonJS is now offered in JavaScript files only.
- 2026-10-21: F32, F36, F37, F38, F39, F40, F41, F42. From the TypeScript service and CodeMirror's JSX mode: Extract to constant on JSX, F12 to the component, Shift+F12 usages, F2 on a tag (opening and closing tags, declaration) or an attribute (props type and usages), tags closed as you type, components auto-imported from completion, Add missing attributes.
- 2026-10-21: F31, F33, F34, F35, F43, F44, F45. Studio actions on the TypeScript tree (customs/react.ts): JSX to a component with the locals it uses as typed props; class components to function components (state to useState, mount / unmount to useEffect, this.* rewritten, hooks imported); props generated from the attributes of every usage; props types moved to an interface NameProps (types from usages and defaults); style={{…}} to a class in the component's stylesheet (created and imported when missing, CSS module aware, a diff to approve); inline JSX handlers to handleX constants; inline callbacks to named functions (renderItem for JSX maps).
- 2026-10-21: F46, F47, F48. eslint-plugin-react-hooks (exhaustive-deps, rules-of-hooks) run in-process with ESLint 9's Linter and Babel 7's parser (server/web/hooksLint.ts), loaded on first use: warnings and errors in the editor, and Update the dependencies array as a Quick Action. Babel 8's parser was not usable: it parses in a worker thread and blocks the API waiting for it.
- 2026-10-21: F49, F50. Navigate ▸ Go to Context Provider (web and desktop): from a context or a useContext call to every <Ctx.Provider> and React 19 <Ctx value> (server/web/react.ts). JSX using a component with propTypes is checked for missing required props, undeclared props and literals of the wrong kind (TSX props are checked by TypeScript). Fixed on the way: .jsx, .mts, .cts, .sass, .less, .vue, .svelte, .xhtml and .map files could not be opened (Unsupported source file).
- 2026-10-21: F51, F52, F53, F54, F55, F56, F57, F58, F59, F60, F61, F62, F63, F64, F65, F66, F67, F68, F69, F70. VS Code's HTML language service on the server (server/web/markup.ts): tag, attribute, value and entity completion, the project's custom elements (customElements.define with observedAttributes, html.customData) and CSS completion inside <style> and style=""; document formatting. CodeMirror's HTML mode closes tags and folds elements; linked editing (editor.linkedEditing) renames tag pairs. Studio checks: tag structure, unknown / duplicate / out-of-range attributes, nesting, image alt, labels, button and link text, html lang, iframe title, duplicate ids, ARIA roles, boolean and id-reference attributes. Quick Actions: wrap with <div>, remove a tag keeping its content, characters to entities and back. F12 / Shift+F12 on id references and class names. Fixed on the way: a watch restart could start the API before the previous instance had released its port, and the API then stayed down.
- 2026-10-21: F71, F72, F73, F74, F75, F76, F77, F78, F79, F80, F81, F82, F83, F84, F85, F86, F87, F88, F89, F90, F91, F92, F93, F94, F95. VS Code's CSS, SCSS and LESS services on the server (server/web/styles.ts): property, value, at-rule, media feature, pseudo-class / -element and SCSS function completion, validation and vendor-prefix lint, selector specificity on hover, formatting; added by the studio: classes and ids of the project's markup as selectors, container names and features, SCSS functions and SCSS / LESS variables of other files, custom properties / mixins / variables / partials across files (F12, Shift+F12), unresolved partials, shorthand expand / combine, add and drop vendor prefixes, px / rem / em / ms / s / deg / turn conversions. Colour swatches (click for the colour picker, value kept in its format) and gradient previews in the editor. CSS Modules: typings generated from the stylesheet (allowArbitraryExtensions), so styles. completes class names, unknown classes are errors and F12 goes to the rule.
