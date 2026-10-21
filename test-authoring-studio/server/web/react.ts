import { ts, type TsProject } from './tsService.js';

/* React navigation and checks of FRONTEND-100.md that are not Quick Actions: context providers (F49), PropTypes (F50). */

const nodeAt = (sf: ts.SourceFile, pos: number) => {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if (pos >= n.getStart(sf) && pos < n.end) { found = n; n.forEachChild(visit); } };
  visit(sf);
  return found;
};
const tagOf = (n: ts.Node) => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n) ? n : undefined);

/**
 * F49 Navigate React context providers: for the context at the caret (its name, or a useContext(…) call), the JSX
 * that provides it — `<Ctx.Provider value>` and React 19's `<Ctx value>`.
 */
export function contextProviders(project: TsProject, file: string, text: string, pos: number) {
  const abs = project.setText(file, text);
  const program = project.service.getProgram()!;
  const sf = program.getSourceFile(abs)!;
  let n = nodeAt(sf, pos);
  // useContext(Theme): the argument; Theme.Provider: the context.
  const call = n && (ts.isCallExpression(n.parent) ? n.parent : ts.isCallExpression(n.parent?.parent) ? n.parent.parent as ts.CallExpression : undefined);
  if (call && ts.isIdentifier(call.expression) && /^use(Context)?$/.test(call.expression.text) && call.arguments[0]) n = call.arguments[0];
  if (n && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) n = n.parent.expression;
  if (!n || !ts.isIdentifier(n)) throw new Error('Put the caret on a context or a useContext call.');
  const refs = project.service.findReferences(abs, n.getStart(sf)) ?? [];
  const out: { file: string; line: number; column: number; text: string }[] = [];
  for (const r of refs.flatMap((x) => x.references)) {
    const rsf = program.getSourceFile(r.fileName);
    const id = rsf && nodeAt(rsf, r.textSpan.start);
    if (!rsf || !id) continue;
    const viaProvider = ts.isPropertyAccessExpression(id.parent) && id.parent.expression === id && id.parent.name.text === 'Provider' ? tagOf(id.parent.parent) : undefined;
    const direct = tagOf(id.parent) && (id.parent as ts.JsxOpeningElement).tagName === id ? tagOf(id.parent) : undefined;
    const tag = viaProvider ?? direct;
    if (!tag) continue;
    const lc = rsf.getLineAndCharacterOfPosition(tag.getStart(rsf));
    out.push({ file: project.rel(r.fileName), line: lc.line + 1, column: lc.character + 1, text: tag.getText(rsf).split('\n')[0].trim() });
  }
  return { name: n.text, providers: out };
}

/**
 * F50 React component prop type validation (PropTypes): components declaring `X.propTypes = {…}` or
 * `static propTypes = {…}` anywhere in the project; JSX that uses them in this file is checked for missing required
 * props, props the component does not declare, and literal values of the wrong kind.
 */
type Spec = { kind: string; required: boolean };
function propTypesOf(program: ts.Program, root: string) {
  const out = new Map<string, Map<string, Spec>>();
  const read = (o: ts.ObjectLiteralExpression) => {
    const m = new Map<string, Spec>();
    for (const p of o.properties) {
      if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) continue;
      const t = p.initializer.getText().replace(/\s/g, '');
      const kind = /PropTypes\.(\w+)/.exec(t)?.[1] ?? 'any';
      m.set(p.name.text, { kind, required: /\.isRequired$/.test(t) });
    }
    return m;
  };
  for (const sf of program.getSourceFiles()) {
    if (!sf.fileName.startsWith(`${root}/`) || sf.fileName.includes('/node_modules/')) continue;
    const visit = (n: ts.Node) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'propTypes' && ts.isIdentifier(n.left.expression) && ts.isObjectLiteralExpression(n.right)) out.set(n.left.expression.text, read(n.right));
      if (ts.isClassDeclaration(n) && n.name) for (const m of n.members) if (ts.isPropertyDeclaration(m) && m.name.getText() === 'propTypes' && m.initializer && ts.isObjectLiteralExpression(m.initializer)) out.set(n.name.text, read(m.initializer));
      n.forEachChild(visit);
    };
    visit(sf);
  }
  return out;
}
const KIND: Record<string, string> = { string: 'a string', number: 'a number', bool: 'a boolean', func: 'a function', array: 'an array', object: 'an object' };
export function propTypeProblems(project: TsProject, file: string, text: string) {
  if (!/\.(jsx?|tsx)$/i.test(file) || !text.includes('<')) return [];
  const abs = project.setText(file, text);
  const program = project.service.getProgram()!;
  const specs = propTypesOf(program, project.root);
  if (!specs.size) return [];
  const sf = program.getSourceFile(abs)!;
  const out: { from: number; to: number; severity: 'warning'; message: string; rule: string }[] = [];
  const visit = (n: ts.Node) => {
    const tag = tagOf(n);
    const spec = tag && ts.isIdentifier(tag.tagName) ? specs.get(tag.tagName.text) : undefined;
    if (tag && spec) {
      const name = tag.tagName.getText(sf);
      const given = new Map<string, ts.JsxAttribute>();
      const spread = tag.attributes.properties.some(ts.isJsxSpreadAttribute);
      for (const a of tag.attributes.properties) if (ts.isJsxAttribute(a)) given.set(a.name.getText(sf), a);
      const hasChildren = ts.isJsxOpeningElement(tag) && ts.isJsxElement(tag.parent) && tag.parent.children.some((c) => !ts.isJsxText(c) || c.text.trim());
      const at = { from: tag.tagName.getStart(sf), to: tag.tagName.end };
      for (const [prop, s] of spec) if (s.required && !given.has(prop) && !spread && !(prop === 'children' && hasChildren)) out.push({ ...at, severity: 'warning', rule: 'react/prop-types', message: `${name} requires the prop '${prop}' (PropTypes.${s.kind}.isRequired).` });
      for (const [prop, a] of given) {
        const s = spec.get(prop);
        const where = { from: a.name.getStart(sf), to: a.name.end };
        if (!s) { if (!/^(key|ref|children|data-.*|aria-.*)$/.test(prop)) out.push({ ...where, severity: 'warning', rule: 'react/prop-types', message: `${name} does not declare the prop '${prop}' in its propTypes.` }); continue; }
        const v = a.initializer;
        const literal = !v ? 'bool' : ts.isStringLiteral(v) ? 'string' : ts.isJsxExpression(v) && v.expression ? (ts.isNumericLiteral(v.expression) ? 'number' : ts.isStringLiteralLike(v.expression) ? 'string' : v.expression.kind === ts.SyntaxKind.TrueKeyword || v.expression.kind === ts.SyntaxKind.FalseKeyword ? 'bool' : ts.isArrowFunction(v.expression) || ts.isFunctionExpression(v.expression) ? 'func' : ts.isArrayLiteralExpression(v.expression) ? 'array' : undefined) : undefined;
        if (literal && KIND[s.kind] && literal !== s.kind) out.push({ ...where, severity: 'warning', rule: 'react/prop-types', message: `${name}: '${prop}' should be ${KIND[s.kind]} (PropTypes.${s.kind}), not ${KIND[literal]}.` });
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}
