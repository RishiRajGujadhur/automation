import path from 'node:path';
import { existsSync } from 'node:fs';
import { ts, applyEdits } from '../tsService.js';
import { registerCustom, formatRange, type Context, type Change } from '../tsActions.js';
import { enclosing } from './types.js';

/* React & JSX actions of FRONTEND-100.md (F31, F33, F34, F35, F43, F44, F45). */

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;
const isJsx = (n: ts.Node): n is Jsx => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n);
const isTs = (c: Context) => /\.tsx?$/i.test(c.file);
const t = (c: Context, n: ts.Node) => n.getText(c.sf);
const flags = ts.TypeFormatFlags.NoTruncation;
const typeOf = (c: Context, n: ts.Node) => { const k = c.checker as ts.TypeChecker & { getBaseTypeOfLiteralType?: (t: ts.Type) => ts.Type }; const ty = c.checker.getTypeAtLocation(n); return c.checker.typeToString(k.getBaseTypeOfLiteralType ? k.getBaseTypeOfLiteralType(ty) : ty, n, flags); };
/** A name not declared yet in the file. */
const fresh = (c: Context, base: string) => { let n = base, i = 2; while (new RegExp(`\\b${n}\\b`).test(c.text)) n = `${base}${i++}`; return n; };
/** The function a node is in (component, hook or handler). */
const functionOf = (n: ts.Node): ts.FunctionLikeDeclaration | undefined => { for (let p = n.parent; p; p = p.parent) if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) return p; return undefined; };
/** The top-level statement a node is in. */
const topStatement = (c: Context, n: ts.Node) => { let s: ts.Node = n; while (s.parent && s.parent !== c.sf) s = s.parent; return s; };
/** The statement of the nearest block a node is in, and that block's indentation. */
const blockStatement = (c: Context, n: ts.Node) => { let s: ts.Node = n; while (s.parent && !ts.isBlock(s.parent) && !ts.isSourceFile(s.parent)) s = s.parent; return s; };
const indentAt = (c: Context, pos: number) => /^[ \t]*/.exec(c.text.slice(c.text.lastIndexOf('\n', pos - 1) + 1))![0];
const insertBefore = (c: Context, text: string, node: ts.Node, block: string) => { const at = c.text.lastIndexOf('\n', node.getStart(c.sf) - 1) + 1; return { text: c.text.slice(0, at) + block + c.text.slice(at), at, length: block.length + text.length }; };

/** The JSX element the selection covers (the innermost one containing it). */
const selectedJsx = (c: Context) => {
  let found: Jsx | undefined;
  const visit = (n: ts.Node) => { if (n.getStart(c.sf) <= c.from && c.to <= n.end) { if (isJsx(n)) found = n; n.forEachChild(visit); } };
  visit(c.sf);
  return found;
};

// F31 Extract JSX into React component: the element becomes a component; the locals it uses become its props.
const extractable = (c: Context) => {
  const jsx = selectedJsx(c);
  const fn = jsx && functionOf(jsx);
  if (!jsx || !fn || c.to === c.from && ts.isJsxFragment(jsx)) return undefined;
  const names: { name: string; type: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !ts.isJsxAttribute(n.parent) && !(ts.isJsxOpeningElement(n.parent) || ts.isJsxClosingElement(n.parent) || ts.isJsxSelfClosingElement(n.parent))) {
      const s = c.checker.getSymbolAtLocation(n);
      const d = s?.declarations?.[0];
      if (d && d.getSourceFile() === c.sf && d.pos >= fn.pos && d.end <= fn.end && !(d.pos >= jsx.pos && d.end <= jsx.end) && !names.some((x) => x.name === n.text)) names.push({ name: n.text, type: typeOf(c, n) });
    }
    n.forEachChild(visit);
  };
  visit(jsx);
  return { jsx, fn, names };
};
registerCustom({
  name: 'jsx-to-component',
  offer: (c) => (/\.[jt]sx$/i.test(c.file) && extractable(c) ? 'Extract JSX into component' : undefined),
  apply: (c) => {
    const { jsx, fn, names } = extractable(c)!;
    const name = fresh(c, 'NewComponent');
    const params = names.length ? `{ ${names.map((n) => n.name).join(', ')} }${isTs(c) ? `: { ${names.map((n) => `${n.name}: ${n.type}`).join('; ')} }` : ''}` : '';
    const component = `function ${name}(${params}) {\n  return (\n    ${t(c, jsx)}\n  );\n}\n\n`;
    const use = `<${name}${names.map((n) => ` ${n.name}={${n.name}}`).join('')} />`;
    const replaced = c.text.slice(0, jsx.getStart(c.sf)) + use + c.text.slice(jsx.end);
    const top = topStatement(c, fn);
    const at = top.getStart(c.sf);
    const out = replaced.slice(0, at) + component + replaced.slice(at);
    return formatRange(c, out, at, at + component.length);
  },
});

