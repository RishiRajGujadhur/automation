import type { EditorView } from '@codemirror/view';
import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { api } from '../api';
import { lineChanges } from '../vscode/filesOnSave';

/* Refactorings of RIDER-VSCODE-FEATURES.md done by the language service (langserver/Refactor400.cs). */

type Change = { file: string; text: string; added?: boolean; renamedFrom?: string };
type Result = { title: string; changes: Change[] };
/** A refactoring that renames the open file (Convert to TypeScript): { from, to, text, title }. */
export const RENAME_CONVERT_EVENT = 'tas:rename-convert';
/** Line / column of the caret (and selection end) for the language service. */
export const at = (v: EditorView) => { const r = v.state.selection.main; const a = v.state.doc.lineAt(r.from), b = v.state.doc.lineAt(r.to); return { line: a.number, column: r.from - a.from + 1, endLine: b.number, endColumn: r.to - b.from + 1 }; };
/**
 * The open file's new text goes into the editor (one undo step, the caret kept); other files are shown as diffs to
 * approve (the studio's write rule).
 */
export async function applyRefactor(v: EditorView, file: string, r: Result, notice: (m: string) => void) {
  // Convert to TypeScript (FRONTEND-100.md F9): the workbench renames the file, then shows its new text to approve.
  const renamed = r.changes.find((c) => c.renamedFrom);
  if (renamed) { window.dispatchEvent(new CustomEvent(RENAME_CONVERT_EVENT, { detail: { from: renamed.renamedFrom, to: renamed.file, text: renamed.text, title: r.title } })); return; }
  const mine = r.changes.find((c) => c.file === file);
  const others = r.changes.filter((c) => c.file !== file);
  if (!mine && !others.length) { notice('Nothing to change.'); return; }
  if (mine) {
    const now = v.state.doc.toString();
    const next = mine.text.replace(/\r\n/g, '\n');
    if (now !== next) v.dispatch({ changes: lineChanges(now, next), userEvent: 'input.refactor' });
  }
  if (others.length) {
    const previews = await Promise.all(others.map((c) => api<{ id: string }>('/file/preview', { file: c.file, source: c.text })));
    window.dispatchEvent(new CustomEvent('tas:project-previews', { detail: { title: `${r.title}: ${others.length} other file${others.length === 1 ? '' : 's'}`, previews } }));
  }
  notice(`${r.title}${others.length ? ` (approve the changes to ${others.map((o) => o.file.split('/').pop()).join(', ')})` : ''}.`);
}
/** Runs a refactoring of the language service at the caret. */
export function refactor(h: MoreHelpers, kind: string, extra: Record<string, unknown> = {}) {
  return h.inEditor((v, file) => {
    if (!file.endsWith('.cs')) { h.notice('Open a C# file.'); return; }
    void api<Result>('/csharp/op', { op: 'refactor', kind, file, source: v.state.doc.toString(), ...at(v), ...extra }).then((r) => applyRefactor(v, file, r, h.notice), (e) => h.notice((e as Error).message));
  });
}
/** Asks for a name first (Extract Superclass, Move Members…); cancelled when empty. */
const ask = (h: MoreHelpers, kind: string, key: 'name' | 'target', question: string, initial = '') => h.inEditor((v, file) => {
  const value = window.prompt(question, initial)?.trim();
  if (value === undefined || (key === 'target' && !value)) return;
  if (!file.endsWith('.cs')) { h.notice('Open a C# file.'); return; }
  void api<Result>('/csharp/op', { op: 'refactor', kind, file, source: v.state.doc.toString(), ...at(v), [key]: value || undefined }).then((r) => applyRefactor(v, file, r, h.notice), (e) => h.notice((e as Error).message));
});
/** Opens the Change Signature dialog for the method at the caret (RiderHost shows it). */
const signatureDialog = (h: MoreHelpers, mode: 'change' | 'reorder') => h.inEditor((v, file) => {
  if (!file.endsWith('.cs')) { h.notice('Open a C# file and put the caret on a method.'); return; }
  void api<{ name: string; parameters: { index: number; name: string; type: string; unused: boolean }[] }>('/csharp/op', { op: 'signatureInfo', file, source: v.state.doc.toString(), ...at(v) })
    .then((info) => window.dispatchEvent(new CustomEvent('tas:change-signature', { detail: { mode, info } })), (e) => h.notice((e as Error).message));
});

export function refactorCommands(h: MoreHelpers): RiderCommand[] {
  const R = { menu: 'Code' as const, submenu: 'Refactor' };
  return [
    { id: 'change-signature', label: 'Change Signature…', ...R, shortcut: 'Ctrl F6', run: signatureDialog(h, 'change') },
    { id: 'reorder-parameters', label: 'Reorder Parameters…', ...R, run: signatureDialog(h, 'reorder') },
    { id: 'remove-unused-parameters', label: 'Remove Unused Parameters', ...R, run: refactor(h, 'removeUnusedParameters') },
    { id: 'linq-to-loop', label: 'Convert LINQ to Loop', ...R, run: refactor(h, 'linqToLoop') },
    { id: 'to-local-function', label: 'Convert Method to Local Function', ...R, run: refactor(h, 'toLocalFunction') },
    { id: 'introduce-field', label: 'Introduce Field', ...R, shortcut: 'Ctrl Alt F', run: refactor(h, 'introduceField') },
    { id: 'introduce-property', label: 'Introduce Property', ...R, run: refactor(h, 'introduceProperty') },
    { id: 'inline-field', label: 'Inline Field', ...R, run: refactor(h, 'inlineField') },
    { id: 'pull-members-up', label: 'Pull Members Up', ...R, run: refactor(h, 'pullUp') },
    { id: 'push-members-down', label: 'Push Members Down', ...R, run: refactor(h, 'pushDown') },
    { id: 'extract-superclass', label: 'Extract Superclass…', ...R, run: ask(h, 'extractSuperclass', 'name', 'Name of the new base class (empty: <Class>Base):') },
    { id: 'move-members', label: 'Move Static Members…', ...R, run: ask(h, 'moveStatic', 'target', 'Move the static member to class:') },
    { id: 'introduce-factory', label: 'Introduce Factory Method', ...R, run: refactor(h, 'factory', { replace: false }) },
    { id: 'replace-ctor-factory', label: 'Replace Constructor with Factory Method', ...R, run: refactor(h, 'factory', { replace: true }) },
  ];
}
