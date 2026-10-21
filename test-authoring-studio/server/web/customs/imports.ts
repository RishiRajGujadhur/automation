import { ts, applyEdits } from '../tsService.js';
import { registerCustom, fmt, prefs, type Context } from '../tsActions.js';

/** The file's text after TypeScript's Organize Imports in a mode (All = sort, combine, remove unused). */
function organized(c: Context, mode: ts.OrganizeImportsMode) {
  const edits = c.project.service.organizeImports({ type: 'file', fileName: c.abs, mode }, fmt(), prefs).filter((e) => e.fileName === c.abs).flatMap((e) => e.textChanges);
  return applyEdits(c.text, edits);
}
const hasImports = (c: Context) => c.sf.statements.some(ts.isImportDeclaration);

// F19 Organize ES module imports (Shift+Alt+O): sorted, merged, unused ones removed.
registerCustom({
  name: 'organize-imports',
  offer: (c) => (hasImports(c) && organized(c, ts.OrganizeImportsMode.All) !== c.text ? 'Organize imports' : undefined),
  apply: (c) => organized(c, ts.OrganizeImportsMode.All),
});
// F20 Remove unused imports (order kept).
registerCustom({
  name: 'remove-unused-imports',
  offer: (c) => (hasImports(c) && organized(c, ts.OrganizeImportsMode.RemoveUnused) !== c.text ? 'Remove unused imports' : undefined),
  apply: (c) => organized(c, ts.OrganizeImportsMode.RemoveUnused),
});

// F18 Convert ES modules to CommonJS: imports become require calls, exports go on module.exports.
const esModule = (c: Context) => c.sf.statements.some((s) => ts.isImportDeclaration(s) || ts.isExportAssignment(s) || ts.isExportDeclaration(s) || (ts.canHaveModifiers(s) && (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)));
registerCustom({
  name: 'esm-to-commonjs',
  offer: (c) => (/\.(jsx?|cjs|mjs)$/i.test(c.file) && esModule(c) ? 'Convert to CommonJS module' : undefined),
  apply: (c) => {
    const exportsList: string[] = [];
    let defaultExport = '';
    const out: string[] = [];
    const t = (n: ts.Node) => n.getText(c.sf);
    for (const s of c.sf.statements) {
      if (ts.isImportDeclaration(s)) {
        const from = t(s.moduleSpecifier);
        const clause = s.importClause;
        if (!clause) { out.push(`require(${from});`); continue; }
        if (clause.isTypeOnly) continue;
        const req = `require(${from})`;
        const parts: string[] = [];
        if (clause.name) out.push(`const ${clause.name.text} = ${req};`);
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) out.push(`const ${nb.name.text} = ${req};`);
        if (nb && ts.isNamedImports(nb)) {
          for (const e of nb.elements) if (!e.isTypeOnly) parts.push(e.propertyName ? `${e.propertyName.text}: ${e.name.text}` : e.name.text);
          if (parts.length) out.push(`const { ${parts.join(', ')} } = ${req};`);
        }
        continue;
      }
      if (ts.isExportAssignment(s)) { defaultExport = t(s.expression); continue; }
      if (ts.isExportDeclaration(s)) {
        if (s.moduleSpecifier) { out.push(`Object.assign(module.exports, require(${t(s.moduleSpecifier)}));`); continue; }
        if (s.exportClause && ts.isNamedExports(s.exportClause)) for (const e of s.exportClause.elements) exportsList.push(e.propertyName ? `${e.name.text}: ${e.propertyName.text}` : e.name.text);
        continue;
      }
      const mods = ts.canHaveModifiers(s) ? ts.getModifiers(s) ?? [] : [];
      const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (!exported) { out.push(t(s)); continue; }
      // `export` (and `default`) come off the declaration; its names go on module.exports.
      let body = t(s);
      for (const m of mods.filter((m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword)) body = body.replace(new RegExp(`^(\\s*)${m.getText(c.sf)}\\s+`), '$1');
      out.push(body);
      const names = ts.isVariableStatement(s) ? s.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : [])) : (s as ts.DeclarationStatement).name && ts.isIdentifier((s as ts.DeclarationStatement).name!) ? [((s as ts.DeclarationStatement).name as ts.Identifier).text] : [];
      if (isDefault && names[0]) defaultExport = names[0]; else exportsList.push(...names);
    }
    const tail = defaultExport
      ? [`module.exports = ${defaultExport};`, ...exportsList.map((n) => `module.exports.${n.split(':')[0].trim()} = ${(n.split(':')[1] ?? n).trim()};`)]
      : exportsList.length ? [`module.exports = { ${exportsList.join(', ')} };`] : [];
    // Keep the file's leading comments.
    const lead = c.text.slice(0, c.sf.statements[0]?.getStart(c.sf) ?? 0);
    return `${lead}${[...out, ...(tail.length ? ['', ...tail] : [])].join('\n')}\n`;
  },
});
