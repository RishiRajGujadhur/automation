import { ts, type TsProject } from './tsService.js';

/**
 * F23 Detect circular module dependencies: the import graph of the repository's scripts (imports, re-exports,
 * dynamic imports and require calls, resolved like the compiler does) and its cycles (strongly connected parts),
 * each with the import lines that close it. Type-only imports are left out (they vanish at runtime).
 */
export function importCycles(project: TsProject) {
  const program = project.service.getProgram()!;
  const options = program.getCompilerOptions();
  const inRepo = (f: string) => f.startsWith(`${project.root}/`) && !f.includes('/node_modules/');
  const files = program.getSourceFiles().filter((sf) => inRepo(sf.fileName) && !sf.isDeclarationFile);
  const edges = new Map<string, { to: string; line: number }[]>();
  for (const sf of files) {
    const out: { to: string; line: number }[] = [];
    const add = (spec: ts.Expression, at: ts.Node) => {
      if (!ts.isStringLiteralLike(spec)) return;
      const r = ts.resolveModuleName(spec.text, sf.fileName, options, ts.sys).resolvedModule;
      if (r && inRepo(r.resolvedFileName) && !r.resolvedFileName.endsWith('.d.ts')) out.push({ to: r.resolvedFileName.replace(/\\/g, '/'), line: sf.getLineAndCharacterOfPosition(at.getStart(sf)).line + 1 });
    };
    const visit = (n: ts.Node) => {
      if (ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly) add(n.moduleSpecifier, n);
      else if (ts.isExportDeclaration(n) && n.moduleSpecifier && !n.isTypeOnly) add(n.moduleSpecifier, n);
      else if (ts.isCallExpression(n) && n.arguments.length === 1 && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) add(n.arguments[0], n);
      n.forEachChild(visit);
    };
    visit(sf);
    edges.set(sf.fileName, out);
  }
  // Tarjan's strongly connected components; a part with more than one file (or a file importing itself) is a cycle.
  let next = 0;
  const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], on = new Set<string>();
  const parts: string[][] = [];
  const connect = (v: string) => {
    index.set(v, next); low.set(v, next); next++; stack.push(v); on.add(v);
    for (const e of edges.get(v) ?? []) {
      if (!index.has(e.to)) { connect(e.to); low.set(v, Math.min(low.get(v)!, low.get(e.to)!)); }
      else if (on.has(e.to)) low.set(v, Math.min(low.get(v)!, index.get(e.to)!));
    }
    if (low.get(v) === index.get(v)) {
      const part: string[] = [];
      let w: string;
      do { w = stack.pop()!; on.delete(w); part.push(w); } while (w !== v);
      if (part.length > 1 || (edges.get(v) ?? []).some((e) => e.to === v)) parts.push(part.sort());
    }
  };
  for (const f of edges.keys()) if (!index.has(f)) connect(f);
  return {
    files: files.length,
    cycles: parts.map((part) => {
      const set = new Set(part);
      return {
        members: part.map((f) => project.rel(f)),
        edges: part.flatMap((f) => (edges.get(f) ?? []).filter((e) => set.has(e.to)).map((e) => ({ from: project.rel(f), to: project.rel(e.to), file: project.rel(f), line: e.line }))),
      };
    }),
  };
}