// F44 Extract inline event handlers: onClick={() => …} → const handleClick = () => …; onClick={handleClick}.
const inlineHandler = (c: Context) => {
  const a = enclosing(c, (x): x is ts.JsxAttribute => ts.isJsxAttribute(x) && /^on[A-Z]/.test(t(c, x.name)));
  const e = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined;
  if (!a || !e || !(ts.isArrowFunction(e) || ts.isFunctionExpression(e))) return undefined;
  const fn = functionOf(a);
  return fn && fn.body && ts.isBlock(fn.body) ? { a, e, fn } : undefined;
};
registerCustom({
  name: 'extract-handler',
  offer: (c) => { const h = inlineHandler(c); return h ? `Extract handler handle${t(c, h.a.name).slice(2)}` : undefined; },
  apply: (c) => {
    const { a, e } = inlineHandler(c)!;
    const name = fresh(c, `handle${t(c, a.name).slice(2)}`);
    const stmt = blockStatement(c, a);
    const indent = indentAt(c, stmt.getStart(c.sf));
    const decl = `${indent}const ${name} = ${t(c, e)};\n`;
    const replaced = c.text.slice(0, e.getStart(c.sf)) + name + c.text.slice(e.end);
    const at = c.text.lastIndexOf('\n', stmt.getStart(c.sf) - 1) + 1;
    return formatRange(c, replaced.slice(0, at) + decl + replaced.slice(at), at, at + decl.length);
  },
});

