# VS Code look and features (W1–W250)

Asked for on 2026-10-21: make the TestAuthoring desktop app look and work like VS Code, with at least 250 VS Code
features. VS Code (`Code.exe`) was launched with Playwright in an isolated profile and screenshotted (Quick Open,
Command Palette, Go to Symbol / Line, Find / Replace, Search, Source Control, Run and Debug, Extensions, Problems,
Terminal, split editor, Settings, Keyboard Shortcuts, breadcrumbs, peek, Zen Mode, themes, multi-cursor,
notifications, Customize Layout); the list below is what those screens and VS Code's settings have that the studio did
not. Code adapted from [microsoft/vscode](https://github.com/microsoft/vscode) (MIT) says so where it is used.

Each feature works in the web app and the desktop app (same client), has an e2e test in
`test-authoring-studio/tests/e2e/vscode250.spec.ts`, and is pushed when done. Settings use VS Code's ids and appear in
**Settings** (Ctrl+,) under Text Editor / Workbench / Features.

Legend: `[x]` done · `[ ]` to do.

## Quick Input (title-bar quick pick)
- [x] W1. Quick Open (Ctrl+P) in VS Code's Quick Input at the top of the window: files with icons, folder beside the name, recently opened first, fuzzy match highlights
- [x] W2. Command Palette (Ctrl+Shift+P, `>`): every command with its keybinding chips, "recently used" and "other commands" groups
- [x] W3. Go to Symbol in Editor (Ctrl+Shift+O, `@`): the active file's symbols, preview on arrow keys
- [x] W4. Symbols grouped by kind (`@:`), with counts
- [x] W5. Go to Line/Column (Ctrl+G, `:`): "Current Line: x, Character: y. Type a line number between 1 and n", live preview, `line:column`
- [x] W6. Go to Symbol in Workspace (Ctrl+T, `#`)
- [x] W7. Quick access help (`?`): the prefixes and what they do
- [x] W8. Open View (`view `, Ctrl+Q): side bar views, panels and pages
- [ ] W9. Show All Editors by MRU (`edt `)
- [ ] W10. Quick text search (`%`): lines matching the text across files, open at the match
- [ ] W11. Open to the side from Quick Open (Ctrl+Enter / the split button)
- [ ] W12. Remove from Recently Opened (× on a recent entry)
- [ ] W13. workbench.quickOpen.closeOnFocusLost
- [ ] W14. workbench.quickOpen.preserveInput / workbench.commandPalette.preserveInput
- [ ] W15. workbench.commandPalette.history (how many recent commands)
- [ ] W16. Quick Input history: Ctrl+↑ / Ctrl+↓ (quickInput.history) cycles earlier queries
- [ ] W17. Quick Input: Ctrl+P again moves down, Ctrl+Shift+Tab / Ctrl+Tab navigation inside
- [ ] W18. Command palette: configure the keybinding of a command (gear on a row)
- [ ] W19. Command palette: "similar commands" for a query without exact match (word match on titles)
- [ ] W20. Quick Input position (workbench.quickInput.position: top / center)

## Status bar
- [ ] W21. Status bar in VS Code colours: blue normally, purple with no folder, orange while debugging
- [ ] W22. Remote indicator (bottom-left `><`): quick pick of window actions (open folder, new window, close folder)
- [ ] W23. Language mode item → Change Language Mode (Ctrl+K M) quick pick, per file
- [ ] W24. Configure File Association for '.ext' (files.associations)
- [ ] W25. Encoding item → Reopen with Encoding / Save with Encoding quick pick
- [ ] W26. files.encoding (default) and UTF-8 with BOM preserved on save
- [ ] W27. Line ending item as VS Code quick pick (Select End of Line Sequence)
- [ ] W28. Indentation item as VS Code quick pick: Indent Using Spaces / Tabs, Change Tab Display Size, Detect Indentation from Content, Convert Indentation to Spaces / Tabs
- [ ] W29. Problems item `⊗ n ⚠ n ⓘ n` toggles the Problems panel
- [ ] W30. Status bar context menu: hide / show each item (persisted), "Hide Status Bar"
- [ ] W31. Notifications bell with a dot for unread and a slashed bell in Do Not Disturb
- [ ] W32. Git blame of the caret line in the status bar (git.blame.statusBarItem.enabled)
- [ ] W33. Branch item → Checkout to… quick pick (branches, tags, Create new branch…)
- [ ] W34. Sync item `↓n ↑n` (pull and push) with a spinner while syncing
- [ ] W35. Editor selection: `Ln, Col` and `(n selected)` with VS Code's format

## Notifications
- [ ] W36. VS Code toasts: severity icon, message, "Source:", gear, close, action buttons, bottom-right stack
- [ ] W37. Notification Center (Notifications: Show Notifications): list, collapse, clear one / all, Do Not Disturb toggle
- [ ] W38. Progress notifications (indexing, build) with an indeterminate bar
- [ ] W39. Notifications: Focus Toast / Accept primary action (Ctrl+Shift+A? / keyboard) and Clear All (command)
- [ ] W40. Gear on a toast: "Don't show again" for that kind of message

## Layout
- [ ] W41. Customize Layout quick pick (visibility, side bar position, panel alignment, quick input position, modes) with reset
- [ ] W42. Panel alignment: center / justify / left / right (workbench.panel.alignment)
- [ ] W43. Primary side bar on the right (workbench.sideBar.location)
- [ ] W44. Menu bar visibility: classic / compact (a ☰ button) / toggle (Alt shows) / hidden (window.menuBarVisibility)
- [ ] W45. Command center in the title bar: `← → [🔍 folder name]`, click opens Quick Open (window.commandCenter)
- [ ] W46. Window title from window.title (${activeEditorShort}${separator}${rootName}…) and window.titleSeparator
- [ ] W47. Activity bar: Accounts and Manage (gear) menus at the bottom
- [ ] W48. Activity bar: right-click to hide / show items, drag to reorder (persisted)
- [ ] W49. Activity bar at the top of the side bar (workbench.activityBar.location: top)
- [ ] W50. workbench.activityBar.iconClickBehavior (toggle / focus)
- [ ] W51. Side bar views as collapsible sections with headers and title actions (Explorer: Open Editors, folder, Outline, Timeline)
- [ ] W52. Outline view (follow cursor, sort by position / name / category, filter on type)
- [ ] W53. Timeline view: Local History and Git commits of the active file, open diff
- [ ] W54. Open Editors view (groups, dirty dot, close, Save All, Close All)
- [ ] W55. View: Toggle Maximized Panel, Move Panel Left / Right / Bottom commands
- [ ] W56. Focus parts with F6 / Shift+F6 (Focus Next / Previous Part)
- [ ] W57. Ctrl+0 focus side bar, Ctrl+1/2/3 focus editor group, Ctrl+Shift+Y Debug Console, Ctrl+Shift+U Output
- [ ] W58. workbench.view.alwaysShowHeaderActions
- [ ] W59. workbench.tree.indent and workbench.tree.renderIndentGuides
- [ ] W60. workbench.list.smoothScrolling and workbench.list.mouseWheelScrollSensitivity

## Editors and tabs
- [ ] W61. Empty editor watermark: VS Code logo and Show All Commands / Go to File / Find in Files / Toggle Terminal keys
- [ ] W62. New Untitled Text File (Ctrl+N): Untitled-1 tabs, "Select a language" hint, Save As
- [ ] W63. workbench.editor.empty.hint and workbench.editor.untitled.labelFormat
- [ ] W64. Keep Editor (Ctrl+K Enter) turns a preview tab into a normal one
- [ ] W65. workbench.editor.enablePreview / enablePreviewFromQuickOpen / enablePreviewFromCodeNavigation
- [ ] W66. Tab decorations: errors and warnings colour the tab name (workbench.editor.decorations.colors)
- [ ] W67. Tab badges: problem counts and Git letters (workbench.editor.decorations.badges)
- [ ] W68. workbench.editor.labelFormat (default / short / medium / long) and duplicate names told apart by folder
- [ ] W69. workbench.editor.wrapTabs
- [ ] W70. workbench.editor.openPositioning (right / left / first / last)
- [ ] W71. workbench.editor.limit.enabled / value (closes the least recently used tabs)
- [ ] W72. workbench.editor.focusRecentEditorAfterClose
- [ ] W73. workbench.editor.closeOnFileDelete
- [ ] W74. workbench.editor.scrollToSwitchTabs
- [ ] W75. workbench.editor.mouseBackForwardToNavigate
- [ ] W76. workbench.editor.pinnedTabSizing (normal / compact / shrink)
- [ ] W77. workbench.editor.showIcons
- [ ] W78. workbench.editor.revealIfOpen
- [ ] W79. Editor actions "…" menu: Show Opened Editors, Close All, Close Saved, Configure Editors, Toggle Keep Editors Open
- [ ] W80. Tab context menu: Close Others, Close to the Right, Copy Relative Path, Keep Open, Split Up / Down / Left / Right
- [ ] W81. Close Saved Editors in Group (Ctrl+K U), Close Group (Ctrl+K W), Close All Groups (Ctrl+K Ctrl+Shift+W)
- [ ] W82. Revert File, Save without Formatting (Ctrl+K S)
- [ ] W83. Breadcrumbs: click a segment for a picker of siblings / symbols (VS Code)
- [ ] W84. Breadcrumbs: Focus and Select Breadcrumbs (Ctrl+Shift+.) / Focus Breadcrumbs (Ctrl+Shift+;)
- [ ] W85. breadcrumbs.filePath / breadcrumbs.symbolPath / breadcrumbs.icons
- [ ] W86. editor.stickyScroll.maxLineCount and scrollWithEditor
- [ ] W87. Editor: Toggle Sticky Scroll / Minimap / Render Whitespace / Word Wrap from the View ▸ Appearance menu
- [ ] W88. Compare Active File With… / Compare New Untitled Text Files
- [ ] W89. Editor Layout: Single, Two Columns, Three Columns, Two Rows, Grid (2×2)
- [ ] W90. Join Editor Groups / Join All Editor Groups

## Explorer
- [ ] W91. Explorer title actions in VS Code style: New File, New Folder, Refresh Explorer, Collapse Folders
- [ ] W92. Problems decorations: red / yellow file names with counts, folders inherit (explorer.decorations.colors / badges)
- [ ] W93. explorer.compactFolders (single-child folders on one row)
- [ ] W94. explorer.sortOrder (default / mixed / filesFirst / type / modified)
- [ ] W95. File nesting (explorer.fileNesting.enabled / patterns, VS Code's defaults)
- [ ] W96. explorer.autoReveal (true / false / focusNoScroll)
- [ ] W97. explorer.confirmDelete and explorer.confirmDragAndDrop
- [ ] W98. Explorer Find (Ctrl+Alt+F): highlight or filter mode
- [ ] W99. explorer.incrementalNaming (simple / smart) on paste
- [ ] W100. files.exclude (hide **/.git, **/bin…) with "Show excluded files" toggle
- [ ] W101. explorer.excludeGitIgnore
- [ ] W102. Explorer: Select for Compare / Compare with Selected
- [ ] W103. Explorer: multi-select with Ctrl / Shift, delete or copy several
- [ ] W104. Explorer: Undo / Redo file operations (Ctrl+Z, explorer.enableUndo)
- [ ] W105. Explorer: Copy Relative Path (Ctrl+K Ctrl+Shift+Alt+C) and explorer.copyRelativePathSeparator
- [ ] W106. Explorer: Open With… (text editor / preview)
- [ ] W107. Explorer: Download… (web) / Reveal in File Explorer (Shift+Alt+R)
- [ ] W108. Explorer: New File… inline input with validation (exists, leading / trailing spaces, illegal names)
- [ ] W109. explorer.openEditors.visible
- [ ] W110. Explorer: Collapse Folders in Explorer keeps the root; Expand on double-click (workbench.tree.expandMode)

## Search view
- [ ] W111. Search: View as Tree / View as List toggle (search.defaultViewMode)
- [ ] W112. Search: result message "n results in m files – Open in editor"
- [ ] W113. Search: Dismiss a result (×) and Replace one match / one file
- [ ] W114. Search: replace preview (a diff of the file with the replacement)
- [ ] W115. search.smartCase
- [ ] W116. search.showLineNumbers
- [ ] W117. search.searchOnType and search.searchOnTypeDebouncePeriod
- [ ] W118. search.collapseResults (auto / alwaysCollapse / alwaysExpand)
- [ ] W119. search.sortOrder (default / fileNames / type / modified / countDescending / countAscending)
- [ ] W120. search.seedOnFocus and search.seedWithNearestWord
- [ ] W121. search.exclude (patterns, besides files.exclude)
- [ ] W122. Search: Toggle Search Details (files to include / exclude) and Only Search Open Editors button

## Source Control
- [ ] W123. Source Control view in VS Code style: message box, Commit button with dropdown, Changes / Staged Changes with status letters
- [ ] W124. Inline actions on changes: Open File, Discard Changes, Stage / Unstage, and on groups: Stage All / Discard All
- [ ] W125. SCM: View as Tree / List (scm.defaultViewMode)
- [ ] W126. git.enableSmartCommit (commit all changes when nothing is staged) and git.suggestSmartCommit
- [ ] W127. Commit message validation (git.inputValidation, subject length warning)
- [ ] W128. Commit dropdown: Commit (Amend), Commit & Push, Commit & Sync
- [ ] W129. git.countBadge (all / tracked / off)
- [ ] W130. Quick diff peek: click a gutter change to see the diff inline with Stage, Revert, next / previous change
- [ ] W131. scm.diffDecorations (all / gutter / overview / minimap / none) and scm.diffDecorationsGutterWidth
- [ ] W132. Git: Create Branch… / Create Branch From… / Rename Branch… / Delete Branch… quick picks
- [ ] W133. Git: Stash, Stash (Include Untracked), Apply Latest Stash, Pop Stash…, Drop Stash… quick picks
- [ ] W134. Git: Fetch, Pull, Push, Sync commands with git.confirmSync
- [ ] W135. Git: Open Changes (Ctrl+K Ctrl+Alt?) from the editor; Open File from a diff
- [ ] W136. Git: View incoming / outgoing commits (Source Control Graph section)
- [ ] W137. git.autofetch with git.autofetchPeriod
- [ ] W138. Git: Add to .gitignore
- [ ] W139. git.decorations.enabled (Explorer and tab colours)
- [ ] W140. git.branchPrefix and git.branchValidationRegex for new branches

## Diff editor
- [ ] W141. diffEditor.ignoreTrimWhitespace toggle in the diff toolbar
- [ ] W142. diffEditor.hideUnchangedRegions (collapsed with "n hidden lines", click to expand)
- [ ] W143. Diff: Go to Next / Previous Difference (Alt+F5 / Shift+Alt+F5) inside a diff
- [ ] W144. Accessible Diff Viewer (F7): changes one by one as text
- [ ] W145. diffEditor.renderIndicators (+ / −) and diffEditor.wordWrap
- [ ] W146. Diff: Swap Left and Right Editor Side; Toggle Inline View

## Terminal
- [ ] W147. Terminal tabs list on the right (icons, names, kill on hover) with several terminals
- [ ] W148. Split Terminal (Ctrl+Shift+5) side by side
- [ ] W149. Terminal: Change Color and Change Icon
- [ ] W150. Terminal Find (Ctrl+F in the terminal)
- [ ] W151. Terminal: Kill the Active Terminal Instance, New Terminal (Ctrl+Shift+`), Focus Next / Previous Terminal
- [ ] W152. Terminal profiles dropdown (PowerShell, Command Prompt, Git Bash) and terminal.integrated.defaultProfile
- [ ] W153. terminal.integrated.fontSize / fontFamily / lineHeight
- [ ] W154. terminal.integrated.cursorStyle / cursorBlinking
- [ ] W155. terminal.integrated.scrollback
- [ ] W156. terminal.integrated.copyOnSelection
- [ ] W157. terminal.integrated.cwd and terminal.integrated.env.windows
- [ ] W158. Shell integration: command decorations (✓ / ✗ circles) and Go to Previous / Next Command (Ctrl+↑ / ↓)
- [ ] W159. Run Recent Command (Ctrl+Alt+R) from the terminal's history
- [ ] W160. terminal.integrated.confirmOnKill / confirmOnExit
- [ ] W161. Terminal links: file:line in output opens the editor at the line
- [ ] W162. Terminal: Run Active File

## Run and Debug
- [ ] W163. Run and Debug view: configuration dropdown, ▶ start, gear opens launch.json
- [ ] W164. .vscode/launch.json configurations (name, test filter, env) used by F5
- [ ] W165. Floating debug toolbar, draggable (debug.toolBarLocation: floating / docked / hidden)
- [ ] W166. Debug Console REPL: history (↑ / ↓), completion of variables
- [ ] W167. debug.inlineValues (on / off / auto)
- [ ] W168. debug.showInStatusBar: the selected launch configuration in the status bar
- [ ] W169. debug.openDebug (openOnSessionStart / openOnDebugBreak / neverOpen)
- [ ] W170. debug.saveBeforeStart
- [ ] W171. Breakpoints view inline actions: Edit Condition (pencil), Remove (×); Toggle Activate Breakpoints
- [ ] W172. debug.showBreakpointsInOverviewRuler
- [ ] W173. debug.console.fontSize / wordWrap
- [ ] W174. debug.confirmOnExit and debug.focusWindowOnBreak

## Tasks
- [ ] W175. .vscode/tasks.json: Tasks: Run Task quick pick (detected dotnet build / test and npm scripts too)
- [ ] W176. Run Build Task (Ctrl+Shift+B) with the default build task, Configure Default Build Task
- [ ] W177. Run Test Task and Configure Default Test Task
- [ ] W178. Task output in its own terminal tab; Terminate Task, Restart Running Task, Show Running Tasks
- [ ] W179. Problem matcher $msCompile / $tsc: task errors go to Problems
- [ ] W180. Configure Task: creates tasks.json from a template

## Settings, keybindings, profiles, themes
- [ ] W181. Settings: User / Workspace tabs (workspace values in .vscode/settings.json)
- [ ] W182. Settings search filters: @id:, @tag:, @lang:, @feature: with the filter menu
- [ ] W183. Setting gear menu: Reset Setting, Copy Setting ID, Copy Setting as JSON
- [ ] W184. Open User Settings (JSON) in an editor tab: completion and validation of ids
- [ ] W185. Language-specific settings ("[csharp]": { … })
- [ ] W186. Keyboard Shortcuts: Record Keys search, "When" and "Source" columns, Show Same Keybindings
- [ ] W187. Open Keyboard Shortcuts (JSON) (keybindings.json)
- [ ] W188. Keyboard Shortcuts Reference (Ctrl+K Ctrl+R): a printable page
- [ ] W189. Profiles: New Profile, switch, delete (settings, keybindings, layout per profile)
- [ ] W190. Profiles: Export / Import (a .code-profile file)
- [ ] W191. Color Theme picker (Ctrl+K Ctrl+T) as a quick pick with live preview while moving
- [ ] W192. VS Code themes: Dark Modern and Light Modern (colours from VS Code's theme-defaults)
- [ ] W193. VS Code themes: Dark+ and Light+
- [ ] W194. VS Code themes: Dark High Contrast and Light High Contrast
- [ ] W195. VS Code themes: Monokai, Solarized Dark, Solarized Light
- [ ] W196. VS Code themes: Abyss, Kimbie Dark, Quiet Light, Red, Tomorrow Night Blue
- [ ] W197. File Icon Theme picker: Seti, Minimal, None
- [ ] W198. workbench.colorCustomizations
- [ ] W199. editor.tokenColorCustomizations
- [ ] W200. window.autoDetectColorScheme with preferred dark / light themes

## Help, developer, accessibility
- [ ] W201. Welcome page in VS Code style (Start, Recent, Walkthroughs) and workbench.startupEditor
- [ ] W202. Walkthroughs with steps that tick themselves
- [ ] W203. Editor Playground (Help ▸ Editor Playground): an interactive tour of editing features
- [ ] W204. Help: About dialog (version, Electron, Chromium, Node, OS, Copy)
- [ ] W205. Developer: Reload Window
- [ ] W206. Developer: Toggle Developer Tools (desktop)
- [ ] W207. Developer: Show Logs / Set Log Level
- [ ] W208. Process Explorer (API server, language server, terminals: memory, kill)
- [ ] W209. Developer: Startup Performance
- [ ] W210. Developer: Inspect Editor Tokens and Scopes
- [ ] W211. Accessibility Help (Alt+F1) in the editor
- [ ] W212. Accessible View (Alt+F2) for hovers, notifications and terminal output
- [ ] W213. Accessibility signals: sounds for error / warning / breakpoint / folded line, task completed (accessibility.signals.*)
- [ ] W214. Toggle Tab Key Moves Focus (Ctrl+M)
- [ ] W215. workbench.reduceMotion

## Editor commands
- [ ] W216. Fold Level 1–7 (Ctrl+K Ctrl+1…7)
- [ ] W217. Fold All Block Comments (Ctrl+K Ctrl+/)
- [ ] W218. Fold All Regions / Unfold All Regions (Ctrl+K Ctrl+8 / 9)
- [ ] W219. Fold All Except Selected / Unfold All Except Selected (Ctrl+K Ctrl+- / =)
- [ ] W220. Fold Recursively / Unfold Recursively (Ctrl+K Ctrl+[ / ])
- [ ] W221. Toggle Fold (Ctrl+K Ctrl+L)
- [ ] W222. Create Manual Folding Range from Selection (Ctrl+K Ctrl+,) / Remove Manual Folding Ranges (Ctrl+K Ctrl+.)
- [ ] W223. Go to Parent Fold / Next Folding Range / Previous Folding Range
- [ ] W224. Cursor Undo / Cursor Redo (Ctrl+U)
- [ ] W225. Move Last Selection to Next Find Match (Ctrl+K Ctrl+D) and Add Selection to Previous Find Match
- [ ] W226. Change All Occurrences (Ctrl+F2)
- [ ] W227. Add Cursors to Top / Bottom
- [ ] W228. Expand Line Selection (Ctrl+L)
- [ ] W229. Scroll Line Up / Down (Ctrl+↑ / ↓) and Scroll Page Up / Down (Alt+PgUp / PgDn)
- [ ] W230. Transform to Title Case / Snake Case / Kebab Case / Camel Case / Pascal Case
- [ ] W231. Reindent Lines / Reindent Selected Lines
- [ ] W232. Add Line Comment (Ctrl+K Ctrl+C) / Remove Line Comment (Ctrl+K Ctrl+U)
- [ ] W233. Remove Brackets (Ctrl+Alt+Backspace)
- [ ] W234. Copy With Syntax Highlighting
- [ ] W235. Trigger Parameter Hints (Ctrl+Shift+Space) and editor.parameterHints.enabled

## Editor settings
- [ ] W236. editor.tabSize / editor.insertSpaces / editor.detectIndentation
- [ ] W237. editor.emptySelectionClipboard (copy / cut the line without a selection)
- [ ] W238. editor.multiCursorModifier (alt / ctrlCmd) and editor.multiCursorPaste (spread / full)
- [ ] W239. editor.occurrencesHighlight and editor.selectionHighlight
- [ ] W240. editor.hover.enabled / delay / sticky
- [ ] W241. editor.lightbulb.enabled: a lightbulb in the gutter when Quick Actions exist
- [ ] W242. editor.inlayHints.enabled (on / off / onUnlessPressed / offUnlessPressed with Ctrl+Alt)
- [ ] W243. editor.formatOnPaste and editor.formatOnType
- [ ] W244. editor.wordBasedSuggestions (words of the document in completion)
- [ ] W245. editor.wordSeparators (word moves and double-click)
- [ ] W246. editor.renderControlCharacters and editor.renderFinalNewline
- [ ] W247. editor.mouseWheelZoom (Ctrl+wheel changes the editor font size)
- [ ] W248. editor.find.seedSearchStringFromSelection / autoFindInSelection / loop
- [ ] W249. editor.dragAndDrop (move a selection by dragging it)
- [ ] W250. User snippets (.vscode/*.code-snippets, VS Code snippet syntax and variables), Snippets: Configure / Insert Snippet

## Progress log
- 2026-10-21: W1, W2. VS Code's Quick Input at the top centre (fuzzyScore ported from VS Code's filters.ts): files with recently opened first and highlights; > commands with keybinding chips, recently used / other commands. Ctrl+T keeps Go to All; Ctrl+K keeps the step palette.
- 2026-10-21: W3, W4. Symbols of C#, Gherkin, Markdown and (new /api/web/outline) TypeScript / JavaScript, HTML, CSS; codicon symbol icons in VS Code's colours; the highlighted symbol is previewed, Escape restores the caret. Ctrl+Shift+O in an editor; elsewhere it still opens a solution.
- 2026-10-21: W5. VS Code's Go to Line: 'Current Line: x, Character: y…', line:column, negative lines from the end, the line previewed while typing, Escape restores; Ctrl+G and the status bar's Ln/Col open it (floating editors too).
- 2026-10-21: W6. C# symbols from Roslyn and TypeScript / JavaScript symbols (new /api/web/symbols, TypeScript's navigateTo) with container and file, fuzzy highlighted; Enter opens at the symbol.
- 2026-10-21: W7. ? lists every Quick Input prefix (…, >, @, :, #, view) with what it does; picking one switches to it.
- 2026-10-21: W8. Side bar views, panel views (Build, Debug, Output, TODO, Structure, Problems, Terminal…) and pages, grouped as in VS Code; Ctrl+Q opens it.
