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
import { api } from '../api';
import { refactorCommands } from './refactor400';
import { analysisCommands } from './analysis400';
import { generateIEquatable, generateComparison, generateAsyncDisposable, interpolationToFormatCmd, recordToClassCmd } from '../editor/csharpGen';
import type { EditorView } from '@codemirror/view';

/**
 * Rider and VS Code features (RIDER-VSCODE-FEATURES.md): commands of the 2026-10-21 list. RiderHost registers them with
 * the same helpers as the earlier batches; each command's feature switch is in src/features.ts.
 */

type Flow = { kind: string; count: number; control: { startReachable: boolean; endReachable: boolean; returns: number; entryPoints: number; exitPoints: number } | null; data: Record<string, string> | null };
/** Line / column of the selection for the language service. */
const range = (v: EditorView) => { const r = v.state.selection.main; const a = v.state.doc.lineAt(r.from), b = v.state.doc.lineAt(r.to); return { line: a.number, column: r.from - a.from + 1, endLine: b.number, endColumn: r.to - b.from + 1 }; };
/** Analyze Control Flow / Data Flow (Rider's inspections of the selection): Roslyn's analysis as a readable report. */
export function flowReport(f: Flow, what: 'control' | 'data') {
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  const head = f.kind === 'statements' ? `${f.count} statement${f.count === 1 ? '' : 's'} selected` : 'Expression selected';
  if (what === 'control') {
    if (!f.control) return `${head}

Control flow is analysed for whole statements: select one or more statements of a block.`;
    const c = f.control;
    return `${head}

Start point reachable:  ${yes(c.startReachable)}
End point reachable:    ${yes(c.endReachable)}${c.endReachable ? '' : '  (every path returns, throws or jumps away)'}
Return statements:      ${c.returns}
Entry points (labels):  ${c.entryPoints}
Exit points (return, break, continue, goto): ${c.exitPoints}`;
  }
  const d = f.data ?? {};
  const row = (label: string, k: string) => `${label.padEnd(30)} ${d[k] || '(none)'}`;
  return [head, '', row('Flows in (read, set before):', 'dataFlowsIn'), row('Flows out (set, read after):', 'dataFlowsOut'), row('Read inside:', 'readInside'), row('Written inside:', 'writtenInside'), row('Always assigned:', 'alwaysAssigned'), row('Declared inside:', 'declared'), row('Captured by lambdas:', 'captured')].join('\n');
}
let failureAt = -1;
export function moreCommands3(h: MoreHelpers): RiderCommand[] {
  const tokens = () => viewOptions().todoTokens ?? DEFAULT_TODO_TOKENS;
  return [
    ...refactorCommands(h),
    ...analysisCommands(h),
    { id: 'find-in-selection', label: 'Find in Selection', menu: 'Edit', group: true, run: h.inEditor((v) => findInSelection(v) || h.notice('Select the text to search in first.')) },
    { id: 'vs-zen-mode', label: 'Zen Mode', menu: 'View', group: true, shortcut: 'Ctrl K, Z', checked: () => layoutState().mode === 'vszen', run: () => toggleZen() },
    { id: 'split-right', label: 'Split Editor Right', menu: 'View', group: true, run: () => splitEditor('right') },
    { id: 'split-down', label: 'Split Editor Down', menu: 'View', run: () => splitEditor('down') },
    { id: 'maximize-group', label: 'Maximize Editor Group', menu: 'View', shortcut: 'Ctrl K, Ctrl M', run: () => toggleMaximizeGroup() },
    { id: 'secondary-sidebar', label: 'Secondary Side Bar', menu: 'View', shortcut: 'Ctrl Alt B', run: () => window.dispatchEvent(new Event('tas:secondary-sidebar')) },
    { id: 'move-editor-next-group', label: 'Move Editor into Next Group', menu: 'View', run: () => window.dispatchEvent(new CustomEvent('tas:move-editor', { detail: 'next' })) },
    { id: 'move-editor-previous-group', label: 'Move Editor into Previous Group', menu: 'View', run: () => window.dispatchEvent(new CustomEvent('tas:move-editor', { detail: 'previous' })) },
    { id: 'open-floating', label: 'Open in New Window', menu: 'View', run: h.inEditor((_v, file) => { if (!window.open(`${location.origin}${location.pathname}#/float?file=${encodeURIComponent(file)}`, '_blank', 'popup,width=900,height=700')) h.notice('The window was blocked: allow pop-ups for the studio.'); }) },
    { id: 'analyze-control-flow', label: 'Analyze Control Flow', menu: 'Code', group: true, run: h.inEditor((v, file) => { if (!file.endsWith('.cs')) { h.notice('Open a C# file and select statements.'); return; } void api<Flow>('/csharp/op', { op: 'flow', file, source: v.state.doc.toString(), ...range(v) }).then((f) => window.dispatchEvent(new CustomEvent('tas:text-preview', { detail: flowReport(f, 'control') })), (e) => h.notice((e as Error).message)); }) },
    { id: 'analyze-data-flow', label: 'Analyze Data Flow', menu: 'Code', run: h.inEditor((v, file) => { if (!file.endsWith('.cs')) { h.notice('Open a C# file and select statements or an expression.'); return; } void api<Flow>('/csharp/op', { op: 'flow', file, source: v.state.doc.toString(), ...range(v) }).then((f) => window.dispatchEvent(new CustomEvent('tas:text-preview', { detail: flowReport(f, 'data') })), (e) => h.notice((e as Error).message)); }) },
    { id: 'method-hierarchy', label: 'Method Hierarchy', menu: 'Navigate', run: h.inEditor((v, file) => { if (!file.endsWith('.cs')) { h.notice('Open a C# file and put the caret on a method.'); return; } const r = v.state.selection.main.head; const l = v.state.doc.lineAt(r); void api<{ name: string; items: { name: string; container?: string; depth: number; relation: string; file: string | null; line: number; external?: string }[] }>('/csharp/op', { op: 'methodHierarchy', file, source: v.state.doc.toString(), line: l.number, column: r - l.from + 1 }).then((m) => window.dispatchEvent(new CustomEvent('tas:location-list', { detail: { title: `Method Hierarchy: ${m.name}`, items: m.items.map((i) => ({ file: i.file ?? undefined, line: i.line, label: `${'  '.repeat(i.depth)}${i.relation === 'this' ? '● ' : i.relation === 'interface' ? '◇ ' : i.relation === 'base' ? '↑ ' : '↓ '}${i.name}`, detail: i.file ? `${i.relation} · ${i.file}:${i.line}` : `${i.relation} · ${i.external ?? 'external'}` })) } })), (e) => h.notice((e as Error).message)); }) },
    { id: 'go-to-decompiled', label: 'Go to Decompiled Source', menu: 'Navigate', run: h.inEditor((v, file) => { if (!file.endsWith('.cs')) { h.notice('Open a C# file and put the caret on a framework or NuGet symbol.'); return; } const r = v.state.selection.main.head; const l = v.state.doc.lineAt(r); h.notice('Decompiling…'); void api<{ name: string; assembly: string; text: string; line: number }>('/csharp/op', { op: 'decompile', file, source: v.state.doc.toString(), line: l.number, column: r - l.from + 1 }).then((d) => window.dispatchEvent(new CustomEvent('tas:code-preview', { detail: { title: `${d.name} [decompiled: ${d.assembly}]`, text: d.text, line: d.line } })), (e) => h.notice((e as Error).message)); }) },
    { id: 'inherit-doc', label: 'Inherit Documentation', menu: 'Code', submenu: 'C#', run: h.inEditor((v, file) => {
      if (!file.endsWith('.cs')) { h.notice('Open a C# file and put the caret on an override or an interface member.'); return; }
      const doc = v.state.doc; const line = doc.lineAt(v.state.selection.main.head);
      const name = /\b(\w+)\s*(?:\(|\{|=>|$)/.exec(line.text.replace(/\[.*?\]/g, ''));
      const at = name ? line.from + line.text.indexOf(name[1]) + 1 : v.state.selection.main.head;
      void api<{ locations: unknown[]; external?: string }>('/csharp/base', { file, source: doc.toString(), line: line.number, column: at - line.from + 1 }).then((b) => {
        if (!b.locations.length && !b.external) { h.notice('This member has no base member or interface member to inherit documentation from.'); return; }
        const prev = line.number > 1 ? doc.line(line.number - 1).text.trim() : '';
        if (prev.startsWith('///')) { h.notice('This member already has documentation.'); return; }
        const indent = /^\s*/.exec(line.text)![0];
        let first = line; while (first.number > 1 && /^\s*\[/.test(doc.line(first.number - 1).text)) first = doc.line(first.number - 1);
        v.dispatch({ changes: { from: first.from, insert: `${indent}/// <inheritdoc/>\n` }, userEvent: 'input' });
      }, (e) => h.notice((e as Error).message));
    }) },
    { id: 'generate-comparison', label: 'Generate Comparison Members', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => generateComparison(v) || h.notice('Put the caret in a class or struct with public properties (and no IComparable yet).')) },
    { id: 'generate-iequatable', label: 'Generate IEquatable<T>', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => generateIEquatable(v) || h.notice('Put the caret in a class or struct with public properties (and no IEquatable yet).')) },
    { id: 'generate-async-disposable', label: 'Implement IAsyncDisposable', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => generateAsyncDisposable(v) || h.notice('Put the caret in a class that does not implement IAsyncDisposable yet.')) },
    { id: 'interpolation-to-format', label: 'Convert Interpolation to string.Format', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => interpolationToFormatCmd(v) || h.notice('Put the caret in an interpolated string ($"…").')) },
    { id: 'record-to-class', label: 'Convert Record to Class', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => recordToClassCmd(v) || h.notice('Put the caret on a positional record (record Name(…)).')) },
    { id: 'peek-references', label: 'Peek References', menu: 'Navigate', run: h.inEditor((_v, file) => { if (!file.endsWith('.cs')) { h.notice('Peek References works in C# files.'); return; } window.dispatchEvent(new CustomEvent('tas:peek-references', { detail: file })); }) },
    { id: 'semantic-search', label: 'Semantic Search…', menu: 'Navigate', run: () => window.dispatchEvent(new Event('tas:semantic-search')) },
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
