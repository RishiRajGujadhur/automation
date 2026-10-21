import type { Express } from 'express';
import { z } from 'zod';
import { confined } from '../core.js';
import { tsProject, SCRIPT, ts, applyEdits } from './tsService.js';
import { listActions, applyAction, prefs, fmt, changesOf } from './tsActions.js';
import './customs/index.js';
import { editsForMove } from './customs/modules.js';
import { importCycles } from './analysis.js';

/**
 * /api/web/*: language features for front-end files (FRONTEND-100.md). Every request carries the editor's text, so
 * unsaved changes count; edits come back as each file's new text (other files go through the studio's diff approval).
 */
const file = z.string().min(1).max(500).refine((v) => !v.split(/[\\/]/).includes('..'), 'Path cannot contain ..');
const at = z.object({ file, source: z.string().max(5_000_000), pos: z.number().int().min(0) });

export function webRoutes(app: Express, root: () => string) {
  const script = async (f: string) => { await confined(root(), f, false); if (!SCRIPT.test(f)) throw new Error('Not a JavaScript or TypeScript file.'); return tsProject(root()); };
  const lineCol = (abs: string, pos: number, p = tsProject(root())) => { const sf = p.sourceFile(abs); const lc = sf ? sf.getLineAndCharacterOfPosition(pos) : { line: 0, character: 0 }; return { line: lc.line + 1, column: lc.character + 1 }; };

  app.post('/api/web/diagnostics', async (req, res) => {
    const b = z.object({ file, source: z.string().max(5_000_000) }).parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const s = p.service;
    const out = [...s.getSyntacticDiagnostics(abs), ...s.getSemanticDiagnostics(abs), ...s.getSuggestionDiagnostics(abs)].filter((d) => d.start !== undefined).map((d) => ({
      from: d.start!, to: d.start! + (d.length ?? 0), code: d.code,
      severity: d.category === ts.DiagnosticCategory.Error ? 'error' : d.category === ts.DiagnosticCategory.Warning ? 'warning' : 'info',
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'), unnecessary: !!d.reportsUnnecessary, deprecated: !!d.reportsDeprecated,
    }));
    res.json(out);
  });

  app.post('/api/web/complete', async (req, res) => {
    const b = at.parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const r = p.service.getCompletionsAtPosition(abs, b.pos, prefs);
    // The word typed so far narrows the list first (the global scope alone has thousands of names).
    const word = /[\w$]*$/.exec(b.source.slice(0, b.pos))![0].toLowerCase();
    const matches = (name: string) => { const n = name.toLowerCase(); if (n[0] !== word[0]) return false; let i = 0; for (const ch of n) if (ch === word[i]) i++; return i === word.length; };
    const entries = (word ? r?.entries.filter((e) => matches(e.name)) : r?.entries) ?? [];
    res.json(r ? { from: r.optionalReplacementSpan?.start, items: entries.slice(0, 400).map((e) => ({ label: e.name, kind: e.kind, sort: e.sortText, insert: e.insertText, source: e.source, data: e.data ? JSON.stringify(e.data) : undefined, replace: e.replacementSpan ? { from: e.replacementSpan.start, to: e.replacementSpan.start + e.replacementSpan.length } : undefined })) } : { items: [] });
  });
  /** An auto-import completion: the import edits that go with it. */
  app.post('/api/web/completeDetails', async (req, res) => {
    const b = at.extend({ name: z.string().max(300), source: z.string().max(5_000_000), origin: z.string().max(500).optional(), data: z.string().max(5000).optional() }).parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const d = p.service.getCompletionEntryDetails(abs, b.pos, b.name, fmt(), b.origin, prefs, b.data ? JSON.parse(b.data) : undefined);
    const mine = d?.codeActions?.flatMap((a) => a.changes).filter((c) => c.fileName === abs).flatMap((c) => c.textChanges) ?? [];
    res.json({ detail: d ? ts.displayPartsToString(d.displayParts) : '', edits: mine.map((e) => ({ from: e.span.start, to: e.span.start + e.span.length, insert: e.newText })) });
  });

  app.post('/api/web/quickinfo', async (req, res) => {
    const b = at.parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const q = p.service.getQuickInfoAtPosition(abs, b.pos);
    res.json(q ? { text: ts.displayPartsToString(q.displayParts), doc: ts.displayPartsToString(q.documentation), from: q.textSpan.start, to: q.textSpan.start + q.textSpan.length } : null);
  });

  const location = (p: ReturnType<typeof tsProject>, abs: string, start: number) => ({ file: p.rel(abs), ...lineCol(abs, start, p) });
  app.post('/api/web/definition', async (req, res) => {
    const b = at.parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const defs = p.service.getDefinitionAtPosition(abs, b.pos) ?? [];
    res.json({ name: defs[0]?.name ?? '', locations: defs.map((d) => ({ ...location(p, d.fileName, d.textSpan.start), external: d.fileName.includes('/node_modules/') || !d.fileName.startsWith(p.root) ? d.fileName : undefined })) });
  });
  app.post('/api/web/references', async (req, res) => {
    const b = at.parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const refs = p.service.findReferences(abs, b.pos) ?? [];
    const name = refs[0]?.definition.name ?? '';
    res.json({ name, locations: refs.flatMap((r) => r.references).filter((r) => r.fileName.startsWith(p.root) && !r.fileName.includes('/node_modules/')).map((r) => { const l = location(p, r.fileName, r.textSpan.start); const line = p.text(r.fileName).split('\n')[l.line - 1] ?? ''; return { ...l, text: line.trim() }; }) });
  });
  app.post('/api/web/rename', async (req, res) => {
    const b = at.extend({ newName: z.string().min(1).max(200) }).parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const info = p.service.getRenameInfo(abs, b.pos, prefs);
    if (!info.canRename) throw new Error(info.localizedErrorMessage);
    const locs = p.service.findRenameLocations(abs, b.pos, false, false, prefs) ?? [];
    const byFile = new Map<string, ts.TextChange[]>();
    for (const l of locs) { const list = byFile.get(l.fileName) ?? []; list.push({ span: l.textSpan, newText: `${l.prefixText ?? ''}${b.newName}${l.suffixText ?? ''}` }); byFile.set(l.fileName, list); }
    res.json({ title: `Rename ${info.displayName} to ${b.newName}`, changes: [...byFile].map(([f, edits]) => ({ file: p.rel(f), text: applyEdits(p.text(f), edits) })) });
  });

  app.post('/api/web/actions', async (req, res) => {
    const b = z.object({ file, source: z.string().max(5_000_000), from: z.number().int().min(0), to: z.number().int().min(0) }).parse(req.body);
    const p = await script(b.file);
    res.json(listActions(p, b.file, b.source, b.from, b.to));
  });
  app.post('/api/web/applyAction', async (req, res) => {
    const b = z.object({ file, source: z.string().max(5_000_000), id: z.string().max(4000) }).parse(req.body);
    const p = await script(b.file);
    res.json(applyAction(p, b.file, b.source, b.id));
  });
  /** F22: before a rename / move in the Explorer, the import updates it needs (shown as diffs to approve after it). */
  app.post('/api/web/fileRename', async (req, res) => {
    const b = z.object({ from: file, to: file }).parse(req.body);
    await confined(root(), b.from); await confined(root(), b.to, false);
    res.json({ changes: editsForMove(tsProject(root()), b.from, b.to) });
  });
  /** F10: typing /** then Enter above a declaration: the JSDoc template for it. */
  app.post('/api/web/docTemplate', async (req, res) => {
    const b = at.parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const t = p.service.getDocCommentTemplateAtPosition(abs, b.pos, { generateReturnInDocTemplate: true });
    res.json(t ? { text: t.newText, caret: t.caretOffset } : null);
  });
  /** F23: circular imports among the repository's scripts. */
  app.get('/api/web/analysis/cycles', (_req, res) => { res.json(importCycles(tsProject(root()))); });
  app.post('/api/web/format', async (req, res) => {
    const b = z.object({ file, source: z.string().max(5_000_000) }).parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    res.json({ text: applyEdits(b.source, p.service.getFormattingEditsForDocument(abs, fmt())) });
  });
  app.post('/api/web/organize', async (req, res) => {
    const b = z.object({ file, source: z.string().max(5_000_000), mode: z.enum(['All', 'SortAndCombine', 'RemoveUnused']).default('All') }).parse(req.body);
    const p = await script(b.file);
    const abs = p.setText(b.file, b.source);
    const edits = p.service.organizeImports({ type: 'file', fileName: abs, mode: ts.OrganizeImportsMode[b.mode] }, fmt(), prefs);
    res.json({ changes: changesOf(p, edits) });
  });
}
