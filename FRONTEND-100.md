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
- [ ] F23 Detect circular module dependencies
- [ ] F24 Navigate TypeScript declaration files
- [ ] F25 Navigate source maps
- [ ] F26 Extract object destructuring
- [ ] F27 Convert destructuring to property access
- [ ] F28 Convert optional checks to optional chaining
- [ ] F29 Convert null checks to nullish coalescing
- [ ] F30 Convert string concatenation to template literals

## React & JSX / TSX
- [ ] F31 Extract JSX into React component
- [ ] F32 Extract JSX into reusable variable
- [ ] F33 Convert class components to functional components
- [ ] F34 Generate React component props
- [ ] F35 Generate TypeScript props interfaces
- [ ] F36 Navigate React component definitions
- [ ] F37 Find React component usages
- [ ] F38 Rename JSX component tags
- [ ] F39 Rename JSX attributes
- [ ] F40 Auto-close JSX tags
- [ ] F41 Auto-import React components
- [ ] F42 Generate missing JSX attributes
- [ ] F43 Convert inline JSX styles to CSS classes
- [ ] F44 Extract inline event handlers
- [ ] F45 Convert inline callbacks to named functions
- [ ] F46 Detect missing React Hook dependencies
- [ ] F47 Apply React Hook dependency fixes
- [ ] F48 Detect invalid Hook usage
- [ ] F49 Navigate React context providers
- [ ] F50 React component prop type validation

## HTML
- [ ] F51 HTML tag name completion
- [ ] F52 HTML attribute completion
- [ ] F53 HTML attribute value completion
- [ ] F54 Automatic closing tag insertion
- [ ] F55 Linked HTML tag renaming
- [ ] F56 HTML element wrapping
- [ ] F57 HTML tag unwrapping
- [ ] F58 HTML tag structure validation
- [ ] F59 HTML attribute validation
- [ ] F60 HTML nesting validation
- [ ] F61 HTML entity completion
- [ ] F62 HTML character entity conversion
- [ ] F63 HTML accessibility inspections
- [ ] F64 HTML ARIA attribute validation
- [ ] F65 HTML ID reference navigation
- [ ] F66 HTML class reference navigation
- [ ] F67 HTML element folding
- [ ] F68 HTML document formatting
- [ ] F69 HTML custom element support
- [ ] F70 HTML language injection

## CSS, SCSS & LESS
- [ ] F71 CSS selector completion
- [ ] F72 CSS property completion
- [ ] F73 CSS value completion
- [ ] F74 CSS custom property navigation
- [ ] F75 CSS variable usage search
- [ ] F76 CSS selector specificity inspection
- [ ] F77 CSS shorthand expansion
- [ ] F78 CSS shorthand compression
- [ ] F79 CSS vendor prefix handling
- [ ] F80 CSS color previews
- [ ] F81 CSS color picker
- [ ] F82 CSS gradient previews
- [ ] F83 CSS unit conversion
- [ ] F84 CSS media query completion
- [ ] F85 CSS container query completion
- [ ] F86 CSS pseudo-class completion
- [ ] F87 CSS pseudo-element completion
- [ ] F88 CSS nesting support
- [ ] F89 SCSS mixin navigation
- [ ] F90 SCSS variable navigation
- [ ] F91 SCSS function completion
- [ ] F92 SCSS partial import resolution
- [ ] F93 LESS variable completion
- [ ] F94 CSS Modules class completion
- [ ] F95 CSS Modules class navigation

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
