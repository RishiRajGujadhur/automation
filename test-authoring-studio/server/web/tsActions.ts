import { ts, applyEdits, type TsProject } from './tsService.js';

/**
 * Quick Actions (Ctrl+.) for TypeScript / JavaScript: the TypeScript service's refactorings and code fixes at the
 * caret or selection, and the studio's own actions (FRONTEND-100.md) where the service has none. An action's id
 * carries what is needed to compute its edits again; applying returns each file's new text.
 */
export type WebAction = { id: string; title: string; kind: 'fix' | 'refactor' };
export type Change = { file: string; text: string; added?: boolean; renamedFrom?: string };
export type Context = { project: TsProject; file: string; abs: string; text: string; from: number; to: number; sf: ts.SourceFile; checker: ts.TypeChecker };
/** A studio action: offered when `titles` returns something; `apply` returns the file's new text or several files. */
export type Custom = { name: string; offer: (c: Context) => string | undefined; apply: (c: Context) => string | Change[] };
const customs: Custom[] = [];
export const registerCustom = (c: Custom) => { customs.push(c); };

export const prefs: ts.UserPreferences = {
  includeCompletionsForModuleExports: true, includeCompletionsWithInsertText: true, includeCompletionsForImportStatements: true,
  quotePreference: 'auto', importModuleSpecifierPreference: 'shortest', allowRenameOfImportPath: true, includePackageJsonAutoImports: 'auto',
  provideRefactorNotApplicableReason: false, allowTextChangesInNewFiles: true, interactiveInlayHints: false,
};
export const fmt = (): ts.FormatCodeSettings => ({ ...ts.getDefaultFormatCodeSettings('\n'), indentSize: 2, tabSize: 2, convertTabsToSpaces: true, semicolons: ts.SemicolonPreference.Ignore });

/** Text with TypeScript's formatting applied to a range of it (a rewritten function, say); the editor text is restored. */
export function formatRange(c: Context, text: string, start: number, end: number) {
  c.project.setText(c.file, text);
  try { return applyEdits(text, c.project.service.getFormattingEditsForRange(c.abs, start, end, fmt())); } finally { c.project.setText(c.file, c.text); }
}
function context(project: TsProject, file: string, text: string, from: number, to: number): Context {
  const abs = project.setText(file, text);
  const program = project.service.getProgram()!;
  const sf = program.getSourceFile(abs);
  if (!sf) throw new Error(`${file} is not part of the TypeScript project.`);
  return { project, file, abs, text, from, to, sf, checker: program.getTypeChecker() };
}
const diagnosticsIn = (c: Context) => {
  const s = c.project.service;
  const all = [...s.getSyntacticDiagnostics(c.abs), ...s.getSemanticDiagnostics(c.abs), ...s.getSuggestionDiagnostics(c.abs)];
  const line = (p: number) => c.sf.getLineAndCharacterOfPosition(p).line;
  return all.filter((d) => d.start !== undefined && (d.start <= c.to && d.start + (d.length ?? 0) >= c.from || line(d.start) === line(c.from)));
};

export function listActions(project: TsProject, file: string, text: string, from: number, to: number): WebAction[] {
  const c = context(project, file, text, from, to);
  const out: WebAction[] = [];
  const seen = new Set<string>();
  // Code fixes for the problems at the caret, and Fix All where the service has one.
  for (const d of diagnosticsIn(c)) {
    let fixes: readonly ts.CodeFixAction[] = [];
    try { fixes = project.service.getCodeFixesAtPosition(c.abs, d.start!, d.start! + (d.length ?? 0), [d.code], fmt(), prefs); } catch { /* no fix */ }
    fixes.forEach((f, i) => {
      if (seen.has(f.description)) return;
      seen.add(f.description);
      out.push({ id: JSON.stringify({ k: 'f', s: d.start, e: d.start! + (d.length ?? 0), c: d.code, i }), title: f.description, kind: 'fix' });
      if (f.fixId && f.fixAllDescription && !seen.has(f.fixAllDescription)) { seen.add(f.fixAllDescription); out.push({ id: JSON.stringify({ k: 'a', x: f.fixId }), title: f.fixAllDescription, kind: 'fix' }); }
    });
  }
  // Refactorings at the caret or for the selection.
  let refactors: readonly ts.ApplicableRefactorInfo[] = [];
  try { refactors = project.service.getApplicableRefactors(c.abs, to > from ? { pos: from, end: to } : from, prefs, 'invoked'); } catch { /* none */ }
  for (const r of refactors) for (const a of r.actions) {
    if (a.notApplicableReason || seen.has(a.description)) continue;
    seen.add(a.description);
    out.push({ id: JSON.stringify({ k: 'r', r: r.name, a: a.name, s: from, e: to }), title: a.description, kind: 'refactor' });
  }
  for (const x of customs) {
    let title: string | undefined;
    try { title = x.offer(c); } catch { title = undefined; }
    if (title && !seen.has(title)) { seen.add(title); out.push({ id: JSON.stringify({ k: 'c', n: x.name, s: from, e: to }), title, kind: 'refactor' }); }
  }
  return out;
}

/** The changes of TypeScript's edits: each touched file's new text (new files included). */
export function changesOf(project: TsProject, edits: readonly ts.FileTextChanges[]): Change[] {
  return edits.map((e) => ({ file: project.rel(e.fileName), text: applyEdits(e.isNewFile ? '' : project.text(e.fileName), e.textChanges), ...(e.isNewFile ? { added: true } : {}) }));
}

export function applyAction(project: TsProject, file: string, text: string, id: string): { title: string; changes: Change[] } {
  const a = JSON.parse(id) as { k: string; s?: number; e?: number; c?: number; i?: number; x?: string; r?: string; a?: string; n?: string };
  const c = context(project, file, text, a.s ?? 0, a.e ?? a.s ?? 0);
  if (a.k === 'f') {
    const f = project.service.getCodeFixesAtPosition(c.abs, a.s!, a.e!, [a.c!], fmt(), prefs)[a.i!];
    if (!f) throw new Error('This fix no longer applies.');
    return { title: f.description, changes: changesOf(project, f.changes) };
  }
  if (a.k === 'a') {
    const r = project.service.getCombinedCodeFix({ type: 'file', fileName: c.abs }, a.x!, fmt(), prefs);
    return { title: 'Fix all', changes: changesOf(project, r.changes) };
  }
  if (a.k === 'r') {
    const r = project.service.getEditsForRefactor(c.abs, fmt(), a.e! > a.s! ? { pos: a.s!, end: a.e! } : a.s!, a.r!, a.a!, prefs);
    if (!r) throw new Error('This refactoring no longer applies.');
    return { title: a.a!, changes: changesOf(project, r.edits) };
  }
  const x = customs.find((y) => y.name === a.n);
  if (!x) throw new Error('Unknown action.');
  const title = x.offer(c);
  if (!title) throw new Error('This action no longer applies here.');
  const r = x.apply(c);
  return { title, changes: typeof r === 'string' ? [{ file, text: r }] : r };
}
