import { useSyncExternalStore } from 'react';
import { isDesktop } from './desktop';

/**
 * Feature switches (Settings ▸ Features, like VS Code's extension / feature settings): every optional IDE feature can
 * be turned on or off. "Essential" features are the ones Visual Studio 2026 has on out of the box; the desktop app
 * starts with only those, the web app with everything. Turning a feature off hides its commands (menus, palette,
 * native desktop menus), its keys and anything it draws.
 */
export type FeatureGroup = 'Editing' | 'Navigation' | 'Code intelligence' | 'Tool windows' | 'Files' | 'Git' | 'Gherkin' | 'View' | 'Debugging' | 'Help and productivity';
export type Feature = {
  id: string;
  label: string;
  group: FeatureGroup;
  description: string;
  /** On by default in Visual Studio 2026 (the desktop app's default). */
  essential: boolean;
  /** Rider commands that belong to the feature (their ids in src/rider/commands). */
  commands?: string[];
  /** The Visual Studio equivalent, shown with essential features. */
  vs?: string;
};

export const FEATURES: Feature[] = [
  // Editing
  { id: 'extend-selection', label: 'Extend / Shrink Selection', group: 'Editing', essential: true, vs: 'Edit ▸ Advanced ▸ Expand Selection', description: 'Shift+Alt+→ / ← grows the selection by syntax: word, string, brackets, line, block.', commands: ['extend-selection', 'shrink-selection'] },
  { id: 'toggle-case', label: 'Toggle Case', group: 'Editing', essential: true, vs: 'Make Uppercase / Lowercase', description: 'Ctrl+Shift+U switches the selection between upper and lower case.', commands: ['toggle-case'] },
  { id: 'join-lines', label: 'Join Lines', group: 'Editing', essential: true, vs: 'Edit ▸ Advanced ▸ Join Lines', description: 'Ctrl+Shift+J joins the selected lines.', commands: ['join-lines'] },
  { id: 'multi-caret', label: 'Carets at occurrences', group: 'Editing', essential: true, vs: 'Insert Next Matching Caret (Shift+Alt+.)', description: 'Alt+J adds the next occurrence, Alt+Shift+J removes it, Ctrl+Alt+Shift+J selects all.', commands: ['next-occurrence', 'unselect-occurrence', 'all-occurrences'] },
  { id: 'new-line', label: 'Start New Line', group: 'Editing', essential: true, vs: 'Line Open Above / Below', description: 'Shift+Enter starts a new line below, Ctrl+Alt+Enter above.', commands: ['new-line', 'new-line-before'] },
  { id: 'carets-line-ends', label: 'Carets at Ends of Selected Lines', group: 'Editing', essential: false, description: 'Alt+Shift+G puts a caret at the end of each selected line.', commands: ['carets-line-ends'] },
  { id: 'column-mode', label: 'Column Selection Mode', group: 'Editing', essential: false, description: 'Alt+Shift+Insert: plain drag selects a rectangle, Shift+↑/↓ grows a column of carets.', commands: ['column-mode'] },
  { id: 'paste-history', label: 'Paste from History', group: 'Editing', essential: true, vs: 'Clipboard History (Ctrl+Shift+V)', description: 'Ctrl+Shift+V picks an earlier copied text.', commands: ['paste-history'] },
  { id: 'live-templates', label: 'Live Templates', group: 'Editing', essential: true, vs: 'Insert Snippet (Ctrl+K, Ctrl+X)', description: 'Ctrl+J inserts a code or Gherkin template.', commands: ['live-template'] },
  { id: 'surround-with', label: 'Surround With', group: 'Editing', essential: true, vs: 'Surround With (Ctrl+K, Ctrl+S)', description: 'Ctrl+Alt+J wraps the selection in if / try / using / a scenario…', commands: ['surround-with'] },
  { id: 'block-comment', label: 'Block comments', group: 'Editing', essential: true, vs: 'Toggle Block Comment (Ctrl+Shift+/)', description: 'Ctrl+Shift+/ comments the selection with /* */ or <!-- -->.', commands: ['block-comment'] },
  { id: 'code-cleanup', label: 'Code Cleanup', group: 'Editing', essential: true, vs: 'Code Cleanup (Ctrl+K, Ctrl+E)', description: 'Ctrl+K, Ctrl+E organizes usings, formats and trims trailing whitespace.', commands: ['code-cleanup'] },
  { id: 'move-statement', label: 'Move Statement', group: 'Editing', essential: false, description: 'Ctrl+Shift+Alt+↑/↓ moves a whole statement, block or scenario.', commands: ['statement-up', 'statement-down'] },
  { id: 'complete-statement', label: 'Complete Current Statement', group: 'Editing', essential: false, description: 'Ctrl+Shift+Enter closes parentheses and adds the ";" or the { } block.', commands: ['complete-statement'] },
  { id: 'unwrap', label: 'Unwrap / Remove', group: 'Editing', essential: false, description: 'Ctrl+Shift+Delete removes an if / loop / using around the caret, keeping its body.', commands: ['unwrap'] },
  { id: 'rollback-lines', label: 'Rollback Lines', group: 'Editing', essential: false, description: 'Ctrl+Alt+Z undoes the uncommitted change at the caret.', commands: ['rollback-lines'] },
  { id: 'line-separators', label: 'Line separators (CRLF / LF)', group: 'Editing', essential: true, vs: 'File ▸ Advanced Save Options', description: 'Change a file between CRLF and LF from the status bar or the Edit menu.', commands: ['eol-crlf', 'eol-lf'] },
  // Navigation
  { id: 'highlight-usages', label: 'Highlight usages', group: 'Navigation', essential: true, vs: 'Highlight references to the symbol under the cursor', description: 'Usages of the identifier at the caret are tinted; Ctrl+Shift+F7 marks them with Roslyn.', commands: ['highlight-usages', 'caret-usages'] },
  { id: 'structure', label: 'Structure window', group: 'Navigation', essential: true, vs: 'Document Outline', description: 'Alt+7: the outline of the file being edited.', commands: ['tool-structure'] },
  { id: 'file-structure', label: 'File Structure popup', group: 'Navigation', essential: false, description: 'Ctrl+Alt+F12: filter the file\'s members and jump.', commands: ['file-structure'] },
  { id: 'breadcrumbs', label: 'Feature breadcrumbs', group: 'Navigation', essential: true, vs: 'Navigation bar', description: 'Feature › Rule › Scenario above feature files.' },
  { id: 'call-hierarchy', label: 'Call Hierarchy', group: 'Navigation', essential: true, vs: 'View Call Hierarchy (Ctrl+K, Ctrl+T)', description: 'Ctrl+Alt+H: who calls the member at the caret.', commands: ['call-hierarchy'] },
  { id: 'type-hierarchy', label: 'Type Hierarchy', group: 'Navigation', essential: false, description: 'Ctrl+H: base types, interfaces and derived types.', commands: ['type-hierarchy'] },
  { id: 'related-files', label: 'Go to Related Files', group: 'Navigation', essential: false, description: 'Ctrl+Alt+Home: a feature ⇄ its step definition files.', commands: ['related-files'] },
  { id: 'recent-changes', label: 'Recent Changes', group: 'Navigation', essential: false, description: 'Alt+Shift+C: the latest Local History versions.', commands: ['recent-changes'] },
  { id: 'select-in', label: 'Select In…', group: 'Navigation', essential: false, description: 'Alt+F1: reveal the file in the Explorer, Structure, Terminal or Windows Explorer.', commands: ['select-in'] },
  { id: 'change-navigation', label: 'Next / Previous Change', group: 'Navigation', essential: false, description: 'Alt+F5 / Shift+Alt+F5 jump between uncommitted changes.', commands: ['next-change', 'previous-change'] },
  { id: 'numbered-bookmarks', label: 'Numbered bookmarks', group: 'Navigation', essential: false, description: 'Ctrl+Shift+digit sets, Ctrl+digit jumps.', commands: ['numbered-bookmarks'] },
  { id: 'copy-reference', label: 'Copy Reference / Copy Path', group: 'Navigation', essential: false, description: 'Ctrl+Alt+Shift+C copies the symbol, Ctrl+Shift+C offers paths.', commands: ['copy-reference', 'copy-path'] },
  // Code intelligence (features that existed before the Rider work)
  { id: 'codelens', label: 'CodeLens', group: 'Code intelligence', essential: true, vs: 'CodeLens', description: 'Reference counts, step usages and test results above members.' },
  { id: 'inlay-hints', label: 'Inlay hints', group: 'Code intelligence', essential: false, vs: 'Inline hints (off by default)', description: 'Parameter names and inferred types shown inline.' },
  { id: 'sticky-scroll', label: 'Sticky scroll', group: 'Code intelligence', essential: true, vs: 'Sticky Scroll', description: 'The enclosing type and member stay at the top while scrolling.' },
  { id: 'change-bars', label: 'Change bars', group: 'Code intelligence', essential: true, vs: 'Git change margin', description: 'Added / modified / deleted lines marked in the margin.' },
  { id: 'todo-highlighting', label: 'TODO highlighting', group: 'Code intelligence', essential: false, description: 'TODO / FIXME / HACK comments coloured in the editors.' },
  { id: 'indent-guides', label: 'Indent guides', group: 'Code intelligence', essential: true, vs: 'Structure guide lines', description: 'A line per indentation level.', commands: ['indent-guides'] },
  { id: 'folding-commands', label: 'Collapse to Definitions / Expand / Collapse All', group: 'Code intelligence', essential: true, vs: 'Outlining (Ctrl+M, Ctrl+O)', description: 'Fold every member body, or everything.', commands: ['expand-all', 'collapse-all', 'collapse-definitions'] },
  { id: 'check-regexp', label: 'Check RegExp', group: 'Code intelligence', essential: false, description: 'Test a step definition pattern against sample text and the feature steps.', commands: ['check-regexp'] },
  // Tool windows
  { id: 'terminal', label: 'Terminal', group: 'Tool windows', essential: true, vs: 'Terminal (Ctrl+`)', description: 'PowerShell in the repository folder (Alt+F12 / Ctrl+`).', commands: ['tool-terminal'] },
  { id: 'problems', label: 'Problems (solution-wide analysis)', group: 'Tool windows', essential: false, vs: 'Full solution analysis (off by default)', description: 'Alt+Shift+6: compiler errors of every project and unbound steps.', commands: ['tool-problems'] },
  { id: 'run-anything', label: 'Run Anything', group: 'Tool windows', essential: false, description: 'Press Ctrl twice to run a command in the Terminal.', commands: ['run-anything'] },
  { id: 'external-tools', label: 'External Tools', group: 'Tool windows', essential: true, vs: 'Tools ▸ External Tools', description: 'Your own commands with $FilePath$ macros.', commands: ['external-tools'] },
  { id: 'todo-window', label: 'TODO window', group: 'Tool windows', essential: true, vs: 'Task List', description: 'Alt+6: TODO / FIXME comments across the solution.' },
  // Files
  { id: 'http-client', label: 'HTTP Client', group: 'Files', essential: true, vs: '.http file support', description: 'Send requests from .http / .rest files.' },
  { id: 'markdown-preview', label: 'Markdown preview', group: 'Files', essential: true, vs: 'Markdown editor preview', description: 'Editor and preview side by side for .md files.' },
  { id: 'new-from-template', label: 'New File from Template', group: 'Files', essential: true, vs: 'Add New Item (Ctrl+Shift+A)', description: 'Alt+Insert: classes, tests, step definitions, features…', commands: ['new-from-template'] },
  { id: 'scratch-files', label: 'Scratch files', group: 'Files', essential: false, description: 'Throwaway files outside the solution.', commands: ['new-scratch', 'scratches'] },
  { id: 'compare-files', label: 'Compare With…', group: 'Files', essential: true, vs: 'Compare Files', description: 'Diff the editor against another file.', commands: ['compare-with'] },
  { id: 'compare-clipboard', label: 'Compare with Clipboard', group: 'Files', essential: false, description: 'Diff the selection against the clipboard.', commands: ['compare-clipboard'] },
  { id: 'local-history', label: 'Local History', group: 'Files', essential: false, description: 'Versions kept before every save, independent of Git.' },
  // Git
  { id: 'git-log', label: 'Git Log', group: 'Git', essential: true, vs: 'Git Repository window', description: 'Alt+9: every branch\'s commits with the graph.', commands: ['tool-gitlog'] },
  { id: 'shelf', label: 'Shelf (stash)', group: 'Git', essential: true, vs: 'Git stashes', description: 'Put uncommitted changes aside and bring them back.', commands: ['tool-shelf'] },
  { id: 'line-history', label: 'Show History for Selection', group: 'Git', essential: false, description: 'The commits that changed the selected lines.', commands: ['line-history'] },
  { id: 'compare-branch', label: 'Compare with Branch', group: 'Git', essential: false, description: 'Diff the editor against the file on another branch.', commands: ['compare-branch'] },
  // View
  { id: 'soft-wrap', label: 'Soft-wrap toggle', group: 'View', essential: true, vs: 'Word Wrap (Alt+Z)', description: 'View ▸ Soft-Wrap.', commands: ['soft-wrap'] },
  { id: 'show-whitespace', label: 'Show whitespace toggle', group: 'View', essential: true, vs: 'View White Space', description: 'View ▸ Show Whitespaces.', commands: ['whitespace'] },
  { id: 'line-numbers', label: 'Line numbers toggle', group: 'View', essential: true, vs: 'Line numbers', description: 'View ▸ Show Line Numbers.', commands: ['line-numbers'] },
  { id: 'font-zoom', label: 'Ctrl+Mouse Wheel font size', group: 'View', essential: true, vs: 'Editor zoom (Ctrl+wheel)', description: 'Change the editor font size with Ctrl+wheel.', commands: ['font-bigger', 'font-smaller', 'font-reset'] },
  { id: 'distraction-free', label: 'Distraction-Free and Presentation modes', group: 'View', essential: false, description: 'Only the editor (Alt+Shift+Z), or that with a large font.', commands: ['zen-mode', 'presentation-mode'] },
  { id: 'hide-tools', label: 'Hide All Tool Windows', group: 'View', essential: false, description: 'Ctrl+Shift+F12 hides the explorer and panels.', commands: ['hide-tools'] },
  // Debugging
  { id: 'evaluate-expression', label: 'Evaluate Expression', group: 'Debugging', essential: true, vs: 'QuickWatch (Shift+F9)', description: 'Alt+F8 while paused.', commands: ['evaluate-expression'] },
  { id: 'mute-breakpoints', label: 'Mute Breakpoints', group: 'Debugging', essential: true, vs: 'Disable All Breakpoints', description: 'Keep breakpoints but let the debugger run past them.', commands: ['mute-breakpoints'] },
  // Help and productivity
  { id: 'key-promoter', label: 'Key Promoter', group: 'Help and productivity', essential: false, description: 'Shows a command\'s shortcut when you use it from a menu.', commands: ['key-promoter'] },
  { id: 'productivity-guide', label: 'Productivity Guide', group: 'Help and productivity', essential: false, description: 'Which features you use, and how often with the keyboard.', commands: ['productivity-guide'] },
  { id: 'tip-of-the-day', label: 'Tip of the Day', group: 'Help and productivity', essential: false, description: 'A tip at a time, optionally at startup.', commands: ['tip-of-the-day'] },
  { id: 'power-save', label: 'Power Save Mode', group: 'Help and productivity', essential: false, description: 'Pause background analysis.', commands: ['power-save'] },
  { id: 'search-everywhere', label: 'Search Everywhere (Shift twice)', group: 'Help and productivity', essential: false, description: 'Double Shift opens Go to All (Ctrl+T always works).' },
  // ── Third batch (IDE-FEATURES.md) ──
  { id: 'sort-lines', label: 'Sort Lines', group: 'Editing', essential: false, description: 'Sort the selected lines (or the file): natural order, case-insensitive.', commands: ['sort-lines'] },
  { id: 'reverse-lines', label: 'Reverse Lines', group: 'Editing', essential: false, description: 'The selected lines (or the file) in reverse order.', commands: ['reverse-lines'] },
  { id: 'delete-whitespace', label: 'Delete Horizontal White Space', group: 'Editing', essential: true, vs: 'Edit ▸ Advanced ▸ Delete Horizontal White Space', description: 'Ctrl+K, Ctrl+\\: collapse spaces in the selection, or delete those around the caret.', commands: ['delete-whitespace'] },
  { id: 'make-uppercase', label: 'Make Uppercase', group: 'Editing', essential: true, vs: 'Edit ▸ Advanced ▸ Make Uppercase', description: 'The selection or the word at the caret in upper case.', commands: ['make-uppercase'] },
  { id: 'make-lowercase', label: 'Make Lowercase', group: 'Editing', essential: true, vs: 'Edit ▸ Advanced ▸ Make Lowercase', description: 'The selection or the word at the caret in lower case.', commands: ['make-lowercase'] },
  { id: 'transpose-line', label: 'Transpose Line', group: 'Editing', essential: true, vs: 'Edit.LineTranspose (Shift+Alt+T)', description: 'Shift+Alt+T swaps the caret\'s line with the next one.', commands: ['transpose-line'] },
  { id: 'transpose-chars', label: 'Transpose Characters', group: 'Editing', essential: true, vs: 'Edit.CharTranspose', description: 'Swap the two characters around the caret (a typo fixer).', commands: ['transpose-chars'] },
  { id: 'transpose-words', label: 'Transpose Words', group: 'Editing', essential: true, vs: 'Edit.WordTranspose', description: 'Swap the word at the caret with the next word.', commands: ['transpose-words'] },
  { id: 'goto-brace', label: 'Go to Matching Brace', group: 'Navigation', essential: true, vs: 'Edit.GotoBrace (Ctrl+])', description: 'Ctrl+] moves the caret to the bracket that matches the one next to it.', commands: ['goto-brace'] },
  { id: 'select-brace', label: 'Select to Matching Brace', group: 'Navigation', essential: true, vs: 'Edit.GotoBraceExtend (Ctrl+Shift+])', description: 'Ctrl+Shift+] selects up to the matching bracket.', commands: ['select-brace'] },
  { id: 'find-next-selected', label: 'Find Next Selected', group: 'Navigation', essential: true, vs: 'Edit.FindNextSelected (Ctrl+F3)', description: 'Ctrl+F3 selects the next match of the selection or word.', commands: ['find-next-selected'] },
  { id: 'find-previous-selected', label: 'Find Previous Selected', group: 'Navigation', essential: true, vs: 'Edit.FindPreviousSelected (Ctrl+Shift+F3)', description: 'Ctrl+Shift+F3 selects the previous match.', commands: ['find-previous-selected'] },
  { id: 'last-edit', label: 'Go to Last Edit Location', group: 'Navigation', essential: true, vs: 'Edit.GoToLastEditLocation (Ctrl+Shift+Backspace)', description: 'Ctrl+Shift+Backspace returns to where you last typed, in any file.', commands: ['last-edit'] },
  { id: 'insert-guid', label: 'Insert GUID', group: 'Editing', essential: true, vs: 'Tools ▸ Create GUID', description: 'A new GUID at the caret (or every caret).', commands: ['insert-guid'] },
  { id: 'expand-word', label: 'Cyclic Expand Word', group: 'Editing', essential: false, description: 'Alt+/ completes the word from other words of the file; again for the next one.', commands: ['expand-word'] },
  { id: 'overtype', label: 'Overtype mode', group: 'Editing', essential: true, vs: 'Insert key (overtype)', description: 'Insert switches between inserting and overwriting characters; the status bar shows OVR.', commands: ['overtype'] },
  { id: 'current-line', label: 'Highlight current line toggle', group: 'View', essential: true, vs: 'Highlight current line', description: 'View ▸ Highlight Current Line turns the caret line\'s background on or off.', commands: ['current-line'] },
  { id: 'member-navigation', label: 'Next / Previous Member', group: 'Navigation', essential: false, description: 'Alt+PageDown / PageUp jump between methods and properties (scenarios in features).', commands: ['next-member', 'previous-member'] },
  { id: 'toggle-verbatim', label: 'To Verbatim / Regular String', group: 'Editing', essential: false, description: 'Switch the C# string at the caret between "..." and @"..." (handy for step patterns).', commands: ['toggle-verbatim'] },
  { id: 'convert-case', label: 'Convert Case', group: 'Editing', essential: false, description: 'camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title or Sentence case for the selection.', commands: ['convert-case'] },
  { id: 'xml-doc', label: 'XML documentation comments (///)', group: 'Code intelligence', essential: true, vs: 'Generate XML documentation comments for ///', description: 'Typing /// above a member writes the summary, param and returns tags.' },
  { id: 'generate-ctor', label: 'Generate Constructor', group: 'Editing', essential: true, vs: 'Quick Actions ▸ Generate constructor', description: 'A constructor for the class at the caret, initializing its readonly fields and get-only properties.', commands: ['generate-ctor'] },
  { id: 'paste-json-classes', label: 'Paste JSON as Classes', group: 'Editing', essential: true, vs: 'Edit ▸ Paste Special ▸ Paste JSON as Classes', description: 'Edit ▸ Paste JSON as Classes: C# classes for the JSON on the clipboard.', commands: ['paste-json-classes'] },
  { id: 'reformat-json', label: 'Reformat / Minify JSON', group: 'Editing', essential: true, vs: 'Format Document (JSON)', description: 'Indent JSON with 2 spaces, or put it on one line.', commands: ['reformat-json', 'minify-json'] },
  { id: 'run-context', label: 'Run Tests in Context', group: 'Code intelligence', essential: true, vs: 'Test ▸ Run Tests in Context (Ctrl+R, T)', description: 'Ctrl+R, T runs the test or scenario at the caret.', commands: ['run-context'] },
  { id: 'debug-context', label: 'Debug Tests in Context', group: 'Debugging', essential: true, vs: 'Test ▸ Debug Tests in Context (Ctrl+R, Ctrl+T)', description: 'Ctrl+R, Ctrl+T debugs the test or scenario at the caret.', commands: ['debug-context'] },
  { id: 'repeat-run', label: 'Repeat Last Test Run', group: 'Code intelligence', essential: true, vs: 'Test ▸ Repeat Last Run (Ctrl+R, L)', description: 'Ctrl+R, L runs the same tests as last time.', commands: ['repeat-run'] },
  { id: 'toggle-bp-enabled', label: 'Enable / Disable Breakpoint (Ctrl+F9)', group: 'Debugging', essential: true, vs: 'Debug ▸ Enable / Disable Breakpoint (Ctrl+F9)', description: 'Ctrl+F9 turns the breakpoint on the caret line off or on, keeping its settings.', commands: ['toggle-bp-enabled'] },
  { id: 'show-next-statement', label: 'Show Next Statement', group: 'Debugging', essential: true, vs: 'Debug ▸ Show Next Statement (Alt+Num *)', description: 'Alt+Num * goes back to where the debugger is paused.', commands: ['show-next-statement'] },
  { id: 'copy-call-stack', label: 'Copy Call Stack', group: 'Debugging', essential: true, vs: 'Call Stack ▸ Copy All', description: 'The paused call stack as text, one frame per line.', commands: ['copy-call-stack'] },
  { id: 'export-breakpoints', label: 'Export / Import Breakpoints', group: 'Debugging', essential: true, vs: 'Breakpoints ▸ Export / Import', description: 'Save every breakpoint (with conditions and hit counts) to a file, and load them again.', commands: ['export-breakpoints', 'import-breakpoints'] },
  { id: 'window-layouts', label: 'Save / Apply Window Layout', group: 'View', essential: true, vs: 'Window ▸ Save / Apply Window Layout', description: 'Name the current arrangement of panels and tool windows, and switch back to it.', commands: ['window-layouts'] },
  { id: 'reset-layout', label: 'Reset Window Layout', group: 'View', essential: true, vs: 'Window ▸ Reset Window Layout', description: 'The default panel, side bar and tool windows.', commands: ['reset-layout'] },
  { id: 'reopen-tab', label: 'Reopen Closed Tab', group: 'View', essential: false, description: 'Ctrl+Shift+T (desktop) brings back the tabs you closed, newest first.', commands: ['reopen-tab'] },
  { id: 'close-unmodified', label: 'Close Unmodified Tabs', group: 'View', essential: false, description: 'Closes every tab without unsaved changes (pinned and active tabs stay).', commands: ['close-unmodified'] },
  { id: 'switcher', label: 'Switcher (Ctrl+Tab)', group: 'Navigation', essential: true, vs: 'IDE Navigator (Ctrl+Tab)', description: 'Ctrl+Tab lists the open editors (most recent first) and tool windows; Enter switches.', commands: ['switcher'] },
  { id: 'multi-row-tabs', label: 'Tabs in multiple rows', group: 'View', essential: false, description: 'The editor tabs wrap onto more rows instead of scrolling.', commands: ['multi-row-tabs'] },
  { id: 'notifications', label: 'Notifications window', group: 'Tool windows', essential: true, vs: 'Notifications (bell)', description: 'Every message of the session, newest first (View ▸ Notifications).', commands: ['tool-notifications'] },
  { id: 'file-props', label: 'File Properties (Alt+Enter)', group: 'Files', essential: true, vs: 'Properties window (Alt+Enter)', description: 'Size, dates, encoding, line endings and line count of the active file.', commands: ['file-props'] },
  { id: 'analyze-stack', label: 'Analyze Stack Trace', group: 'Tool windows', essential: false, description: 'Paste a .NET stack trace; frames in the solution become links.', commands: ['analyze-stack'] },
  { id: 'git-copy-revision', label: 'Git Log: Copy Revision Number', group: 'Git', essential: true, vs: 'Git Repository ▸ Copy Commit ID', description: 'Copies the selected commit\'s full hash.' },
  { id: 'git-new-branch', label: 'Git Log: New Branch from Commit', group: 'Git', essential: true, vs: 'Git Repository ▸ New Branch', description: 'Creates a branch at the selected commit.' },
  { id: 'git-new-tag', label: 'Git Log: New Tag', group: 'Git', essential: true, vs: 'Git Repository ▸ New Tag', description: 'Tags the selected commit.' },
  { id: 'git-cherry-pick', label: 'Git Log: Cherry-Pick', group: 'Git', essential: true, vs: 'Git Repository ▸ Cherry-Pick', description: 'Applies the selected commit onto the current branch (undone when it conflicts).' },
  { id: 'git-revert', label: 'Git Log: Revert Commit', group: 'Git', essential: true, vs: 'Git Repository ▸ Revert', description: 'A new commit that undoes the selected one.' },
  { id: 'git-checkout-revision', label: 'Git Log: Checkout Revision', group: 'Git', essential: true, vs: 'Git Repository ▸ Checkout (detached)', description: 'Checks the selected commit out (detached HEAD).' },
  { id: 'git-reset', label: 'Git Log: Reset Current Branch to Here', group: 'Git', essential: true, vs: 'Git Repository ▸ Reset', description: 'Soft, mixed or hard reset to the selected commit (hard asks again).' },
  { id: 'branches', label: 'Branches popup', group: 'Git', essential: true, vs: 'Branch picker in the status bar', description: 'The status bar branch (or Tools ▸ Branches…) switches to or creates a branch.', commands: ['branches'] },
  { id: 'cycle-step-keyword', label: 'Cycle Step Keyword', group: 'Gherkin', essential: true, description: 'Given → When → Then → And → But on the step line(s).', commands: ['cycle-step-keyword'] },
  { id: 'scenario-to-outline', label: 'Convert Scenario to Outline', group: 'Gherkin', essential: true, description: 'Quoted step values become <parameters> with an Examples table.', commands: ['scenario-to-outline'] },
  { id: 'table-insert-row', label: 'Table: Insert Row', group: 'Gherkin', essential: true, description: 'An empty aligned row below the caret\'s table row.', commands: ['table-insert-row'] },
  { id: 'table-add-column', label: 'Table: Add Column', group: 'Gherkin', essential: true, description: 'An empty column after the caret\'s column.', commands: ['table-add-column'] },
  { id: 'table-delete-column', label: 'Table: Delete Column', group: 'Gherkin', essential: true, description: 'Removes the caret\'s column from every row.', commands: ['table-delete-column'] },
  { id: 'table-sort', label: 'Table: Sort by Column', group: 'Gherkin', essential: false, description: 'Sorts the rows under the header by the caret\'s column (again: descending).', commands: ['table-sort'] },
  { id: 'copy-test-filter', label: 'Copy Test Filter', group: 'Gherkin', essential: true, description: 'Copies a dotnet test --filter for the scenario (or feature) at the caret.', commands: ['copy-test-filter'] },
  { id: 'select-scenario', label: 'Select Scenario', group: 'Gherkin', essential: true, description: 'Selects the scenario at the caret with its tags and Examples.', commands: ['select-scenario'] },
  { id: 'bracket-colors', label: 'Bracket pair colorization', group: 'View', essential: true, vs: 'Text Editor ▸ Enable brace pair colorization', description: '(), [] and {} coloured by nesting depth.', commands: ['bracket-colors'] },
  { id: 'zoom-indicator', label: 'Editor zoom in the status bar', group: 'View', essential: true, vs: 'Zoom level control', description: 'Shows the editor zoom; a click resets it.' },
  { id: 'strip-trailing', label: 'Strip Trailing Spaces', group: 'Editing', essential: true, description: 'Removes spaces and tabs at line ends (selection or file).', commands: ['strip-trailing'] },
  { id: 'todo-tokens', label: 'Custom TODO patterns', group: 'Editing', essential: false, vs: 'Task List ▸ Tokens', description: 'Choose which comment keywords (TODO, FIXME, NOTE…) are highlighted.', commands: ['todo-tokens'] },
  { id: 'right-margin', label: 'Right margin guide', group: 'View', essential: false, vs: 'Guidelines', description: 'A thin vertical guide after column 120 (configurable).', commands: ['right-margin'] },
  { id: 'explorer-scope', label: 'Explorer: Scope to This', group: 'Files', essential: true, vs: 'Solution Explorer ▸ Scope to This', description: 'A folder\'s context menu narrows the Explorer to it; Home shows everything again.' },
  { id: 'explorer-new-file', label: 'Explorer: New File…', group: 'Files', essential: true, vs: 'Add ▸ New Item', description: 'A folder\'s context menu creates a file (any type, sub-folders allowed) and opens it.' },
  { id: 'run-until-failure', label: 'Run Until Failure', group: 'Debugging', essential: false, vs: 'Test Explorer ▸ Run Until Failure', description: 'Repeats the last test run until a test fails (or N runs pass).', commands: ['run-until-failure'] },
  { id: 'error-list-scope', label: 'Error List scope', group: 'Tool windows', essential: true, vs: 'Error List ▸ scope filter', description: 'Entire Solution, Open Documents or Current Document.' },
  { id: 'error-list-copy', label: 'Error List: Copy and Error Help', group: 'Tool windows', essential: true, vs: 'Error List ▸ Copy / Show Error Help', description: 'Ctrl+C copies a row; F1 or the code opens its Microsoft Learn page.' },
];
export const GROUPS: FeatureGroup[] = ['Editing', 'Navigation', 'Code intelligence', 'Tool windows', 'Files', 'Git', 'Gherkin', 'View', 'Debugging', 'Help and productivity'];

