import { ts, applyEdits } from '../tsService.js';
import { registerCustom, formatRange, type Context } from '../tsActions.js';
import { enclosing } from './types.js';

/** References to a declared name in its file (TypeScript's find references), the declaration itself left out. */
function usesOf(c: Context, name: ts.Identifier) {
  const symbol = c.checker.getSymbolAtLocation(name);
  const refs = c.project.service.findReferences(c.abs, name.getStart(c.sf)) ?? [];
  // Only the variable itself: a destructured name's references include the type's property of that name.
  const isVariable = (p: number) => { const n = nodeAt(c, p); if (!n || !ts.isIdentifier(n)) return false; const s = ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n ? c.checker.getShorthandAssignmentValueSymbol(n.parent) : c.checker.getSymbolAtLocation(n); return s === symbol; };
  return refs.flatMap((r) => r.references).filter((r) => r.fileName === c.abs && !r.isDefinition && isVariable(r.textSpan.start)).map((r) => r.textSpan.start);
}
const nodeAt = (c: Context, pos: number) => {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if (pos >= n.getStart(c.sf) && pos < n.end) { found = n; n.forEachChild(visit); } };
  visit(c.sf);
  return found;
};
/** A name already declared in this file where `at` is (globals such as window.name do not count). */
const taken = (c: Context, at: ts.Node, name: string) => c.checker.getSymbolsInScope(at, ts.SymbolFlags.Value | ts.SymbolFlags.Alias).some((s) => s.name === name && !!s.declarations?.some((d) => d.getSourceFile() === c.sf));

// F26 Extract object destructuring: `const u = get(); u.name; u.age` → `const { name, age } = get(); name; age`.
const destructurable = (c: Context) => {
  const d = enclosing(c, (x): x is ts.VariableDeclaration => ts.isVariableDeclaration(x) && ts.isIdentifier(x.name) && !!x.initializer);
  if (!d || c.from > d.name.end) return undefined;
  const uses = usesOf(c, d.name as ts.Identifier).map((p) => nodeAt(c, p)!);
  if (!uses.length) return undefined;
  const props: string[] = [];
  for (const u of uses) {
    const pa = u.parent;
    if (!ts.isPropertyAccessExpression(pa) || pa.expression !== u || ts.isCallExpression(pa.parent) && pa.parent.expression === pa) return undefined;
    // Not when a property is assigned (it would assign to the local instead).
    if (ts.isBinaryExpression(pa.parent) && pa.parent.left === pa && pa.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && pa.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return undefined;
    if (ts.isPrefixUnaryExpression(pa.parent) || ts.isPostfixUnaryExpression(pa.parent)) return undefined;
    if (!props.includes(pa.name.text)) props.push(pa.name.text);
  }
  if (props.some((p) => taken(c, d, p))) return undefined;
  return { d, uses, props };
};
registerCustom({
  name: 'introduce-destructuring',
  offer: (c) => { const x = destructurable(c); return x ? `Introduce object destructuring { ${x.props.join(', ')} }` : undefined; },
  apply: (c) => {
    const { d, uses, props } = destructurable(c)!;
    const edits: ts.TextChange[] = uses.map((u) => { const pa = u.parent as ts.PropertyAccessExpression; return { span: { start: pa.getStart(c.sf), length: pa.end - pa.getStart(c.sf) }, newText: pa.name.text }; });
    edits.push({ span: { start: d.name.getStart(c.sf), length: (d.type ?? d.name).end - d.name.getStart(c.sf) }, newText: `{ ${props.join(', ')} }${d.type ? `: ${d.type.getText(c.sf)}` : ''}` });
    return applyEdits(c.text, edits);
  },
});

// F27 Convert destructuring to property access: `const { a, b: x } = obj` → uses become `obj.a`, `obj.b`.
const destructuring = (c: Context) => {
  const d = enclosing(c, (x): x is ts.VariableDeclaration => ts.isVariableDeclaration(x) && ts.isObjectBindingPattern(x.name) && !!x.initializer);
  if (!d) return undefined;
  const pattern = d.name as ts.ObjectBindingPattern;
  if (pattern.elements.some((e) => e.dotDotDotToken || !ts.isIdentifier(e.name) || e.initializer || (e.propertyName && !ts.isIdentifier(e.propertyName)))) return undefined;
  return { d, pattern };
};
registerCustom({
  name: 'destructuring-to-access',
  offer: (c) => (destructuring(c) ? 'Convert destructuring to property access' : undefined),
  apply: (c) => {
    const { d, pattern } = destructuring(c)!;
    const init = d.initializer!;
    // An identifier is used as it is; anything else gets a variable named after its last property.
    const reuse = ts.isIdentifier(init) || (ts.isPropertyAccessExpression(init) && ts.isIdentifier(init.expression));
    const base = /([A-Za-z_$][\w$]*)\s*\)?\s*$/.exec(init.getText(c.sf).replace(/\(\)$/, ''))?.[1] ?? 'value';
    let name = reuse ? init.getText(c.sf) : base.replace(/^get(?=[A-Z])/, '').replace(/^./, (ch) => ch.toLowerCase());
    if (!reuse) { let n = name, i = 2; while (taken(c, d, n)) n = `${name}${i++}`; name = n; }
    const edits: ts.TextChange[] = [];
    for (const e of pattern.elements) {
      const local = e.name as ts.Identifier;
      const prop = (e.propertyName as ts.Identifier | undefined)?.text ?? local.text;
      for (const p of usesOf(c, local)) {
        const u = nodeAt(c, p)!;
        // `{ a }` shorthand in an object literal keeps its key.
        const shorthand = ts.isShorthandPropertyAssignment(u.parent) && u.parent.name === u;
        edits.push({ span: { start: u.getStart(c.sf), length: u.end - u.getStart(c.sf) }, newText: shorthand ? `${local.text}: ${name}.${prop}` : `${name}.${prop}` });
      }
    }
    const statement = d.parent.parent as ts.VariableStatement;
    if (reuse && (d.parent as ts.VariableDeclarationList).declarations.length === 1) {
      // The whole line goes (its indentation too).
      const start = c.text.lastIndexOf('\n', statement.getStart(c.sf) - 1) + 1;
      const end = c.text[statement.end] === '\n' ? statement.end + 1 : statement.end;
      edits.push({ span: { start, length: end - start }, newText: '' });
    } else edits.push({ span: { start: pattern.getStart(c.sf), length: pattern.end - pattern.getStart(c.sf) }, newText: name });
    return applyEdits(c.text, edits);
  },
});

