import { ts } from '../tsService.js';
import { registerCustom, type Context } from '../tsActions.js';
import { enclosing } from './types.js';

/** A function-like declaration at the caret (with no JSDoc yet), for F10. */
const undocumented = (c: Context) => {
  const n = enclosing(c, (x): x is ts.FunctionDeclaration | ts.MethodDeclaration | ts.VariableStatement | ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.PropertyDeclaration =>
    ts.isFunctionDeclaration(x) || ts.isMethodDeclaration(x) || ts.isVariableStatement(x) || ts.isClassDeclaration(x) || ts.isInterfaceDeclaration(x) || ts.isTypeAliasDeclaration(x) || ts.isPropertyDeclaration(x));
  if (!n || ts.getJSDocCommentsAndTags(n).length || ts.getJSDocCommentsAndTags(ts.isVariableStatement(n) ? n.declarationList.declarations[0] : n).length) return undefined;
  return n;
};
/** The JSDoc template TypeScript writes for the declaration starting on a line (`@param`, `@returns`, …). */
export function docTemplate(c: Context, at: number) {
  return c.project.service.getDocCommentTemplateAtPosition(c.abs, at, { generateReturnInDocTemplate: true });
}
// F10 Generate JSDoc annotations.
registerCustom({
  name: 'jsdoc',
  offer: (c) => (undocumented(c) ? 'Generate JSDoc comment' : undefined),
  apply: (c) => {
    const n = undocumented(c)!;
    const start = n.getStart(c.sf);
    const lineStart = c.text.lastIndexOf('\n', start - 1) + 1;
    const indent = c.text.slice(lineStart, start);
    const t = docTemplate(c, lineStart);
    if (!t) throw new Error('No JSDoc for this declaration.');
    const doc = t.newText.replace(/\s+$/, '').split('\n').map((l, i) => (i ? indent + l.trimStart().replace(/^\*/, ' *') : l)).join('\n').replace(/\*\/[ \t]+$/, '*/');
    return `${c.text.slice(0, start)}${doc}\n${indent}${c.text.slice(start)}`;
  },
});
