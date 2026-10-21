import { ts } from '../tsService.js';
import { registerCustom, type Context } from '../tsActions.js';

/** The innermost node at a position, then its ancestors: the first one `test` accepts. */
export function enclosing<T extends ts.Node>(c: Context, test: (n: ts.Node) => n is T, pos = c.from): T | undefined {
  let found: T | undefined;
  const visit = (n: ts.Node) => { if (pos < n.getStart(c.sf) || pos > n.end) return; if (test(n)) found = n; n.forEachChild(visit); };
  visit(c.sf);
  return found;
}
/** Replaces a node's text. */
export const replaceNode = (c: Context, n: ts.Node, text: string) => c.text.slice(0, n.getStart(c.sf)) + text + c.text.slice(n.end);
const modifiers = (c: Context, n: ts.Node) => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : []).map((m) => m.getText(c.sf)).join(' ');
const typeParams = (c: Context, n: ts.InterfaceDeclaration | ts.TypeAliasDeclaration) => (n.typeParameters?.length ? `<${n.typeParameters.map((p) => p.getText(c.sf)).join(', ')}>` : '');
/** The text between a body's braces, as written. */
const bodyText = (c: Context, members: ts.NodeArray<ts.TypeElement>, open: number, close: number) => (members.length ? c.text.slice(open + 1, close - 1) : ' ');

// F2 Convert interface to type alias: `interface A extends B { x: T }` becomes `type A = B & { x: T };`.
registerCustom({
  name: 'interface-to-type',
  offer: (c) => (enclosing(c, ts.isInterfaceDeclaration) ? 'Convert to type alias' : undefined),
  apply: (c) => {
    const n = enclosing(c, ts.isInterfaceDeclaration)!;
    const heritage = n.heritageClauses?.flatMap((h) => h.types.map((t) => t.getText(c.sf))) ?? [];
    const open = c.text.indexOf('{', n.name.end);
    const literal = `{${bodyText(c, n.members, open, n.end)}}`;
    const mods = modifiers(c, n);
    return replaceNode(c, n, `${mods ? `${mods} ` : ''}type ${n.name.text}${typeParams(c, n)} = ${[...heritage, literal].join(' & ')};`);
  },
});

// F3 Convert type alias to interface: `type A = B & { x: T }` becomes `interface A extends B { x: T }`.
const literalParts = (t: ts.TypeNode): { literal: ts.TypeLiteralNode; bases: ts.TypeNode[] } | undefined => {
  if (ts.isTypeLiteralNode(t)) return { literal: t, bases: [] };
  if (ts.isIntersectionTypeNode(t)) {
    const literals = t.types.filter(ts.isTypeLiteralNode);
    const bases = t.types.filter((x) => !ts.isTypeLiteralNode(x));
    if (literals.length === 1 && bases.every((b) => ts.isTypeReferenceNode(b) || ts.isExpressionWithTypeArguments(b))) return { literal: literals[0], bases };
  }
  return undefined;
};
registerCustom({
  name: 'type-to-interface',
  offer: (c) => { const n = enclosing(c, ts.isTypeAliasDeclaration); return n && literalParts(n.type) ? 'Convert to interface' : undefined; },
  apply: (c) => {
    const n = enclosing(c, ts.isTypeAliasDeclaration)!;
    const { literal, bases } = literalParts(n.type)!;
    const mods = modifiers(c, n);
    const body = bodyText(c, literal.members, literal.getStart(c.sf), literal.end);
    return replaceNode(c, n, `${mods ? `${mods} ` : ''}interface ${n.name.text}${typeParams(c, n)}${bases.length ? ` extends ${bases.map((b) => b.getText(c.sf)).join(', ')}` : ''} {${body}}`);
  },
});
