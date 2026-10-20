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
  { id: 'error-list-sort', label: 'Error List: sort by column', group: 'Tool windows', essential: true, vs: 'Error List column sort', description: 'Click a column header to sort (again: descending, then build order).' },
  { id: 'output-find', label: 'Output: Find', group: 'Tool windows', essential: true, vs: 'Output window ▸ Find', description: 'A search box above the build Output shows only the matching lines.' },
  { id: 'code-metrics', label: 'Calculate Code Metrics', group: 'Code intelligence', essential: false, vs: 'Analyze ▸ Calculate Code Metrics', description: 'Maintainability, complexity, coupling and lines per type and member of the C# file.', commands: ['code-metrics'] },
  { id: 'fade-usings', label: 'Fade unnecessary usings', group: 'Code intelligence', essential: true, vs: 'Fade out unused code', description: 'Unused using directives are greyed out (IDE0005).' },
  { id: 'test-group-by', label: 'Test Explorer: Group By', group: 'Tool windows', essential: true, vs: 'Test Explorer ▸ Group By', description: 'Group tests by project and class, class / feature, outcome or duration.' },
  { id: 'test-search-filters', label: 'Test Explorer: search filters', group: 'Tool windows', essential: true, vs: 'Test Explorer filter syntax', description: 'outcome:, class:, project:, feature:, name:, file: terms, "quoted phrases" and -exclusions.' },
  { id: 'test-copy', label: 'Test Explorer: Copy details', group: 'Tool windows', essential: true, vs: 'Test Explorer ▸ Copy', description: 'A test\'s context menu copies its name, outcome, duration, message and stack trace.' },
  { id: 'test-collapse-all', label: 'Test Explorer: Collapse / Expand All', group: 'Tool windows', essential: true, vs: 'Test Explorer ▸ Collapse All', description: 'A toolbar button collapses or expands every group.' },
  { id: 'run-file-tests', label: 'Run All Tests in File', group: 'Debugging', essential: true, vs: 'Run Tests (file context)', description: 'Runs every test (or scenario) of the active file.', commands: ['run-file-tests'] },
  { id: 'tool-tags', label: 'Tags window', group: 'Gherkin', essential: true, description: 'Every Gherkin tag with its scenarios (View ▸ Tags).', commands: ['tool-tags'] },
  { id: 'rename-tag', label: 'Rename Tag', group: 'Gherkin', essential: true, description: 'Renames a tag in every feature file (diff preview and approval).' },
  { id: 'run-tagged', label: 'Run Tagged Scenarios', group: 'Gherkin', essential: true, vs: 'Test Explorer ▸ Traits', description: 'The Tags window runs every scenario with a tag.' },
  { id: 'sync-namespace', label: 'Sync Namespace with Folder', group: 'Code intelligence', essential: true, vs: 'Quick Actions ▸ Change namespace to match folder structure', description: 'Sets the file\'s namespace to the project name plus its folders.', commands: ['sync-namespace'] },
  { id: 'rename-file-to-type', label: 'Rename File to Match Type', group: 'Code intelligence', essential: true, vs: 'Quick Actions ▸ Rename file to match type', description: 'Renames Foo.cs after the type it declares.', commands: ['rename-file-to-type'] },
  { id: 'split-string', label: 'Split String', group: 'Code intelligence', essential: true, vs: 'Quick Actions ▸ Split string', description: 'Splits the C# string at the caret into "…" + "…".', commands: ['split-string'] },
  { id: 'tabify', label: 'Tabify Selected Lines', group: 'Editing', essential: false, vs: 'Edit ▸ Advanced ▸ Tabify Selected Lines', description: 'Leading spaces become tabs.', commands: ['tabify'] },
  { id: 'untabify', label: 'Untabify Selected Lines', group: 'Editing', essential: false, vs: 'Edit ▸ Advanced ▸ Untabify Selected Lines', description: 'Leading tabs become spaces.', commands: ['untabify'] },
  { id: 'block-start', label: 'Move Caret to Code Block Start', group: 'Navigation', essential: true, description: 'Goes to the enclosing { (again: the next block out).', commands: ['block-start'] },
  { id: 'block-end', label: 'Move Caret to Code Block End', group: 'Navigation', essential: true, description: 'Goes to the enclosing } (again: the next block out).', commands: ['block-end'] },
  { id: 'extract-examples-param', label: 'Extract Examples Parameter', group: 'Gherkin', essential: true, description: 'The selected step text becomes <name> with a column in every Examples table.', commands: ['extract-examples-param'] },
  { id: 'outline-to-scenario', label: 'Convert Outline to Scenario', group: 'Gherkin', essential: true, description: 'An outline with one Examples row becomes a plain Scenario.', commands: ['outline-to-scenario'] },
  { id: 'duplicate-scenario', label: 'Duplicate Scenario', group: 'Gherkin', essential: true, description: 'Copies the scenario at the caret (tags and Examples too) below it.', commands: ['duplicate-scenario'] },
  { id: 'close-left', label: 'Close Tabs to the Left', group: 'Files', essential: true, vs: 'Close Tabs to the Left', description: 'The tab menu closes every unpinned tab before it.' },
  { id: 'tab-reveal', label: 'Tab: Reveal in Explorer', group: 'Files', essential: true, vs: 'Tab ▸ Reveal in Solution Explorer', description: 'The tab menu shows the file in the Explorer.' },
  { id: 'search-history', label: 'Search history', group: 'Navigation', essential: true, vs: 'Find in Files ▸ recent searches', description: '↑ / ↓ in the search box recall earlier searches.' },
  { id: 'search-collapse', label: 'Search: Collapse / Expand All', group: 'Navigation', essential: true, vs: 'Find Results ▸ Collapse All', description: 'Collapses or expands every file of the search results.' },
  { id: 'search-copy', label: 'Search: Copy All Results', group: 'Navigation', essential: true, vs: 'Find Results ▸ Copy All', description: 'Copies every result as file, line and text.' },
  { id: 'search-open-only', label: 'Search Only in Open Editors', group: 'Navigation', essential: true, vs: 'Look in: All Open Documents', description: 'A toggle by "files to include" limits the search to the open tabs.' },
  { id: 'indentation', label: 'Indentation (status bar)', group: 'Editing', essential: true, vs: 'Tabs ▸ Indent size / Keep tabs', description: 'Spaces or tabs and the indent size, from the status bar.' },
  { id: 'menu-submenus', label: 'Menu groups (submenus)', group: 'View', essential: true, description: 'Related commands share a submenu (Code ▸ Gherkin) instead of one long menu.', commands: ['menu-submenus'] },
  { id: 'move-scenario-up', label: 'Move Scenario Up', group: 'Gherkin', essential: true, description: 'Swaps the scenario at the caret with the one above.', commands: ['move-scenario-up'] },
  { id: 'move-scenario-down', label: 'Move Scenario Down', group: 'Gherkin', essential: true, description: 'Swaps the scenario at the caret with the one below.', commands: ['move-scenario-down'] },
  { id: 'extract-background', label: 'Extract Background', group: 'Gherkin', essential: true, description: 'The Given steps every scenario starts with move into the Background.', commands: ['extract-background'] },
  { id: 'add-examples', label: 'Add Examples Table', group: 'Gherkin', essential: true, description: 'A Scenario Outline gets an Examples table with a column per <parameter>.', commands: ['add-examples'] },
  { id: 'toggle-tag', label: 'Toggle Tag', group: 'Gherkin', essential: true, description: 'Adds a tag to the scenario at the caret, or removes it.', commands: ['toggle-tag'] },
  { id: 'output-clear', label: 'Output: Clear All', group: 'Tool windows', essential: true, vs: 'Output ▸ Clear All', description: 'Clears the build Output window.' },
  { id: 'output-wrap', label: 'Output: Word Wrap', group: 'Tool windows', essential: true, vs: 'Output ▸ Toggle Word Wrap', description: 'Wraps long lines in the build Output window.' },
  { id: 'next-error', label: 'Next / Previous Error', group: 'Navigation', essential: true, vs: 'View.NextError', description: 'Goes to the next (or previous) build error or warning in the editor.', commands: ['next-error', 'previous-error'] },
  { id: 'explorer-compare', label: 'Explorer: Compare Selected Files', group: 'Files', essential: true, vs: 'Compare Files', description: 'Select for Compare, then Compare with… on another file shows their difference.' },
  { id: 'add-watch', label: 'Add Watch', group: 'Debugging', essential: true, vs: 'Add Watch (editor context menu)', description: 'Adds the selection (or the name at the caret) to the debugger\'s Watch window.', commands: ['add-watch'] },
  { id: 'copy-value', label: 'Locals / Watch: Copy Value', group: 'Debugging', essential: true, vs: 'Locals ▸ Copy Value', description: 'A variable\'s context menu copies its value or expression, or adds a watch.' },
  { id: 'undo-commit', label: 'Undo Last Commit', group: 'Git', essential: true, vs: 'Git ▸ Undo Commit', description: 'Soft-resets the last commit: its changes stay staged.', commands: ['undo-commit'] },
  { id: 'save-as', label: 'Save As…', group: 'Files', essential: true, vs: 'File ▸ Save As', description: 'Writes the editor text to a new file and opens it (the original stays as it is on disk).', commands: ['save-as'] },
  { id: 'find-in-folder', label: 'Explorer: Find in Folder…', group: 'Navigation', essential: true, vs: 'Find in Files ▸ Look in: folder', description: 'A folder\'s context menu opens Search limited to that folder.' },
  { id: 'copy-full-path', label: 'Explorer: Copy Full Path', group: 'Files', essential: true, vs: 'Copy Full Path', description: 'Copies the item\'s absolute path on disk.' },
  { id: 'comment-scenario', label: 'Comment / Uncomment Scenario', group: 'Gherkin', essential: true, description: 'Comments the whole scenario at the caret out (or back in).', commands: ['comment-scenario'] },
  { id: 'quick-info-key', label: 'Quick Info (Ctrl+K, Ctrl+I)', group: 'Code intelligence', essential: true, vs: 'Edit.QuickInfo (Ctrl+K, Ctrl+I)', description: 'The hover information of the symbol at the caret, from the keyboard.', commands: ['quick-info'] },
  { id: 'coverage-selected', label: 'Code Coverage for selected tests', group: 'Debugging', essential: true, vs: 'Test Explorer ▸ Analyze Code Coverage for Selected Tests', description: 'A test\'s (or group\'s) context menu runs it with code coverage.' },
  { id: 'run-not-run', label: 'Run Not Run Tests', group: 'Debugging', essential: true, vs: 'Test Explorer ▸ Run Not Run Tests', description: 'Runs the tests that have no result yet (Test Explorer ▸ More run options).' },
  { id: 'run-passed', label: 'Run Passed Tests', group: 'Debugging', essential: false, vs: 'Test Explorer ▸ Run Passed Tests', description: 'Runs the tests that passed last time (Test Explorer ▸ More run options).' },
  { id: 'paste-table', label: 'Paste as Gherkin Table', group: 'Gherkin', essential: true, description: 'Spreadsheet cells (TSV) or CSV from the clipboard become an aligned table.', commands: ['paste-table'] },
  { id: 'copy-table-csv', label: 'Copy Table as CSV', group: 'Gherkin', essential: true, description: 'Copies the table at the caret as CSV (for spreadsheets).', commands: ['copy-table-csv'] },
  { id: 'scroll-marks', label: 'Scroll bar annotations', group: 'View', essential: true, vs: 'Scroll Bars ▸ Show annotations', description: 'Errors, warnings and the caret line marked over the scroll bar.', commands: ['scroll-marks'] },
  { id: 'report-problem', label: 'Report a Problem', group: 'Help and productivity', essential: true, vs: 'Help ▸ Send Feedback ▸ Report a Problem', description: 'Opens a new GitHub issue with a short template (nothing about your files is sent).', commands: ['report-problem'] },
  { id: 'pinned-row', label: 'Pinned tabs in a separate row', group: 'View', essential: false, vs: 'Tabs ▸ Show pinned tabs in a separate row', description: 'Pinned tabs get their own row above the others.', commands: ['pinned-row'] },
  { id: 'color-tabs', label: 'Colorize document tabs', group: 'View', essential: false, vs: 'Tabs ▸ Colorize document tabs', description: 'Tabs are tinted with their file type\'s colour.', commands: ['color-tabs'] },
  { id: 'tab-copy-name', label: 'Tab: Copy File Name', group: 'Files', essential: true, vs: 'Tab ▸ Copy File Name', description: 'The tab menu copies the file name.' },
  { id: 'git-view-revision', label: 'Git Log: View File at Revision', group: 'Git', essential: true, vs: 'Git History ▸ View file at this commit', description: 'Shows a changed file as it was in the selected commit.' },
  { id: 'git-compare-local', label: 'Git Log: Compare with Local', group: 'Git', essential: true, vs: 'Git History ▸ Compare with Local', description: 'The difference between a file in the selected commit and the working copy.' },
  { id: 'git-copy-message', label: 'Git Log: Copy Commit Message', group: 'Git', essential: true, vs: 'Git History ▸ Copy Commit Message', description: 'Copies the selected commit\'s message.' },
  { id: 'git-log-filters', label: 'Git Log: filter syntax', group: 'Git', essential: true, vs: 'Git History ▸ filters', description: 'author:, branch:, hash: terms, "quoted phrases" and -exclusions in the Git Log filter.' },
  { id: 'git-log-current', label: 'Git Log: Current Branch Only', group: 'Git', essential: true, vs: 'Git History ▸ Branch filter', description: 'Shows only the current branch\'s commits instead of every branch.' },
  { id: 'feature-stats', label: 'Feature statistics (status bar)', group: 'Gherkin', essential: true, description: 'The number of scenarios and steps of the feature file in the status bar.' },
  { id: 'rename-param', label: 'Rename Examples Parameter', group: 'Gherkin', essential: true, description: 'Renames a <parameter> in the outline\'s steps and its Examples column together.', commands: ['rename-param'] },
  { id: 'remove-unused-columns', label: 'Remove Unused Examples Columns', group: 'Gherkin', essential: true, description: 'Examples columns no <parameter> uses are removed.', commands: ['remove-unused-columns'] },
  { id: 'inline-background', label: 'Inline Background', group: 'Gherkin', essential: true, description: 'The Background\'s steps move into every scenario.', commands: ['inline-background'] },
  { id: 'normalize-keywords', label: 'Normalize Step Keywords', group: 'Gherkin', essential: true, description: 'Repeated Given / When / Then become And; a scenario never starts with And.', commands: ['normalize-keywords'] },
  { id: 'remove-duplicate-lines', label: 'Remove Duplicate Lines', group: 'Editing', essential: true, description: 'Removes repeated lines (selection or file).', commands: ['remove-duplicate-lines'] },
  { id: 'remove-blank-lines', label: 'Remove Blank Lines', group: 'Editing', essential: true, description: 'Removes empty lines (selection or file).', commands: ['remove-blank-lines'] },
  { id: 'sort-lines-desc', label: 'Sort Lines Descending', group: 'Editing', essential: true, description: 'Sorts the selected lines (or the file) Z to A, numbers naturally.', commands: ['sort-lines-desc'] },
  { id: 'centered-layout', label: 'Centered layout', group: 'View', essential: false, description: 'The editor text in a readable column in the middle of a wide window.', commands: ['centered-layout'] },
  { id: 'do-not-disturb', label: 'Do Not Disturb', group: 'Help and productivity', essential: true, vs: 'Notifications ▸ Do Not Disturb', description: 'Hides the message pop-ups; they are still kept in the Notifications window.', commands: ['do-not-disturb'] },
  { id: 'next-problem', label: 'Next / Previous Problem in File', group: 'Navigation', essential: true, vs: 'Edit.GoToNextIssueInFile', description: 'F8 / Shift+F8 go to the next or previous error or warning in the editor.', commands: ['next-problem', 'previous-problem'] },
  { id: 'goto-test', label: 'Go to Test / Test Subject', group: 'Navigation', essential: true, vs: 'Navigate ▸ Test (Rider) / Go To Test', description: 'From Foo.cs to FooTests.cs and back.', commands: ['goto-test'] },
  { id: 'palette-recent', label: 'Command palette: recently used first', group: 'Help and productivity', essential: true, vs: 'Command palette ▸ recently used', description: 'The commands you used last are at the top of the command palette.' },
  { id: 'run-selection-terminal', label: 'Run Selected Text in Terminal', group: 'Tool windows', essential: true, vs: 'Terminal ▸ Run Selected Text', description: 'Runs the selection (or the caret\'s line) in the Terminal window.', commands: ['run-selection-terminal'] },
  { id: 'selected-lines', label: 'Selected lines in the status bar', group: 'Editing', essential: true, vs: 'Status bar ▸ Sel', description: 'The status bar counts the selected lines too, not only characters.' },
  { id: 'test-group-tag', label: 'Test Explorer: Group by Tag', group: 'Tool windows', essential: true, vs: 'Test Explorer ▸ Group By ▸ Traits', description: 'Scenarios grouped by their Gherkin tags (traits).' },
  { id: 'test-tag-filter', label: 'Test Explorer: tag: filter', group: 'Tool windows', essential: true, vs: 'Test Explorer ▸ Trait filter', description: 'tag:@smoke (or -tag:…) in the Test Explorer search.' },
  { id: 'clear-file-breakpoints', label: 'Remove Breakpoints in File', group: 'Debugging', essential: true, vs: 'Remove All Breakpoints in File (Rider)', description: 'Removes every breakpoint of the active file.', commands: ['clear-file-breakpoints'] },
  { id: 'toggle-readonly', label: 'Toggle Read-Only (session)', group: 'Editing', essential: true, vs: 'Toggle Active Editor Read-only in Session', description: 'Makes the active file refuse edits until toggled back.', commands: ['toggle-readonly'] },
  { id: 'add-scenario', label: 'Add Scenario', group: 'Gherkin', essential: true, description: 'Starts a new scenario after the one at the caret.', commands: ['add-scenario'] },
  { id: 'copy-scenario-md', label: 'Copy Scenario as Markdown', group: 'Gherkin', essential: true, description: 'Copies the scenario at the caret as Markdown (for reports and tickets).', commands: ['copy-scenario-md'] },
  { id: 'copy-problems', label: 'Copy Problems in File', group: 'Code intelligence', essential: true, vs: 'Error List ▸ Copy (current document)', description: 'Copies the errors and warnings of the active file (file:line:column: severity: message).', commands: ['copy-problems'] },
  { id: 'full-screen', label: 'Full Screen', group: 'View', essential: true, vs: 'View ▸ Full Screen (Shift+Alt+Enter)', description: 'The whole window full screen (the desktop app has it in its View menu).', commands: ['full-screen'] },
  { id: 'git-undo-file', label: 'Git: Undo Changes in File', group: 'Git', essential: true, vs: 'Git ▸ Undo Changes', description: 'Brings the active file back to its last committed version.', commands: ['git-undo-file'] },
  { id: 'git-stage-file', label: 'Git: Stage File', group: 'Git', essential: true, vs: 'Git ▸ Stage', description: 'Stages the active file (save it first).', commands: ['git-stage-file'] },
  { id: 'git-file-history', label: 'Git: Show History for File', group: 'Git', essential: true, vs: 'Git ▸ View History', description: 'The Git Log of the active file only.', commands: ['git-file-history'] },
  { id: 'explorer-open-filter', label: 'Explorer: Open Files filter', group: 'Files', essential: true, vs: 'Solution Explorer ▸ Open Files Filter', description: 'Shows only the files open in editor tabs.' },
  { id: 'explorer-track', label: 'Explorer: Track Active Item toggle', group: 'Files', essential: true, vs: 'Options ▸ Track Active Item in Solution Explorer', description: 'Turns off revealing the active file in the Explorer (Sync stays one click away).' },
  { id: 'unpin-all', label: 'Tabs: Unpin All', group: 'Files', essential: true, vs: 'Tab ▸ Unpin All', description: 'The tab menu unpins every pinned tab.' },
  { id: 'sort-tabs', label: 'Sort Tabs by Name', group: 'Files', essential: false, vs: 'Editor Tabs ▸ Sort tabs alphabetically (Rider)', description: 'Orders the editor tabs alphabetically (pinned tabs stay first).', commands: ['sort-tabs'] },
  { id: 'fold-usings', label: 'Collapse Using Directives', group: 'Code intelligence', essential: true, vs: 'Outlining ▸ Collapse usings', description: 'Folds the using block at the top of a C# file.', commands: ['fold-usings'] },
  { id: 'find-step-usages', label: 'Find Step Usages (feature step)', group: 'Gherkin', essential: true, vs: 'Find Usages on a Gherkin step', description: 'Every feature step bound to the same step definition as the step at the caret.', commands: ['find-step-usages'] },
  { id: 'copy-step-text', label: 'Copy Step Text', group: 'Gherkin', essential: true, description: 'Copies the step at the caret without its keyword (for the step catalogue or a binding).', commands: ['copy-step-text'] },
  { id: 'sort-json', label: 'Sort JSON Keys', group: 'Editing', essential: true, vs: 'JSON ▸ Sort keys', description: 'Orders every object\'s keys alphabetically.', commands: ['sort-json'] },
  { id: 'copy-json-pointer', label: 'Copy JSON Pointer', group: 'Editing', essential: true, vs: 'JSON ▸ Copy JSON Pointer (Rider)', description: 'Copies the JSON Pointer (/a/0/b) of the value at the caret.', commands: ['copy-json-pointer'] },
  { id: 'copy-xpath', label: 'Copy XPath', group: 'Editing', essential: true, vs: 'XML ▸ Copy XPath (Rider)', description: 'Copies the XPath of the XML element at the caret (selector dictionaries, configs).', commands: ['copy-xpath'] },
  { id: 'md-word-count', label: 'Word count (Markdown)', group: 'Editing', essential: true, description: 'The status bar counts the words of a Markdown or text file (or the selection).' },
  { id: 'toggle-status-bar', label: 'Toggle Status Bar', group: 'View', essential: true, vs: 'View ▸ Status Bar', description: 'Hides or shows the status bar.', commands: ['toggle-status-bar'] },
  { id: 'toggle-activity-bar', label: 'Toggle Activity Bar', group: 'View', essential: true, vs: 'View ▸ Appearance ▸ Activity Bar', description: 'Hides or shows the activity bar (VS Code layout).', commands: ['toggle-activity-bar'] },
  { id: 'whats-new', label: 'What\'s New', group: 'Help and productivity', essential: true, vs: 'Help ▸ What\'s New', description: 'Lists the latest IDE features with their switches (Help ▸ What\'s New).', commands: ['whats-new'] },
  { id: 'table-duplicate-row', label: 'Table: Duplicate Row', group: 'Gherkin', essential: true, description: 'Copies the caret\'s table row below it.', commands: ['table-duplicate-row'] },
  { id: 'table-delete-row', label: 'Table: Delete Row', group: 'Gherkin', essential: true, description: 'Removes the caret\'s table row.', commands: ['table-delete-row'] },
  { id: 'table-move-column', label: 'Table: Move Column', group: 'Gherkin', essential: true, description: 'Moves the caret\'s table column left or right.', commands: ['table-column-left', 'table-column-right'] },
  { id: 'table-select-column', label: 'Table: Select Column', group: 'Gherkin', essential: true, description: 'Selects every cell of the caret\'s column (one caret per row).', commands: ['table-select-column'] },
  { id: 'clear-recent', label: 'Clear Recent Files', group: 'Navigation', essential: true, vs: 'File ▸ Recent ▸ Clear', description: 'Empties the Recent Files and Recent Locations lists.', commands: ['clear-recent'] },
  { id: 'clear-bookmarks', label: 'Clear All Bookmarks', group: 'Navigation', essential: true, vs: 'Bookmarks ▸ Delete All Bookmarks', description: 'Deletes every bookmark of the workspace.', commands: ['clear-bookmarks'] },
  { id: 'save-live-template', label: 'Save as Live Template', group: 'Editing', essential: true, vs: 'Tools ▸ Save as Live Template (Rider)', description: 'Saves the selection as your own live template (Insert Live Template lists it).', commands: ['save-live-template'] },
  { id: 'toggle-ignore', label: 'Toggle Ignore Test', group: 'Debugging', essential: true, vs: 'Unit Tests ▸ Ignore (Rider)', description: 'Adds or removes [Ignore("…")] on the test method at the caret.', commands: ['toggle-ignore'] },
  { id: 'ignore-scenario', label: 'Ignore / Unignore Scenario', group: 'Gherkin', essential: true, description: 'Toggles the @ignore tag (SpecFlow / Reqnroll skip the scenario).', commands: ['ignore-scenario'] },
  { id: 'copy-step-stub', label: 'Copy Step Definition Stub', group: 'Gherkin', essential: true, vs: 'Create Step (copy to clipboard)', description: 'Copies a C# binding method for the step at the caret.', commands: ['copy-step-stub'] },
  { id: 'zoom-ide', label: 'Zoom IDE', group: 'View', essential: true, vs: 'View ▸ Appearance ▸ Zoom IDE (Rider)', description: 'Zooms the whole window in or out (50–200 %), not only the editors.', commands: ['zoom-ide-in', 'zoom-ide-out', 'zoom-ide-reset'] },
  { id: 'compact-mode', label: 'Compact mode', group: 'View', essential: false, vs: 'Appearance ▸ Compact mode (Rider)', description: 'Tighter rows in trees, tabs, menus and the status bar.', commands: ['compact-mode'] },
  { id: 'features-io', label: 'Export / Import Feature Settings', group: 'Help and productivity', essential: true, vs: 'Import and Export Settings', description: 'Copies the Settings ▸ Features switches as JSON, or applies pasted ones.', commands: ['export-features', 'import-features'] },
  { id: 'copy-env-info', label: 'Copy Environment Info', group: 'Help and productivity', essential: true, vs: 'Help ▸ About ▸ Copy Info', description: 'Copies the app version, browser and screen details for a bug report.', commands: ['copy-env-info'] },
  { id: 'current-scenario', label: 'Highlight current scenario', group: 'Gherkin', essential: true, description: 'The scenario the caret is in gets a light background band.', commands: ['current-scenario'] },
  { id: 'table-transpose', label: 'Table: Transpose', group: 'Gherkin', essential: true, description: 'Turns the table\'s rows into columns (vertical tables and back).', commands: ['table-transpose'] },
  { id: 'table-fill-down', label: 'Table: Fill Down', group: 'Gherkin', essential: true, description: 'Copies the cell above into the caret\'s cell (or every selected row).', commands: ['table-fill-down'] },
  { id: 'table-clear-column', label: 'Table: Clear Column', group: 'Gherkin', essential: true, description: 'Empties the caret\'s column (the header stays).', commands: ['table-clear-column'] },
  { id: 'explorer-copy-name', label: 'Explorer: Copy File Name', group: 'Files', essential: true, vs: 'Copy File Name', description: 'A file\'s context menu copies its name.' },
  { id: 'open-to-side', label: 'Explorer: Open to the Side', group: 'Files', essential: true, vs: 'Open to the Side', description: 'A file\'s context menu opens it in the split editor.' },
  { id: 'test-copy-filter', label: 'Test Explorer: Copy dotnet test Filter', group: 'Tool windows', essential: true, description: 'Copies a dotnet test --filter for the selected tests (CI, the command line).' },
  { id: 'test-failed-only', label: 'Test Explorer: Failed tests only', group: 'Tool windows', essential: true, vs: 'Test Explorer ▸ Failed Tests filter', description: 'A toolbar toggle shows only the tests that failed.' },
  { id: 'notifications-copy', label: 'Notifications: Copy All', group: 'Tool windows', essential: true, description: 'Copies every message of the Notifications window.' },
  { id: 'reset-features', label: 'Reset Feature Settings', group: 'Help and productivity', essential: true, vs: 'Import and Export Settings ▸ Reset all settings', description: 'Turns Settings ▸ Features back to the app\'s default set.', commands: ['reset-features'] },
  { id: 'status-goto-line', label: 'Status bar: Go to Line', group: 'Navigation', essential: true, vs: 'Status bar ▸ Go to Line', description: 'A click on "Ln, Col" in the status bar opens Go to Line.' },
  { id: 'status-file-props', label: 'Status bar: File Properties', group: 'Files', essential: true, description: 'A click on the encoding in the status bar shows the file\'s properties.' },
  { id: 'sort-scenarios', label: 'Sort Scenarios by Name', group: 'Gherkin', essential: false, description: 'Orders the scenarios of a feature by title (tags and Examples move with them).', commands: ['sort-scenarios'] },
  { id: 'quick-theme', label: 'Quick Switch Theme', group: 'View', essential: true, vs: 'Quick Switch Scheme (Rider)', description: 'A list of the app themes to switch to (View ▸ Quick Switch Theme).', commands: ['quick-theme'] },
  { id: 'close-type', label: 'Close All Tabs of This Type', group: 'Files', essential: true, description: 'The tab menu closes every tab with the same extension (pinned ones stay).' },
  { id: 'copy-outline', label: 'Copy Feature Outline', group: 'Gherkin', essential: true, description: 'Copies the feature and its scenarios as a Markdown checklist.', commands: ['copy-outline'] },
  { id: 'test-summary', label: 'Test Explorer: Copy Results Summary', group: 'Tool windows', essential: true, vs: 'Test Explorer ▸ Copy summary', description: 'Copies the passed / failed / skipped counts and the failed tests.' },
  { id: 'toggle-breadcrumbs', label: 'Toggle Breadcrumbs', group: 'View', essential: true, vs: 'View ▸ Show Breadcrumbs', description: 'View ▸ Breadcrumbs shows or hides the Feature › Rule › Scenario bar.', commands: ['toggle-breadcrumbs'] },
  { id: 'scroll-past-end', label: 'Scroll past the end', group: 'View', essential: true, vs: 'Editor ▸ Scroll beyond last line', description: 'The editors scroll until the last line is at the top.', commands: ['scroll-past-end'] },
  { id: 'search-count', label: 'Find: match counter', group: 'Editing', essential: true, vs: 'Find widget match count', description: 'The find panel shows "3 of 12" for the current match.' },
  { id: 'editor-links', label: 'Ctrl+click links in the editor', group: 'Editing', essential: true, vs: 'Editor ▸ Links', description: 'Web addresses in the text are underlined; Ctrl+click opens them.' },
  { id: 'editor-file-links', label: 'Ctrl+click file:line references', group: 'Navigation', essential: true, description: 'path/File.cs:12 in any editor opens at that line on Ctrl+click.' },
  { id: 'selection-count', label: 'Multi-caret count in the status bar', group: 'Editing', essential: true, vs: 'Status bar ▸ selections', description: 'With several carets the status bar shows how many.' },
  { id: 'drag-path', label: 'Drag files into the editor', group: 'Files', essential: true, description: 'Dragging a file from the Explorer into an editor inserts its path.' },
  { id: 'caret-restore', label: 'Reopen files where you left them', group: 'Editing', essential: true, vs: 'Restore editor view state', description: 'Each file remembers its caret, also after a reload.' },
  { id: 'gherkin-indent', label: 'Gherkin smart indent', group: 'Gherkin', essential: true, description: 'Enter after Scenario:, Examples: or a step ending in ":" indents one level more.' },
  { id: 'table-enter', label: 'Enter adds a table row', group: 'Gherkin', essential: true, description: 'Enter at the end of a table row adds an empty aligned row below.' },
  { id: 'paste-align', label: 'Align pasted table rows', group: 'Gherkin', essential: true, description: 'Pasting rows into a table aligns its columns.' },
  { id: 'explorer-remember', label: 'Explorer remembers collapsed folders', group: 'Files', essential: true, description: 'Collapsed folders stay collapsed after a reload (per workspace).' },
  { id: 'explorer-arrows', label: 'Explorer arrow keys', group: 'Files', essential: true, description: 'Up / Down / Home / End move through the tree; Right / Left expand and collapse.' },
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
/** Export / Import Feature Settings: the preset and every switch changed from it, as JSON. */
export const exportFeatures = () => JSON.stringify({ preset: saved.preset ?? 'default', overrides: saved.overrides ?? {} }, null, 2);
export function importFeatures(json: string) {
  const v = JSON.parse(json) as { preset?: string; overrides?: Record<string, unknown> };
  const known = new Set(FEATURES.map((f) => f.id));
  const overrides = Object.fromEntries(Object.entries(v.overrides ?? {}).filter(([k, on]) => known.has(k) && typeof on === 'boolean')) as Record<string, boolean>;
  saved = { ...(v.preset === 'essentials' || v.preset === 'all' ? { preset: v.preset } : {}), overrides };
  changed();
  return Object.keys(overrides).length;
}
export function setFeature(id: string, on: boolean) { saved = { ...saved, overrides: { ...saved.overrides, [id]: on } }; changed(); }
export function setFeatures(values: Record<string, boolean>) { saved = { ...saved, overrides: { ...saved.overrides, ...values } }; changed(); }
/** A preset clears the individual switches. */
/** Reset Feature Settings: the default preset of this app (desktop: essentials, web: all), no individual switches. */
export function resetFeatures() { saved = {}; changed(); }
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