// F29 Convert null checks to nullish coalescing: `x != null ? x : y`, `x !== null && x !== undefined ? x : y`,
// `x == null ? y : x`, `x === undefined ? y : x` → `x ?? y`.
const same = (c: Context, a: ts.Node, b: ts.Node) => a.getText(c.sf).replace(/\s/g, '') === b.getText(c.sf).replace(/\s/g, '');
const nullish = (n: ts.Expression) => n.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(n) && n.text === 'undefined') || ts.isVoidExpression(n);
/** The tested expression when `e` is `x OP null` / `x OP undefined` with OP in `ops` (either side). */
const checked = (e: ts.Expression, ops: ts.SyntaxKind[]): ts.Expression | undefined => {
  e = ts.isParenthesizedExpression(e) ? e.expression : e;
  if (!ts.isBinaryExpression(e) || !ops.includes(e.operatorToken.kind)) return undefined;
  return nullish(e.right) ? e.left : nullish(e.left) ? e.right : undefined;
};
const coalescable = (c: Context) => {
  const k = enclosing(c, ts.isConditionalExpression);
  if (!k) return undefined;
  const cond = ts.isParenthesizedExpression(k.condition) ? k.condition.expression : k.condition;
  const NOT = [ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken];
  const IS = [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken];
  let subject: ts.Expression | undefined, value: ts.Expression | undefined, fallback: ts.Expression | undefined;
  if (ts.isBinaryExpression(cond) && cond.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const a = checked(cond.left, NOT), b = checked(cond.right, NOT);
    if (a && b && same(c, a, b)) { subject = a; value = k.whenTrue; fallback = k.whenFalse; }
  } else if (checked(cond, NOT)) { subject = checked(cond, NOT); value = k.whenTrue; fallback = k.whenFalse; }
  else if (checked(cond, IS)) { subject = checked(cond, IS); value = k.whenFalse; fallback = k.whenTrue; }
  if (!subject || !value || !fallback || !same(c, subject, value)) return undefined;
  return { k, subject, fallback };
};
registerCustom({
  name: 'nullish-coalescing',
  offer: (c) => (coalescable(c) ? 'Convert to nullish coalescing (??)' : undefined),
  apply: (c) => {
    const { k, subject, fallback } = coalescable(c)!;
    const right = ts.isBinaryExpression(fallback) || ts.isConditionalExpression(fallback) ? `(${fallback.getText(c.sf)})` : fallback.getText(c.sf);
    const text = `${subject.getText(c.sf)} ?? ${right}`;
    return formatRange(c, c.text.slice(0, k.getStart(c.sf)) + text + c.text.slice(k.end), k.getStart(c.sf), k.getStart(c.sf) + text.length);
  },
});
