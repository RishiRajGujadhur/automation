# Rider and VS Code features (1–400)

The list of features asked for on 2026-10-21, numbered as given (gaps in the numbering are the list's own). Features
that already existed are ticked with where they are; the rest are built one at a time, each pushed when done and
ticked here with its date. Refactorings marked "Quick Actions" are Roslyn's own, offered by the language server
(Ctrl+. / Alt+Enter); they were checked with a live probe of the server.

Legend: `[x]` done · `[ ]` to do.

## Settings (from the screenshots)

- [x] S1. VS Code–style settings with ids, modified bar, reset, `@modified`, settings.json — VSCODE-20.md V1
- [x] S2. Settings categories as a collapsible tree (Text Editor ▸ Minimap, Workbench ▸ …), as in VS Code — Settings nav: chevrons, ←/→, remembered (2026-10-21)

## Debugging

- [x] 1. Conditional breakpoints — breakpoint Conditions (expression, "when changed")
- [x] 2. Hit-count breakpoints — breakpoint hit count conditions; hit counts in the Breakpoints window
- [x] 3. Logpoints — tracepoints with `{expr}` and `$FUNCTION`, `$CALLER`, `$TID`
- [x] 4. Exception breakpoints — Exception Settings, break on specific exception types
- [x] 5. Function breakpoints — Debug ▸ New Function Breakpoint
- [ ] 6. Data breakpoints
- [x] 7. Inline variable inspection — inline values while debugging
- [x] 8. Expression evaluation — Evaluate Expression / Immediate
- [x] 9. Watch expressions — Watch window, Add Watch
- [ ] 10. Set next statement
- [x] 11. Run to cursor
- [x] 12. Force run to cursor — DB (DEBUG-20.md)
- [ ] 13. Smart step into
- [ ] 14. Step filters
- [ ] 15. Async call stack navigation
- [x] 16. Parallel thread debugging — Threads window (switch thread, frames per thread)
- [ ] 17. Multi-process debugging
- [ ] 18. Remote debugging
- [ ] 19. Attach to running process
- [x] 20. Debugger visualizers — Text / JSON / XML and IEnumerable (table)
- [ ] 21. Debugger display attributes
- [ ] 22. Custom variable formatting
- [x] 23. Debugger expression pinning — pinned DataTips
- [ ] 24. Breakpoint groups
- [x] 25. Dependent breakpoints
- [x] 26. Temporary breakpoints
- [ ] 27. Breakpoint conditions based on object instances
- [ ] 28. Edit and Continue
- [ ] 29. Hot Reload
- [ ] 30. Compound debug configurations

## Code Navigation & Exploration

- [x] 31. Call hierarchy — Ctrl+Alt+H
- [x] 32. Type hierarchy — Ctrl+H
- [ ] 33. Method hierarchy
- [x] 34. Find usages — Shift+F12, Find Step Usages
- [x] 35. Find derived types — Type Hierarchy (derived tree), inheritance gutter
- [x] 36. Find implementations — Ctrl+F12
- [x] 37. Go to declaration — F12
- [x] 38. Go to implementation — Ctrl+F12
- [x] 39. Go to base symbol — Go To Base
- [x] 40. Navigate to symbol — Go to All / symbols
- [x] 41. Navigate to file — Go to All / files
- [x] 42. Navigate to recent files — Ctrl+E
- [x] 43. Navigate to recently edited locations — Recent Locations, Go to Last Edit Location
- [x] 44. Navigate to related files — Go to Related Files, Go to Test / Test Subject
- [x] 45. File structure popup — Ctrl+Alt+F12
- [x] 46. Breadcrumb navigation — breadcrumbs / navigation bar
- [ ] 47. Semantic code search
- [x] 48. Scoped search — Find in Folder, Search Only in Open Editors, Explorer: Scope to This
- [x] 49. Structural search — Search with Pattern
- [x] 50. Search Everywhere — Shift twice
- [x] 51. Bookmarks with mnemonics — numbered bookmarks (Ctrl+Shift+digit)
- [ ] 52. Named bookmark lists
- [x] 53. Navigation history — Back / Forward
- [x] 54. CodeLens references
- [x] 55. Code Vision annotations — authors above scenarios, step usages
- [x] 56. Peek definition — Alt+F12
- [ ] 57. Peek references
- [x] 58. Hierarchical symbol navigation — Structure window, breadcrumbs
- [ ] 59. Decompiled source navigation
- [ ] 60. External source navigation

## Refactoring & Code Transformation

- [ ] 61. Change method signature
- [x] 62. Extract method — Ctrl+Alt+M
- [x] 63. Extract interface
- [ ] 64. Extract superclass
- [x] 65. Extract local variable — Ctrl+Alt+V
- [x] 66. Extract constant — Quick Actions: Introduce constant
- [ ] 67. Extract field
- [ ] 68. Extract property
- [x] 69. Extract parameter — Ctrl+Alt+P
- [x] 70. Inline method — Ctrl+Alt+N
- [x] 71. Inline variable — Ctrl+Alt+N
- [ ] 72. Inline field
- [x] 73. Move type — Move Type to Matching File
- [ ] 74. Move members
- [ ] 75. Pull members up
- [ ] 76. Push members down
- [x] 77. Safe symbol rename — F2 (Roslyn Renamer, across files)
- [x] 78. Change namespace — Sync Namespace with Folder
- [x] 79. Convert method to property — Quick Actions: Replace 'GetX' with property
- [x] 80. Convert property to method — Quick Actions: Replace 'X' with methods
- [x] 81. Encapsulate field — Quick Actions
- [ ] 82. Introduce factory method
- [ ] 83. Replace constructor with factory
- [x] 84. Convert loops to LINQ — Quick Actions: Convert to LINQ
- [ ] 85. Convert LINQ to loops
- [x] 86. Convert anonymous types to named types — Quick Actions: Convert to class / record
- [x] 87. Convert anonymous functions to methods — Quick Actions: Use local function, then Convert to method (2026-10-21)
- [ ] 88. Convert methods to local functions
- [x] 89. Convert local functions to methods — Quick Actions: Convert to method
- [x] 90. Convert class to record — Quick Actions: Convert to positional record
- [ ] 91. Convert record to class
- [x] 92. Convert switch statements to expressions — Quick Actions (IDE0066): Convert switch statement to expression (2026-10-21)
- [x] 93. Convert if statements to switch — Quick Actions
- [x] 94. Invert conditional — Quick Actions: Invert if
- [x] 95. Merge nested conditionals — Quick Actions
- [x] 96. Split conditional expressions — Quick Actions: Split into nested 'if'
- [x] 97. Replace magic values with constants — Quick Actions: Introduce constant for all occurrences
- [ ] 98. Reorder method parameters
- [ ] 99. Remove unused parameters
- [x] 100. Batch code cleanup — Code Cleanup in Solution

## Code Analysis & Quality

- [x] 101. Solution-wide code inspections — Problems (Alt+Shift+6)
- [x] 102. Custom inspection severity levels — Configure Severity
- [x] 103. Nullability analysis — compiler nullable warnings in the editor and Problems
- [x] 104. Control-flow analysis — Code ▸ Analyze Control Flow (selected statements: reachable start / end, returns, entry and exit points) (2026-10-21)
- [x] 105. Data-flow analysis — Code ▸ Analyze Data Flow (flows in / out, read, written, always assigned, declared, captured) (2026-10-21)
- [x] 106. Unreachable code detection — compiler CS0162 in the editor and Problems
- [x] 107. Dead code detection — IDE0035: unreachable code faded, Remove unreachable code (2026-10-21)
- [x] 108. Unused symbol detection — IDE0051 / IDE0060: unused private members and parameters faded (2026-10-21)
- [x] 109. Redundant assignment detection — IDE0059: faded, Remove redundant assignment (2026-10-21)
- [x] 110. Redundant type declaration detection — IDE0090 / IDE0007: suggestions, Use 'new(...)' (2026-10-21)
- [x] 111. Code style enforcement — .editorconfig code style options (e.g. var preferences) as warnings, fix in Quick Actions (2026-10-21)
- [x] 112. EditorConfig integration — EditorConfig designer, Gherkin formatting from .editorconfig
- [x] 113. Roslyn analyzer integration — Roslyn IDE analyzers in the language server: suggestions, faded unused code, fixes in Quick Actions (2026-10-21)
- [x] 114. Custom analyzer configuration — .editorconfig dotnet_diagnostic.<id>.severity drives the IDE analyzers (warning stays faded) (2026-10-21)
- [x] 115. Suppression of individual inspections — Error List: Suppress in Project File
- [x] 116. Inspection exclusion scopes — .editorconfig sections: generated_code / dotnet_analyzer_diagnostic.severity = none per glob (2026-10-21)
- [x] 117. Quick-fix previews — Quick Actions: the highlighted action's diff beside the list (2026-10-21)
- [x] 118. Bulk quick-fix application — Quick Actions: '… (fix all in document / project / solution)' with Roslyn's Fix All (2026-10-21)
- [ ] 119. Duplicate code detection
- [ ] 120. Structural Search and Replace templates
- [ ] 121. Dependency cycle detection
- [ ] 122. Layer dependency rules
- [ ] 123. Namespace consistency inspections
- [ ] 124. API compatibility inspections
- [ ] 125. Public API change tracking

## Testing

- [x] 126. Test discovery — NUnit / xUnit / MSTest and scenarios
- [x] 127. Test Explorer
- [x] 128. Parameterized test execution — test cases and Scenario Outline rows
- [x] 129. Test case filtering — search filters, `tag:`, failed only
- [x] 130. Test category grouping — Group By (category / tag)
- [x] 131. Test session management — playlists
- [x] 132. Continuous testing — failed tests on save
- [x] 133. Run failed tests
- [x] 134. Rerun affected tests — Run Impacted Tests
- [x] 135. Debug individual tests
- [x] 136. Test result navigation — failure details, go to the failing line
- [x] 137. Test execution history — Test history
- [x] 138. Test output capture — test details: output, message, stack trace
- [x] 139. Test fixture navigation — Go To Hooks, Go to Test / Test Subject
- [x] 140. Test framework integration — NUnit, xUnit, MSTest, Reqnroll / SpecFlow
- [x] 141. Test coverage highlighting
- [ ] 142. Branch coverage visualization
- [x] 143. Test coverage gutters

## Git & Version Control

- [x] 146. Interactive rebase — Git Log: Interactively Rebase from Here… (pick, reword, squash, fixup, drop, reorder; a conflict is undone) (2026-10-21)
- [x] 147. Commit squashing — Git Log: Squash to HEAD… (one commit with a new message) (2026-10-21)
- [x] 148. Commit cherry-picking — Git Log: Cherry-Pick
- [x] 149. Partial staging — Stage Selected Lines
- [x] 150. Git blame annotations — inline blame
- [x] 151. Git history graph — Git Log
- [x] 152. File history inspection — Show History for File
- [x] 153. Line history inspection — Show History for Selection
- [x] 154. Three-way merge editor — Git Changes: Open Merge Editor on a conflicted file (Current, Incoming, Result; Accept per conflict; Complete Merge stages it) (2026-10-21)
- [x] 155. Conflict resolution tools — merge conflict actions (current / incoming / both)
- [x] 156. Git worktree management — Git Changes ▸ Worktrees: list, add (new / existing branch), open in the studio, remove (2026-10-21)
- [x] 157. Git stash management — Shelf (stash)
- [x] 158. Shelve changes — Shelf
- [x] 159. Changelist management — Git Changes: Move to Changelist…, a group per changelist, Commit changelist, Delete changelist (2026-10-21)
- [x] 160. Local History
- [x] 161. Compare branches — Compare with Branch
- [x] 162. Compare commits — Git Log: Ctrl+click a second commit, files that differ and the patch (2026-10-21)
- [x] 163. Revert individual hunks — Rollback Lines, change gutter
- [x] 164. Git bisect integration — Git Log: Bisect: Mark Bad / Mark Good; Good, Bad, Skip, Reset Bisect until the first bad commit (2026-10-21)
- [x] 165. Commit message templates — Git Changes: the commit box starts with commit.template / .gitmessage; its # comments are left out (2026-10-21)

## Editor Productivity & Customization

- [x] 166. Multiple carets
- [x] 167. Column selection mode
- [x] 168. Expand selection
- [x] 169. Shrink selection
- [x] 170. Surround with templates
- [x] 171. Live Templates
- [x] 172. Postfix completion templates
- [x] 173. Custom code snippets — Save as Live Template
- [ ] 174. Snippet placeholder transformations
- [x] 175. Linked editing — editor.linkedEditing: XML / HTML / project files rename the matching tag as you type (2026-10-21)
- [x] 176. Code folding regions — `#region` folding
- [x] 177. Custom folding patterns — editor.foldingMarkers.start / end: // region … // endregion, // <editor-fold> … // </editor-fold> (2026-10-21)
- [x] 178. Sticky scroll
- [x] 179. Semantic syntax highlighting — C#: Roslyn classifications (types, interfaces, members, locals, parameters, static); editor.semanticHighlighting.enabled (2026-10-21)
- [x] 180. Inlay hints
- [x] 181. Parameter name hints
- [x] 182. Type hints
- [x] 183. Custom file templates — New File from Template
- [x] 184. Custom keymaps — keyboard shortcut editor
- [x] 185. Context-aware intentions — Quick Actions (Alt+Enter / Ctrl+.)

## Advanced Editor Features

- [x] 201. Regex-based find and replace
- [x] 202. Multi-file regex replacement — Search: Replace with regex
- [x] 203. Search result editor — Search ▸ Open in Editor: a .code-search document; double-click / F12 / Enter on a result opens it (2026-10-21)
- [x] 204. Search editor result persistence — Saved search editors (.tas/searches) listed in the Search view, run again when reopened (2026-10-21)
- [x] 205. Search exclusion patterns — files to include / exclude
- [x] 206. Case-preserving replacement — Search ▸ Replace: Preserve Case (AB) (2026-10-21)
- [x] 207. Unicode character highlighting — editor.unicodeHighlight.* (invisible, ambiguous, non-basic ASCII, comments) (2026-10-21)
- [x] 208. Invisible character rendering — editor.renderWhitespace (VSCODE-20.md V9)
- [x] 209. Indentation guides
- [x] 210. Bracket pair colorization
- [x] 211. Bracket pair guides — editor.guides.bracketPairs (true / active / false), editor.guides.highlightActiveBracketPair (2026-10-21)
- [x] 212. Automatic import organization — Organize Usings
- [x] 213. Automatic import removal — remove unused usings
- [ ] 214. Import alias generation
- [x] 215. Namespace import optimization — Organize Usings, Code Cleanup
- [x] 216. Code formatting on save — editor.formatOnSave: C# (Roslyn + .editorconfig), feature files, JSON (2026-10-21)
- [x] 217. Code actions on save — editor.codeActionsOnSave.organizeImports: sort and remove unnecessary usings on save (2026-10-21)
- [x] 218. Format modified lines only — editor.formatOnSaveMode = modifications: only the lines changed since the last save (C#) (2026-10-21)
- [x] 219. Language-specific formatting rules — .editorconfig
- [ ] 220. Custom language injection

## Advanced Project & Solution Management

- [ ] 241. Solution filter support
- [x] 242. Solution configuration switching — Build configuration (Debug / Release)
- [ ] 243. Project configuration switching
- [ ] 244. Conditional compilation symbol management
- [x] 245. Project reference management — Project Properties: Project References
- [x] 246. NuGet package management
- [ ] 247. NuGet package source configuration
- [ ] 248. Central package version management
- [ ] 249. MSBuild target inspection
- [x] 250. MSBuild property evaluation — Project Properties: effective values
- [ ] 251. Custom MSBuild task execution
- [ ] 252. Project template creation
- [ ] 253. Solution template creation
- [ ] 254. Shared project support
- [ ] 255. Linked file management
- [ ] 256. Generated source inspection
- [ ] 257. Source generator output navigation
- [ ] 258. Source generator debugging
- [x] 259. Conditional compilation branch highlighting — C#: code an #if leaves out is greyed (DEBUG, TRACE, target framework, DefineConstants); the language service parses with these symbols (2026-10-21)
- [x] 260. Target framework switching — Upgrade Target Framework

## Advanced Navigation & Search

- [x] 321. Navigate to matching brace
- [x] 322. Navigate to next highlighted error
- [x] 323. Navigate to previous highlighted error
- [x] 324. Navigate between TODO comments — Navigate ▸ Next / Previous TODO (the TODO patterns, comments only) (2026-10-21)
- [x] 325. Custom TODO patterns
- [x] 326. TODO comment filtering — TODO window: filter by keyword (existing)
- [x] 327. Navigate to next method
- [x] 328. Navigate to previous method
- [x] 329. Navigate between changed lines
- [x] 330. Navigate between merge conflicts — Navigate ▸ Next / Previous Merge Conflict (2026-10-21)
- [x] 331. Navigate to next occurrence — Find Next Selected
- [x] 332. Navigate to previous occurrence — Find Previous Selected
- [x] 333. Navigate to next code inspection — Next Problem in File
- [x] 334. Navigate to next compiler warning — Navigate ▸ Next / Previous Warning; the C# editor now shows the compiler's semantic warnings and errors (2026-10-21)
- [x] 335. Navigate to next test failure — Navigate ▸ Next Test Failure (each failed test of the last run, with its message) (2026-10-21)
- [x] 336. Search within selected text — Edit ▸ Find in Selection; Alt+L / 'in selection' in the find panel (2026-10-21)
- [x] 337. Search within open editors
- [x] 338. Search within ignored files — Search: 'Use Exclude Settings and Ignore Files' toggle (2026-10-21)
- [x] 339. Search using glob patterns
- [x] 340. Search with multiline regular expressions — Find in Files / Replace All: regex with \n matches across lines (2026-10-21)

## Advanced C# Development

- [x] 341. Generate XML documentation stubs — `///`
- [ ] 342. Inherit XML documentation from base members
- [x] 343. Generate `ToString()` implementations
- [ ] 344. Generate comparison members
- [ ] 345. Generate `IEquatable<T>` implementations
- [x] 346. Generate `IDisposable` implementation patterns — Quick Actions: Implement interface with Dispose pattern
- [ ] 347. Generate `IAsyncDisposable` implementation patterns
- [x] 348. Generate null argument guards — Add Null Checks for Parameters
- [x] 349. Generate constructor parameter assignments — Generate Constructor
- [x] 350. Convert fields to auto-properties — Quick Actions (IDE0032): Use auto property (2026-10-21)
- [x] 351. Convert auto-properties to full properties — Quick Actions
- [x] 352. Convert properties to expression-bodied members — Convert to Expression Body
- [x] 353. Convert expression-bodied members to block bodies — Convert to Block Body
- [x] 354. Convert string concatenation to interpolation — Quick Actions
- [ ] 355. Convert interpolation to composite formatting
- [x] 356. Convert anonymous objects to tuples — Quick Actions: Convert to tuple
- [x] 357. Convert tuples to named types — Quick Actions: Convert to struct / record struct (titles now complete) (2026-10-21)
- [x] 358. Convert foreach loops to indexed loops — Quick Actions: Convert to 'for'
- [x] 359. Convert indexed loops to foreach — Quick Actions: Convert to 'foreach'
- [x] 360. Generate switch cases for enum members — Quick Actions (IDE0010): Add missing cases / default / both (2026-10-21)

## Advanced IDE Windows & Layouts

- [x] 381. Editor tab pinning
- [x] 382. Editor tab preview mode
- [x] 383. Editor tab grouping — The side editor group has its own tab strip (several files, switch, close) (2026-10-21)
- [x] 384. Split editor horizontally — View ▸ Split Editor Down / Right (workbench.editor.openSideBySideDirection) (2026-10-21)
- [x] 385. Split editor vertically — Split Right / Open to the Side
- [x] 386. Move editors between groups — View ▸ Move Editor into Next / Previous Group (2026-10-21)
- [x] 387. Open files in a floating editor window — View ▸ Open in New Window: the file alone in its own browser / desktop window (2026-10-21)
- [x] 388. Zen Mode — View ▸ Zen Mode (Ctrl+K Z), Workbench ▸ Zen Mode settings (full screen, center, line numbers, status bar, tabs, silent notifications) (2026-10-21)
- [x] 389. Distraction Free Mode
- [x] 390. Centered editor layout
- [x] 391. Custom activity bar positioning — workbench.activityBar.location: left (default), right, hidden (2026-10-21)
- [x] 392. Custom panel positioning — workbench.panel.defaultLocation: bottom, left, right; the panel's move button cycles them (2026-10-21)
- [x] 393. Secondary sidebar — View ▸ Secondary Side Bar (Ctrl+Alt+B): a chosen tool window on the right (2026-10-21)
- [x] 394. Hide or reveal individual tool windows
- [x] 395. Save custom window layouts
- [x] 396. Restore editor layout — reopen files where you left them
- [x] 397. Maximize editor group — View ▸ Maximize Editor Group (Ctrl+K Ctrl+M) (2026-10-21)
- [x] 398. Editor group locking — Side group: Lock Group (new editors open in the main group) (2026-10-21)
- [x] 399. Independent editor group scrolling — the split editor and the tab group scroll on their own (existing)
- [x] 400. Synchronized scrolling between diff panes — Compare windows: Unified / Side by Side; the panes scroll together (Synchronized scrolling) (2026-10-21)

## Progress log
- 2026-10-21 Created: existing features ticked.
- 2026-10-21 S2: Text Editor and Workbench fold their sub-categories in the Settings nav; arrow keys expand and collapse; the state is remembered; a search shows everything.
- 2026-10-21 113: The language server runs Roslyn's IDE analyzers (Visual Studio's IDE rules): suggestions and faded unused code in the C# editor, their fixes (Hidden rules too) in Quick Actions; nested action titles like 'updating usages' keep their parent.
- 2026-10-21 107: Unreachable code is faded in the C# editor and removed with a Quick Action.
- 2026-10-21 108: Unused private fields, methods and unused parameters are faded.
- 2026-10-21 109: Values assigned and never read are faded; Quick Actions remove the assignment.
- 2026-10-21 110: Repeated types in declarations are suggested for simplification ('new' expression, var).
- 2026-10-21 357: A tuple becomes a struct or record struct with its usages updated; the nested action titles now say which scope.
- 2026-10-21 92: Switch statements become switch expressions (the IDE analyzer's fix).
- 2026-10-21 360: A switch over an enum gets a case per missing member.
- 2026-10-21 87: A lambda becomes a local function (IDE0039) and then a method.
- 2026-10-21 350: A field with a trivial property becomes an auto-property.
- 2026-10-21 114: Rule severities from .editorconfig (error, warning, suggestion, none) apply to the analyzers in the editor; unused code raised to a warning is both squiggled and faded.
- 2026-10-21 111: Code style options with a severity in .editorconfig are enforced in the editor.
- 2026-10-21 116: A glob section of .editorconfig turns inspections off for matching files (generated code, a folder).
- 2026-10-21 117: The highlighted Quick Action shows removed and added lines (and other files it touches) before it is applied.
- 2026-10-21 118: Each fix offers Fix All in the document, the project or the solution (Roslyn's FixAllProvider over compiler and IDE analyzer diagnostics).
- 2026-10-21 324: Next / Previous TODO goes to the TODO, FIXME, HACK, BUG (or custom) keywords in comments; TODO filtering already existed in the TODO window.
- 2026-10-21 330: Previous Merge Conflict added next to the existing Next Merge Conflict.
- 2026-10-21 334: The C# editor shows the compiler's semantic diagnostics (unused variables, unknown names) live from the language server; Next / Previous Warning visits them.
- 2026-10-21 335: Next Test Failure opens the failed tests of the last run one after another and shows the first line of the failure.
- 2026-10-21 206: Replace All keeps each match's case (foo → bar, Foo → Bar, FOO → BAR, camelCase / PascalCase).
- 2026-10-21 340: A regular expression containing a line break searches whole files; replacements keep CRLF line ends.
- 2026-10-21 338: Turning the toggle off searches the ignored folders (bin, obj, node_modules…) too.
- 2026-10-21 203: Find in Files results open as a search editor document (VS Code's format) whose result lines open their location.
- 2026-10-21 204: Search editors are saved under .tas/searches (kept out of Git) and rerun from their # header when opened from the Search view's history.
- 2026-10-21 207: Look-alike characters in mixed words (Cyrillic а in admin, typographic quotes) and invisible characters get a box with an explanation; prose files skip look-alikes.
- 2026-10-21 211: Bracket pairs over several lines get a vertical guide at the closing bracket's column, coloured by depth; the pair around the caret is brighter; 'active' shows only that one.
- 2026-10-21 177: Comment-marked regions fold (nested too); the start and end patterns are settings.
- 2026-10-21 175: Typing in an opening or closing tag name renames its partner (comments, CDATA and self-closing tags skipped).
- 2026-10-21 336: Find in Selection limits Enter, Shift+Enter, Select All and Replace All of the find panel to the selected text, shaded while it is the scope.
- 2026-10-21 216: Saving formats the file first (C# with Roslyn and .editorconfig, Gherkin, JSON); the editor takes the formatted text.
- 2026-10-21 218: Format on save can format only the lines changed since the file was last saved, leaving the rest as it is.
- 2026-10-21 217: Saving a C# file can organize its usings first.
- 2026-10-21 388: VS Code's Zen Mode: only the editor, with its zenMode.* settings; Escape twice or the Exit button leaves it.
- 2026-10-21 384: The split editor opens below or beside the tab group; the direction is a setting.
- 2026-10-21 397: The editor group with focus (tab group or split editor) fills the editor area until toggled back.
- 2026-10-21 165: The commit message box starts with the repository's commit template; comment lines are stripped on commit and an untouched template cannot be committed.
- 2026-10-21 162: Two commits compare in Git Log: the files that differ between them and the full patch.
- 2026-10-21 146: Interactive rebase from a Git Log commit: each commit up to HEAD can be picked, reworded, squashed, fixed up, dropped or moved; the studio writes the todo list, uncommitted work is stashed around it and a conflict aborts the rebase.
- 2026-10-21 147: The selected commit and every later one become one commit with a new message.
- 2026-10-21 156: Worktrees of the repository in Git Changes: add one beside the repository, open it as the workspace, remove it (not the main or the open one).
- 2026-10-21 164: git bisect from Git Log: mark a bad and a good commit, then test each commit git checks out until it names the first bad one; git commands also retry when the index is locked by a concurrent refresh.
- 2026-10-21 159: Changed files can be grouped in named changelists (kept per repository); each changelist commits on its own, leaving the other changes uncommitted.
- 2026-10-21 154: A three-way merge editor for conflicted files: both sides read-only over the editable result; Complete Merge refuses while conflict markers remain.
- 2026-10-21 391: The activity bar can sit on the right edge of the window or be hidden (Workbench, Appearance).
- 2026-10-21 392: The panel (Build, Debug, Output…) docks below, left or right of the editors; the place is a setting.
- 2026-10-21 393: A second side bar on the right of the editors shows Structure, Problems, Git Log, Terminal or another tool window; the choice is remembered.
- 2026-10-21 400: Differences can be shown side by side with aligned rows; both panes scroll together unless Synchronized scrolling is unticked.
- 2026-10-21 383: The split editor became an editor group with its own tabs.
- 2026-10-21 386: The active editor moves between the main tab group and the side group.
- 2026-10-21 398: A locked side group takes no new editors; Open to the Side then opens in the main group.
- 2026-10-21 387: A file opens in a floating window of its own (web pop-up, desktop window) with the same editor features and saving.
- 2026-10-21 259: Inactive preprocessor branches are greyed with the symbols listed in their tooltip; the language service now compiles each project with DEBUG, TRACE, its framework symbols and DefineConstants.
- 2026-10-21 179: Semantic highlighting from the language service colours types, interfaces, methods, properties, fields, locals and parameters; a setting turns it off.
- 2026-10-21 104: Roslyn's control-flow analysis of the selected statements as a report.
- 2026-10-21 105: Roslyn's data-flow analysis of the selected statements or expression as a report.
