import { ts } from '../tsService.js';
import { registerCustom, type Context } from '../tsActions.js';
import { enclosing } from './types.js';

type Checker = ts.TypeChecker & { getTypeArgumentsForResolvedSignature?: (s: ts.Signature) => readonly ts.Type[] | undefined; getBaseTypeOfLiteralType?: (t: ts.Type) => ts.Type };
const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
/** A type as source text; literal types widen (`5` → `number`) unless `keepLiteral`. */
const typeText = (c: Context, t: ts.Type, at: ts.Node, keepLiteral = false) => {
  const k = c.checker as Checker;
  const w = !keepLiteral && k.getBaseTypeOfLiteralType ? k.getBaseTypeOfLiteralType(t) : t;
  return c.checker.typeToString(w, at, flags);
};
const usable = (s: string) => !/\bany\b|^\{\}$|typeof import|\.\.\. \d+ more/.test(s);

// F6 Infer generic type arguments: a generic call or `new` without type arguments gets the ones TypeScript inferred.
const genericCall = (c: Context) => {
  const n = enclosing(c, (x): x is ts.CallExpression | ts.NewExpression => (ts.isCallExpression(x) || ts.isNewExpression(x)) && !x.typeArguments);
  if (!n) return undefined;
  const sig = c.checker.getResolvedSignature(n);
  const args = sig && (c.checker as Checker).getTypeArgumentsForResolvedSignature?.(sig);
  if (!args?.length) return undefined;
  const texts = args.map((t) => typeText(c, t, n));
  return texts.every(usable) ? { n, texts } : undefined;
};
registerCustom({
  name: 'explicit-type-arguments',
  offer: (c) => { const g = genericCall(c); return g ? `Add explicit type arguments <${g.texts.join(', ')}>` : undefined; },
  apply: (c) => { const { n, texts } = genericCall(c)!; const at = n.expression.end; return `${c.text.slice(0, at)}<${texts.join(', ')}>${c.text.slice(at)}`; },
});

// F7 Add explicit type annotations: a variable, parameter or property without one gets the type TypeScript sees.
const unannotated = (c: Context) => enclosing(c, (x): x is ts.VariableDeclaration | ts.ParameterDeclaration | ts.PropertyDeclaration =>
  (ts.isVariableDeclaration(x) || ts.isParameter(x) || ts.isPropertyDeclaration(x)) && !x.type && ts.isIdentifier(x.name) && !(ts.isVariableDeclaration(x) && ts.isForInStatement(x.parent.parent)) && !(ts.isVariableDeclaration(x) && ts.isForOfStatement(x.parent.parent)));
const annotation = (c: Context) => {
  const d = unannotated(c);
  if (!d || c.from > d.name.end + 1) return undefined;
  const text = typeText(c, c.checker.getTypeAtLocation(d.name), d);
  return usable(text) ? { d, text } : undefined;
};
registerCustom({
  name: 'add-type-annotation',
  offer: (c) => { const a = annotation(c); return a ? `Add explicit type annotation ': ${a.text}'` : undefined; },
  apply: (c) => { const { d, text } = annotation(c)!; const at = (ts.isParameter(d) && d.questionToken ? d.questionToken : d.name).end; return `${c.text.slice(0, at)}: ${text}${c.text.slice(at)}`; },
});

// F8 Remove redundant type annotations: `const n: number = 1`, `let s: string = ''` — the initializer already gives
// the same type.
const redundant = (c: Context) => {
  const d = enclosing(c, (x): x is ts.VariableDeclaration => ts.isVariableDeclaration(x) && !!x.type && !!x.initializer && ts.isIdentifier(x.name));
  if (!d) return undefined;
  const declared = c.checker.typeToString(c.checker.getTypeFromTypeNode(d.type!), d, flags);
  const inferred = typeText(c, c.checker.getTypeAtLocation(d.initializer!), d);
  return declared === inferred && !/\bany\b/.test(declared) ? d : undefined;
};
registerCustom({
  name: 'remove-type-annotation',
  offer: (c) => (redundant(c) ? 'Remove redundant type annotation' : undefined),
  apply: (c) => { const d = redundant(c)!; return c.text.slice(0, d.name.end) + c.text.slice(d.type!.end); },
});
