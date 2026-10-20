import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { gotoTodo, gotoDiagnostic } from '../editor/navTools';
import { DEFAULT_TODO_TOKENS } from '../editor/todoHighlight';
import { viewOptions } from '../editor/viewOptions';
import { discoverTests, getTestRun, resultsOf } from '../testing/store';
import { prevConflict } from '../editor/advanced';
import { findInSelection } from '../editor/findInSelection';
import { toggleZen } from '../vscode/zenMode';
import { layoutState } from './layoutModes';
import { splitEditor, toggleMaximizeGroup } from '../vscode/editorGroups';

/**
 * Rider and VS Code features (RIDER-VSCODE-FEATURES.md): commands of the 2026-10-21 list. RiderHost registers them with
 * the same helpers as the earlier batches; each command's feature switch is in src/features.ts.
 */
let failureAt = -1;
export function moreCommands3(h: MoreHelpers): RiderCommand[] {
  const tokens = () => viewOptions().todoTokens ?? DEFAULT_TODO_TOKENS;
  return [
    { id: 'find-in-selection', label: 'Find in Selection', menu: 'Edit', group: true, run: h.inEditor((v) => findInSelection(v) || h.notice('Select the text to search in first.')) },
    { id: 'vs-zen-mode', label: 'Zen Mode', menu: 'View', group: true, shortcut: 'Ctrl K, Z', checked: () => layoutState().mode === 'vszen', run: () => toggleZen() },
    { id: 'split-right', label: 'Split Editor Right', menu: 'View', group: true, run: () => splitEditor('right') },
    { id: 'split-down', label: 'Split Editor Down', menu: 'View', run: () => splitEditor('down') },
    { id: 'maximize-group', label: 'Maximize Editor Group', menu: 'View', shortcut: 'Ctrl K, Ctrl M', run: () => toggleMaximizeGroup() },
    { id: 'secondary-sidebar', label: 'Secondary Side Bar', menu: 'View', shortcut: 'Ctrl Alt B', run: () => window.dispatchEvent(new Event('tas:secondary-sidebar')) },
    { id: 'move-editor-next-group', label: 'Move Editor into Next Group', menu: 'View', run: () => window.dispatchEvent(new CustomEvent('tas:move-editor', { detail: 'next' })) },
    { id: 'move-editor-previous-group', label: 'Move Editor into Previous Group', menu: 'View', run: () => window.dispatchEvent(new CustomEvent('tas:move-editor', { detail: 'previous' })) },
    { id: 'next-todo', label: 'Next TODO', menu: 'Navigate', group: true, run: h.inEditor((v) => gotoTodo(tokens(), 1)(v) || h.notice(`No ${tokens().join(' / ')} comments in this file.`)) },
    { id: 'previous-todo', label: 'Previous TODO', menu: 'Navigate', run: h.inEditor((v) => gotoTodo(tokens(), -1)(v) || h.notice(`No ${tokens().join(' / ')} comments in this file.`)) },
    { id: 'previous-conflict', label: 'Previous Merge Conflict', menu: 'Navigate', run: h.inEditor((v) => prevConflict(v) || h.notice('This file has no merge conflicts.')) },
    { id: 'next-warning', label: 'Next Warning', menu: 'Navigate', run: h.inEditor((v) => gotoDiagnostic('warning', 1)(v) || h.notice('No warnings in this file.')) },
    { id: 'previous-warning', label: 'Previous Warning', menu: 'Navigate', run: h.inEditor((v) => gotoDiagnostic('warning', -1)(v) || h.notice('No warnings in this file.')) },
    { id: 'next-test-failure', label: 'Next Test Failure', menu: 'Navigate', run: () => {
      const failed = getTestRun().results.filter((r) => r.outcome === 'failed');
      if (!failed.length) { h.notice('No failed tests in the last run.'); return; }
      void discoverTests().then(({ tests }) => {
        const located = tests.filter((t) => resultsOf(t, failed).length);
        if (!located.length) { h.notice('The failed tests are not in this repository.'); return; }
        failureAt = (failureAt + 1) % located.length;
        const t = located[failureAt];
        h.navigate({ file: t.file, line: t.line });
        h.notice(`Failure ${failureAt + 1} of ${located.length}: ${t.name}${resultsOf(t, failed)[0]?.message ? ` — ${resultsOf(t, failed)[0].message!.split('\n')[0]}` : ''}`);
      }, (e) => h.notice((e as Error).message));
    } },
  ];
}
