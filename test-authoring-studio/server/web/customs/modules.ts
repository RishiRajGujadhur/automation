import { ts, applyEdits, type TsProject } from '../tsService.js';
import { registerCustom, fmt, prefs, changesOf } from '../tsActions.js';

/** A script's TypeScript twin: .js → .ts, .jsx → .tsx, .mjs → .mts, .cjs → .cts. */
export const tsName = (f: string) => f.replace(/\.jsx$/i, '.tsx').replace(/\.mjs$/i, '.mts').replace(/\.cjs$/i, '.cts').replace(/\.js$/i, '.ts');

/**
 * F9 Convert JavaScript to TypeScript: the text the file will have as TypeScript — JSDoc types moved into
 * annotations, parameters typed from their usage. Worked out on an in-memory copy at the new name.
 */
export function convertToTs(project: TsProject, file: string, source: string) {
  const target = tsName(file);
  const abs = project.setText(target, source);
  let text = source;
  try {
    for (const fixId of ['annotateWithTypeFromJSDoc', 'inferFromUsage']) {
      try {
        const r = project.service.getCombinedCodeFix({ type: 'file', fileName: abs }, fixId, fmt(), prefs);
        const mine = r.changes.filter((c) => c.fileName === abs).flatMap((c) => c.textChanges);
        if (mine.length) { text = applyEdits(text, mine); project.setText(target, text); }
      } catch { /* this fix has nothing to do */ }
    }
    // JSDoc that only carried types is left as documentation; an empty /** */ block goes.
    text = text.replace(/^[ \t]*\/\*\*\s*\*\/[ \t]*\n/gm, '');
  } finally {
    project.setText(target, undefined);
  }
  return { file: target, text };
}
registerCustom({
  name: 'to-typescript',
  offer: (c) => (/\.(jsx?|mjs|cjs)$/i.test(c.file) ? `Convert to TypeScript (rename to ${tsName(c.file).split('/').pop()})` : undefined),
  apply: (c) => { const r = convertToTs(c.project, c.file, c.text); return [{ file: r.file, text: r.text, renamedFrom: c.file }]; },
});

/**
 * F22 Update imports when files move: the edits a rename or move of a script (or a folder) makes to the imports of
 * other files and to the moved file's own relative imports. The moved file's own changes are given at its new path.
 */
export function editsForMove(project: TsProject, from: string, to: string) {
  const edits = project.service.getEditsForFileRename(project.abs(from), project.abs(to), fmt(), prefs);
  return changesOf(project, edits).map((c) => (c.file === from || c.file.startsWith(`${from}/`) ? { ...c, file: to + c.file.slice(from.length) } : c));
}
export { ts };