// F45 Convert inline callbacks to named functions: items.map((item) => …) → function renderItem(item) {…}.
const inlineCallback = (c: Context) => {
  const f = enclosing(c, (x): x is ts.ArrowFunction | ts.FunctionExpression => (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) && ts.isCallExpression(x.parent) && x.parent.arguments.includes(x as ts.Expression));
  if (!f) return undefined;
  const call = f.parent as ts.CallExpression;
  const callee = ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : ts.isIdentifier(call.expression) ? call.expression.text : 'callback';
  const p = f.parameters[0] && ts.isIdentifier(f.parameters[0].name) ? f.parameters[0].name.text : '';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const returnsJsx = ts.isArrowFunction(f) && isJsx(ts.isParenthesizedExpression(f.body) ? f.body.expression : f.body);
  const base = callee === 'map' && returnsJsx ? `render${cap(p || 'Item')}` : callee === 'useEffect' || callee === 'useLayoutEffect' ? 'runEffect' : `${callee}${cap(p || 'Callback')}`;
  return { f, base };
};
registerCustom({
  name: 'callback-to-function',
  offer: (c) => { const x = inlineCallback(c); return x ? `Convert callback to named function ${fresh(c, x.base)}` : undefined; },
  apply: (c) => {
    const { f, base } = inlineCallback(c)!;
    const name = fresh(c, base);
    const stmt = blockStatement(c, f);
    const indent = indentAt(c, stmt.getStart(c.sf));
    const body = ts.isBlock(f.body) ? t(c, f.body) : `{\n${indent}  return ${t(c, f.body)};\n${indent}}`;
    const isAsync = (ts.getModifiers(f) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    const decl = `${indent}${isAsync ? 'async ' : ''}function ${name}(${f.parameters.map((p) => t(c, p)).join(', ')})${f.type ? `: ${t(c, f.type)}` : ''} ${body}\n`;
    const replaced = c.text.slice(0, f.getStart(c.sf)) + name + c.text.slice(f.end);
    const at = c.text.lastIndexOf('\n', stmt.getStart(c.sf) - 1) + 1;
    return formatRange(c, replaced.slice(0, at) + decl + replaced.slice(at), at, at + decl.length);
  },
});

/** A component declaration at the caret: function Name(…) or const Name = (…) => … with a capitalized name. */
const componentAt = (c: Context) => {
  const f = enclosing(c, (x): x is ts.FunctionDeclaration | ts.VariableDeclaration => (ts.isFunctionDeclaration(x) && !!x.name && /^[A-Z]/.test(x.name.text)) || (ts.isVariableDeclaration(x) && ts.isIdentifier(x.name) && /^[A-Z]/.test(x.name.text) && !!x.initializer && (ts.isArrowFunction(x.initializer) || ts.isFunctionExpression(x.initializer))));
  if (!f) return undefined;
  const fn = (ts.isFunctionDeclaration(f) ? f : f.initializer) as ts.FunctionLikeDeclaration;
  const name = ts.isFunctionDeclaration(f) ? f.name! : (f.name as ts.Identifier);
  if (c.from > (fn.body?.getStart(c.sf) ?? fn.end)) return undefined;
  return { fn, name };
};
/** The attributes the component gets in its JSX usages anywhere in the project, with their types. */
function usageProps(c: Context, name: ts.Identifier) {
  const props = new Map<string, Set<string>>();
  const refs = c.project.service.findReferences(c.abs, name.getStart(c.sf)) ?? [];
  const program = c.project.service.getProgram()!;
  for (const r of refs.flatMap((x) => x.references)) {
    const sf = program.getSourceFile(r.fileName);
    if (!sf) continue;
    let n: ts.Node | undefined;
    const find = (x: ts.Node) => { if (r.textSpan.start >= x.getStart(sf) && r.textSpan.start < x.end) { n = x; x.forEachChild(find); } };
    find(sf);
    const tag = n?.parent;
    if (!tag || !(ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag))) continue;
    for (const a of tag.attributes.properties) {
      if (!ts.isJsxAttribute(a)) continue;
      const key = a.name.getText(sf);
      const init = a.initializer;
      const type = !init ? 'boolean' : ts.isStringLiteral(init) ? 'string' : ts.isJsxExpression(init) && init.expression ? typeOf(c, init.expression) : 'unknown';
      (props.get(key) ?? props.set(key, new Set()).get(key)!).add(type);
    }
    if (ts.isJsxOpeningElement(tag) && tag.parent && ts.isJsxElement(tag.parent) && tag.parent.children.some((ch) => !ts.isJsxText(ch) || ch.text.trim())) (props.get('children') ?? props.set('children', new Set()).get('children')!).add('React.ReactNode');
  }
  return [...props].map(([k, types]) => ({ name: k, type: [...types].join(' | '), optional: false }));
}

// F34 Generate React component props: a component without props gets the ones its usages pass.
registerCustom({
  name: 'props-from-usages',
  offer: (c) => { const x = componentAt(c); return x && !x.fn.parameters.length && usageProps(c, x.name).length ? 'Generate props from usages' : undefined; },
  apply: (c) => {
    const { fn, name } = componentAt(c)!;
    const props = usageProps(c, name);
    const param = `{ ${props.map((p) => p.name).join(', ')} }${isTs(c) ? `: { ${props.map((p) => `${p.name}: ${p.type}`).join('; ')} }` : ''}`;
    const open = c.text.indexOf('(', (fn.typeParameters?.end ?? (ts.isFunctionDeclaration(fn) ? fn.name!.end : fn.getStart(c.sf))));
    return c.text.slice(0, open + 1) + param + c.text.slice(open + 1);
  },
});