const KEY = 'tas:features';
type Saved = { preset?: 'essentials' | 'all'; overrides?: Record<string, boolean> };
/** The desktop app starts with Visual Studio's essentials; the web app with everything. */
const defaultPreset = (): 'essentials' | 'all' => (isDesktop ? 'essentials' : 'all');
let saved: Saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved; } catch { return {}; } })();
let version = 0;
const listeners = new Set<() => void>();
const byCommand = new Map<string, string>(FEATURES.flatMap((f) => (f.commands ?? []).map((c) => [c, f.id] as [string, string])));

export const featurePreset = () => saved.preset ?? defaultPreset();
export function featureOn(id: string) {
  const f = FEATURES.find((x) => x.id === id);
  if (!f) return true;
  const o = saved.overrides?.[id];
  if (o !== undefined) return o;
  return featurePreset() === 'all' || f.essential;
}
/** Whether a Rider command may run (its feature is on; commands without a feature always may). */
export const commandOn = (commandId: string) => { const f = byCommand.get(commandId.replace(/^external:.*/, 'external-tools')); return !f || featureOn(f); };
export const featureOfCommand = (commandId: string) => FEATURES.find((f) => f.id === byCommand.get(commandId));

function changed() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage blocked */ }
  version++;
  applyToDocument();
  for (const l of listeners) l();
}
export function setFeature(id: string, on: boolean) { saved = { ...saved, overrides: { ...saved.overrides, [id]: on } }; changed(); }
export function setFeatures(values: Record<string, boolean>) { saved = { ...saved, overrides: { ...saved.overrides, ...values } }; changed(); }
/** A preset clears the individual switches. */
export function setFeaturePreset(preset: 'essentials' | 'all') { saved = { preset, overrides: {} }; changed(); }
export const onFeaturesChanged = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useFeatures = () => { useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version); return featureOn; };
export const useFeature = (id: string) => { useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version); return featureOn(id); };
/** Disabled features as a class list on <html> (CSS hides what they draw), e.g. data-features-off="codelens inlay-hints". */
function applyToDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.featuresOff = FEATURES.filter((f) => !featureOn(f.id)).map((f) => f.id).join(' ');
}
applyToDocument();
/** Rider command ids that are turned off (the desktop app hides them from its native menus). */
export const disabledCommands = () => FEATURES.filter((f) => !featureOn(f.id)).flatMap((f) => f.commands ?? []);
