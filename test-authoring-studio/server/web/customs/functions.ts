import { ts } from '../tsService.js';
import { registerCustom, formatRange, type Context } from '../tsActions.js';
import { enclosing, replaceNode } from './types.js';

/** Whether a function body uses `this` or `arguments` of its own (an arrow function would change their meaning). */
function usesOwnThis(body: ts.Node) {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (n.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(n) && n.text === 'arguments')) { found = true; return; }
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n) || ts.isClassLike(n)) return;
    n.forEachChild(visit);
  };
  body.forEachChild(visit);
  return found;
}
const text = (c: Context, n: ts.Node | undefined) => (n ? n.getText(c.sf) : '');

// F15 Convert function declarations to arrow functions: `function f(a) {…}` → `const f = (a) => {…};`.
const declaration = (c: Context) => {
  const f = enclosing(c, ts.isFunctionDeclaration);
  if (!f?.name || !f.body || f.asteriskToken || c.from > f.body.getStart(c.sf) || usesOwnThis(f.body)) return undefined;
  // Overloads stay functions.
  const overloads = c.sf.statements.filter((s) => ts.isFunctionDeclaration(s) && s.name?.text === f.name!.text);
  return overloads.length === 1 ? f : undefined;
};
registerCustom({
  name: 'function-to-arrow',
  offer: (c) => (declaration(c) ? 'Convert to arrow function' : undefined),
  apply: (c) => {
    const f = declaration(c)!;
    const mods = (ts.getModifiers(f) ?? []).filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword && m.kind !== ts.SyntaxKind.DefaultKeyword).map((m) => m.getText(c.sf));
    const isDefault = (ts.getModifiers(f) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    const isAsync = (ts.getModifiers(f) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    // A lone type parameter needs a trailing comma in .tsx (`<T,>`), or it reads as a JSX tag.
    const tp = f.typeParameters?.length ? `<${f.typeParameters.map((p) => text(c, p)).join(', ')}${f.typeParameters.length === 1 && /\.tsx$/i.test(c.file) ? ',' : ''}>` : '';
    const params = `(${f.parameters.map((p) => text(c, p)).join(', ')})`;
    const ret = f.type ? `: ${text(c, f.type)}` : '';
    const arrow = `${isAsync ? 'async ' : ''}${tp}${params}${ret} => ${text(c, f.body)}`;
    const decl = `${mods.length ? `${mods.join(' ')} ` : ''}const ${f.name!.text} = ${arrow};${isDefault ? `\nexport default ${f.name!.text};` : ''}`;
    return replaceNode(c, f, decl);
  },
});

// F14 Convert async/await to promise chains: `const x = await a(); rest` → `return a().then((x) => { rest });`.
function chain(c: Context, statements: readonly ts.Statement[]): string | undefined {
  const awaitIn = (n: ts.Node): boolean => ts.isAwaitExpression(n) || (!ts.isFunctionLike(n) && !!n.forEachChild((x) => (awaitIn(x) ? true : undefined)));
  const i = statements.findIndex(awaitIn);
  if (i < 0) return statements.map((s) => text(c, s)).join('\n');
  const before = statements.slice(0, i).map((s) => text(c, s));
  const s = statements[i];
  const rest = statements.slice(i + 1);
  let expr: ts.Expression | undefined;
  let param = '';
  if (ts.isVariableStatement(s) && s.declarationList.declarations.length === 1) {
    const d = s.declarationList.declarations[0];
    if (d.initializer && ts.isAwaitExpression(d.initializer) && !awaitIn(d.initializer.expression)) { expr = d.initializer.expression; param = text(c, d.name); }
  } else if (ts.isExpressionStatement(s) && ts.isAwaitExpression(s.expression) && !awaitIn(s.expression.expression)) {
    expr = s.expression.expression;
  } else if (ts.isReturnStatement(s) && s.expression && ts.isAwaitExpression(s.expression) && !awaitIn(s.expression.expression)) {
    return [...before, `return ${text(c, s.expression.expression)};`].join('\n');
  }
  if (!expr) return undefined;
  const body = chain(c, rest);
  if (body === undefined) return undefined;
  const target = ts.isParenthesizedExpression(expr) || ts.isCallExpression(expr) || ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr) ? text(c, expr) : `(${text(c, expr)})`;
  return [...before, `return ${target}.then((${param}) => {\n${body}\n});`].join('\n');
}
const asyncFunction = (c: Context) => {
  const f = enclosing(c, (x): x is ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration => (ts.isFunctionDeclaration(x) || ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isMethodDeclaration(x)) && !!(ts.getModifiers(x) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
  if (!f?.body || !ts.isBlock(f.body) || c.from > f.body.getStart(c.sf)) return undefined;
  const hasTry = (n: ts.Node): boolean => ts.isTryStatement(n) || (!ts.isFunctionLike(n) && !!n.forEachChild((x) => (hasTry(x) ? true : undefined)));
  if (f.body.statements.some(hasTry)) return undefined;
  const body = chain(c, f.body.statements);
  return body === undefined ? undefined : { f, body };
};
registerCustom({
  name: 'async-to-then',
  offer: (c) => (asyncFunction(c) ? 'Convert to promise chain (.then)' : undefined),
  apply: (c) => {
    const { f, body } = asyncFunction(c)!;
    const indent = /[ \t]*/.exec(c.text.slice(c.text.lastIndexOf('\n', f.getStart(c.sf)) + 1))![0];
    const block = `{\n${body.split('\n').map((l) => `${indent}  ${l.trim() ? l.trimStart() : ''}`).join('\n')}\n${indent}}`;
    const asyncKw = (ts.getModifiers(f) ?? []).find((m) => m.kind === ts.SyntaxKind.AsyncKeyword)!;
    // Remove `async`, replace the body.
    const withBody = c.text.slice(0, f.body!.getStart(c.sf)) + block + c.text.slice(f.body!.end);
    const a = asyncKw.getStart(c.sf);
    const out = withBody.slice(0, a) + withBody.slice(a + 'async'.length).replace(/^\s+/, '');
    return formatRange(c, out, f.getStart(c.sf), f.getStart(c.sf) + block.length + 200);
  },
});

// F12 Convert callbacks to promises: `fn(args, (err, data) => {…})` → a Promise, with the error branch in `.catch`.
const callbackCall = (c: Context) => {
  const call = enclosing(c, (x): x is ts.CallExpression => ts.isCallExpression(x) && x.arguments.length > 0);
  if (!call) return undefined;
  const cb = call.arguments[call.arguments.length - 1];
  if (!(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) || cb.parameters.length < 1 || cb.parameters.length > 2) return undefined;
  const err = cb.parameters[0].name;
  if (!ts.isIdentifier(err) || !/^(err|error|e)$/i.test(err.text)) return undefined;
  return { call, cb, err: err.text, value: cb.parameters[1] ? text(c, cb.parameters[1].name) : '' };
};
registerCustom({
  name: 'callback-to-promise',
  offer: (c) => (callbackCall(c) ? 'Convert callback to promise' : undefined),
  apply: (c) => {
    const { call, cb, err, value } = callbackCall(c)!;
    const args = call.arguments.slice(0, -1).map((a) => text(c, a));
    const promise = `new Promise((resolve, reject) => ${text(c, call.expression)}(${[...args, `(${err}, ${value || 'result'}) => (${err} ? reject(${err}) : resolve(${value || 'result'}))`].join(', ')}))`;
    // The callback's leading `if (err) …` becomes the .catch handler; the rest runs in .then.
    let thenBody = '';
    let catchBody = '';
    if (ts.isBlock(cb.body)) {
      const [first, ...rest] = cb.body.statements;
      if (first && ts.isIfStatement(first) && ts.isIdentifier(first.expression) && first.expression.text === err && !first.elseStatement) {
        catchBody = ts.isBlock(first.thenStatement) ? first.thenStatement.statements.map((s) => text(c, s)).join('\n') : text(c, first.thenStatement);
        thenBody = rest.map((s) => text(c, s)).join('\n');
      } else thenBody = cb.body.statements.map((s) => text(c, s)).join('\n');
    } else thenBody = `return ${text(c, cb.body)};`;
    const out = `${promise}\n  .then((${value}) => {\n    ${thenBody.split('\n').join('\n    ')}\n  })${catchBody ? `\n  .catch((${err}) => {\n    ${catchBody.split('\n').join('\n    ')}\n  })` : ''}`;
    const start = call.getStart(c.sf);
    return formatRange(c, replaceNode(c, call, out), start, start + out.length);
  },
});