// F35 Generate TypeScript props interfaces: `({ title, items })` or an inline type → interface NameProps.
const untypedProps = (c: Context) => {
  const x = componentAt(c);
  const p = x?.fn.parameters[0];
  if (!x || !p || !isTs(c) || !ts.isObjectBindingPattern(p.name) || (p.type && !ts.isTypeLiteralNode(p.type))) return undefined;
  return { ...x, p, pattern: p.name };
};
registerCustom({
  name: 'props-interface',
  offer: (c) => { const x = untypedProps(c); return x ? `Generate interface ${x.name.text}Props` : undefined; },
  apply: (c) => {
    const { name, p, pattern, fn } = untypedProps(c)!;
    const iface = fresh(c, `${name.text}Props`);
    let members: string;
    if (p.type && ts.isTypeLiteralNode(p.type)) members = p.type.members.map((m) => `  ${t(c, m).replace(/[;,]\s*$/, '')};`).join('\n');
    else {
      const used = new Map(usageProps(c, name).map((u) => [u.name, u.type]));
      members = pattern.elements.map((e) => {
        const key = t(c, e.propertyName ?? e.name);
        const fromDefault = e.initializer ? typeOf(c, e.initializer) : undefined;
        return `  ${key}${e.initializer ? '?' : ''}: ${used.get(key) ?? fromDefault ?? 'unknown'};`;
      }).join('\n');
    }
    const withType = c.text.slice(0, pattern.end) + `: ${iface}` + c.text.slice((p.type ?? pattern).end);
    const top = topStatement(c, fn);
    const at = top.getStart(c.sf);
    const exported = (ts.canHaveModifiers(top) ? ts.getModifiers(top) ?? [] : []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    return withType.slice(0, at) + `${exported ? 'export ' : ''}interface ${iface} {\n${members}\n}\n\n` + withType.slice(at);
  },
});

// F43 Convert inline JSX styles to CSS classes: style={{ … }} → a class in the component's stylesheet.
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'flex', 'flexGrow', 'flexShrink', 'lineHeight', 'order', 'zoom', 'gridRow', 'gridColumn']);
const inlineStyle = (c: Context) => {
  const a = enclosing(c, (x): x is ts.JsxAttribute => ts.isJsxAttribute(x) && t(c, x.name) === 'style');
  const o = a?.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression && ts.isObjectLiteralExpression(a.initializer.expression) ? a.initializer.expression : undefined;
  if (!a || !o || !o.properties.length) return undefined;
  const decls: string[] = [];
  for (const p of o.properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return undefined;
    const key = p.name.text;
    const v = p.initializer;
    const value = ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v) ? v.text : ts.isNumericLiteral(v) ? (UNITLESS.has(key) || v.text === '0' ? v.text : `${v.text}px`) : undefined;
    if (value === undefined) return undefined;
    decls.push(`  ${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}: ${value};`);
  }
  return { a, decls, el: a.parent.parent as ts.JsxOpeningElement | ts.JsxSelfClosingElement };
};
registerCustom({
  name: 'style-to-class',
  offer: (c) => (inlineStyle(c) ? 'Move inline styles to a CSS class' : undefined),
  apply: (c) => {
    const { a, decls, el } = inlineStyle(c)!;
    // The stylesheet the file imports (a CSS module or plain CSS), else a new one beside it.
    const imp = c.sf.statements.find((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && /\.(css|scss|less)$/.test(s.moduleSpecifier.text));
    const spec = imp ? (imp.moduleSpecifier as ts.StringLiteral).text : `./${path.basename(c.file).replace(/\.[jt]sx?$/, '')}.css`;
    const cssFile = path.posix.join(path.posix.dirname(c.file), spec);
    const moduleName = imp?.importClause?.name?.text ?? (imp?.importClause?.namedBindings && ts.isNamespaceImport(imp.importClause.namedBindings) ? imp.importClause.namedBindings.name.text : undefined);
    const comp = componentAt({ ...c, from: el.getStart(c.sf), to: el.getStart(c.sf) }) ?? undefined;
    const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const tag = t(c, el.tagName);
    const css = existsSync(c.project.abs(cssFile)) ? c.project.text(c.project.abs(cssFile)) : '';
    let cls = moduleName ? `${tag}Style` : `${kebab(comp?.name.text ?? path.basename(c.file).replace(/\.[jt]sx?$/, ''))}-${kebab(tag)}`;
    for (let i = 2; new RegExp(`\\.${cls}\\b`).test(css); i++) cls = cls.replace(/\d*$/, String(i));
    const ref = moduleName ? `{${moduleName}.${cls}}` : `"${cls}"`;
    const existing = el.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && t(c, p.name) === 'className');
    const edits: ts.TextChange[] = [];
    if (existing?.initializer && ts.isStringLiteral(existing.initializer) && !moduleName) {
      edits.push({ span: { start: existing.initializer.getStart(c.sf), length: existing.initializer.end - existing.initializer.getStart(c.sf) }, newText: `"${existing.initializer.text} ${cls}"` });
      edits.push({ span: { start: a.getStart(c.sf) - 1, length: a.end - a.getStart(c.sf) + 1 }, newText: '' });
    } else edits.push({ span: { start: a.getStart(c.sf), length: a.end - a.getStart(c.sf) }, newText: `className=${ref}` });
    if (!imp) edits.push({ span: { start: 0, length: 0 }, newText: `import "${spec}";\n` });
    const changes: Change[] = [
      { file: c.file, text: applyEdits(c.text, edits) },
      { file: cssFile, text: `${css}${css && !css.endsWith('\n') ? '\n' : ''}${css ? '\n' : ''}.${cls} {\n${decls.join('\n')}\n}\n`, ...(css ? {} : { added: true }) },
    ];
    return changes;
  },
});

// F33 Convert class components to functional components (state → useState, lifecycle → useEffect).
const classComponent = (c: Context) => {
  const k = enclosing(c, ts.isClassDeclaration);
  if (!k?.name || c.from > (k.members[0]?.getStart(c.sf) ?? k.end)) return undefined;
  const base = k.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
  if (!base || !/^(React\.)?(Pure)?Component$/.test(t(c, base.expression))) return undefined;
  const render = k.members.find((m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && t(c, m.name) === 'render');
  return render?.body ? { k, base, render } : undefined;
};
registerCustom({
  name: 'class-to-function',
  offer: (c) => (classComponent(c) ? 'Convert to function component' : undefined),
  apply: (c) => {
    const { k, base, render } = classComponent(c)!;
    const [propsType, stateType] = base.typeArguments?.map((x) => t(c, x)) ?? [];
    // Initial state: `state = {…}` or `this.state = {…}` in the constructor.
    let initial: ts.ObjectLiteralExpression | undefined;
    const stateProp = k.members.find((m): m is ts.PropertyDeclaration => ts.isPropertyDeclaration(m) && t(c, m.name) === 'state');
    if (stateProp?.initializer && ts.isObjectLiteralExpression(stateProp.initializer)) initial = stateProp.initializer;
    const ctor = k.members.find(ts.isConstructorDeclaration);
    ctor?.body?.statements.forEach((s) => { if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && t(c, s.expression.left) === 'this.state' && ts.isObjectLiteralExpression(s.expression.right)) initial = s.expression.right; });
    const keys = (initial?.properties ?? []).flatMap((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) ? [{ name: p.name.text, init: ts.isPropertyAssignment(p) ? t(c, p.initializer) : p.name.text }] : []);
    const setter = (n: string) => `set${n.charAt(0).toUpperCase()}${n.slice(1)}`;
    // this.props → props, this.state.x → x, this.setState({ x: v }) → setX(v), this.method → method.
    const rewrite = (node: ts.Node): string => {
      const edits: ts.TextChange[] = [];
      const start = node.getStart(c.sf);
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && t(c, n.expression) === 'this.setState' && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
          const calls = n.arguments[0].properties.flatMap((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) ? [`${setter(p.name.text)}(${rewrite(p.initializer)})`] : ts.isShorthandPropertyAssignment(p) ? [`${setter(p.name.text)}(${p.name.text})`] : []);
          edits.push({ span: { start: n.getStart(c.sf) - start, length: n.end - n.getStart(c.sf) }, newText: calls.join(', ') });
          return;
        }
        if (ts.isPropertyAccessExpression(n) && ts.isPropertyAccessExpression(n.expression) && t(c, n.expression) === 'this.state') { edits.push({ span: { start: n.getStart(c.sf) - start, length: n.end - n.getStart(c.sf) }, newText: n.name.text }); return; }
        if (ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword) { edits.push({ span: { start: n.getStart(c.sf) - start, length: n.end - n.getStart(c.sf) }, newText: n.name.text }); return; }
        n.forEachChild(visit);
      };
      visit(node);
      return applyEdits(t(c, node), edits);
    };
    const lines: string[] = [];
    for (const s of keys) lines.push(`const [${s.name}, ${setter(s.name)}] = useState${stateType && isTs(c) ? `<${stateType}['${s.name}']>` : ''}(${s.init});`);
    const method = (name: string) => k.members.find((m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && t(c, m.name) === name);
    const mount = method('componentDidMount'), unmount = method('componentWillUnmount');
    if (mount?.body || unmount?.body) {
      const body = mount?.body ? rewrite(mount.body).slice(1, -1).trim() : '';
      const cleanup = unmount?.body ? `\nreturn () => {\n${rewrite(unmount.body).slice(1, -1).trim()}\n};` : '';
      lines.push(`useEffect(() => {\n${body}${cleanup}\n}, []);`);
    }
    for (const m of k.members) {
      const name = m.name && ts.isIdentifier(m.name) ? m.name.text : '';
      if (['render', 'componentDidMount', 'componentWillUnmount', 'state'].includes(name) || ts.isConstructorDeclaration(m)) continue;
      if (ts.isMethodDeclaration(m) && m.body) lines.push(`const ${name} = (${m.parameters.map((p) => t(c, p)).join(', ')}) => ${rewrite(m.body)};`);
      else if (ts.isPropertyDeclaration(m) && m.initializer) lines.push(`const ${name} = ${rewrite(m.initializer)};`);
    }
    lines.push(...render.body!.statements.map((s) => rewrite(s)));
    const usesProps = /\bprops\b/.test(lines.join('\n'));
    const mods = (ts.getModifiers(k) ?? []).map((m) => t(c, m)).join(' ');
    const fn = `${mods ? `${mods} ` : ''}function ${k.name!.text}(${usesProps ? `props${propsType && isTs(c) ? `: ${propsType}` : ''}` : ''}) {\n${lines.join('\n')}\n}`;
    let out = c.text.slice(0, k.getStart(c.sf)) + fn + c.text.slice(k.end);
    // The hooks it needs, imported from react.
    const hooks = [...(keys.length ? ['useState'] : []), ...(mount || unmount ? ['useEffect'] : [])];
    const reactImport = c.sf.statements.find((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === 'react');
    const named = reactImport?.importClause?.namedBindings && ts.isNamedImports(reactImport.importClause.namedBindings) ? reactImport.importClause.namedBindings : undefined;
    const missing = hooks.filter((h) => !named?.elements.some((e) => e.name.text === h));
    let shift = 0;
    if (missing.length) {
      if (named) { const at = named.elements[named.elements.length - 1]?.end ?? named.getStart(c.sf) + 1; const ins = `, ${missing.join(', ')}`; out = out.slice(0, at) + ins + out.slice(at); shift = ins.length; }
      else if (reactImport?.importClause?.name) { const at = reactImport.importClause.name.end; const ins = `, { ${missing.join(', ')} }`; out = out.slice(0, at) + ins + out.slice(at); shift = ins.length; }
      else { const ins = `import { ${missing.join(', ')} } from "react";\n`; out = ins + out; shift = ins.length; }
    }
    const at = k.getStart(c.sf) + shift;
    return formatRange(c, out, at, at + fn.length);
  },
});
