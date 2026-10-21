import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript5';

/**
 * TypeScript / JavaScript language service for the open folder (FRONTEND-100.md): the TypeScript 5 service (the
 * classic API; TypeScript 7 has none) over the repository's .ts / .tsx / .js / .jsx files, with the editors' unsaved
 * text laid over the files on disk. Refactorings, code fixes, completions, navigation and imports come from it.
 */
export const SCRIPT = /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i;
const SKIP = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', 'build', 'out', 'coverage', '.next', '.cache', '.local', 'test-results']);

export class TsProject {
  private overlay = new Map<string, { text: string; version: number }>();
  private files: string[] = [];
  private listedAt = 0;
  private options: ts.CompilerOptions;
  readonly service: ts.LanguageService;
  constructor(readonly root: string) {
    this.root = root.replace(/\\/g, '/');
    this.options = this.readOptions();
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => this.options,
      getScriptFileNames: () => this.list(),
      getScriptVersion: (f) => { const o = this.overlay.get(f); if (o) return `o${o.version}`; try { return String(statSync(f).mtimeMs); } catch { return '0'; } },
      getScriptSnapshot: (f) => { const o = this.overlay.get(f); if (o) return ts.ScriptSnapshot.fromString(o.text); try { return ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8')); } catch { return undefined; } },
      getCurrentDirectory: () => this.root,
      getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
      fileExists: (f) => this.overlay.has(f) || ts.sys.fileExists(f),
      readFile: (f) => this.overlay.get(f)?.text ?? ts.sys.readFile(f),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    };
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
  }
  /** The repository's tsconfig.json / jsconfig.json, else settings for a modern React + TypeScript project. */
  private readOptions(): ts.CompilerOptions {
    const defaults: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, allowJs: true, checkJs: false, strict: true, esModuleInterop: true, skipLibCheck: true, resolveJsonModule: true, allowImportingTsExtensions: true, noEmit: true, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'] };
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const file = path.join(this.root, name);
      if (!existsSync(file)) continue;
      const read = ts.readConfigFile(file, ts.sys.readFile);
      if (read.error) continue;
      const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, this.root);
      return { ...defaults, ...parsed.options, allowJs: parsed.options.allowJs ?? true, noEmit: true };
    }
    return defaults;
  }
  /** Script files of the repository (re-listed at most every 3 s), plus any open file with unsaved text. */
  private list() {
    if (Date.now() - this.listedAt > 3000) {
      const out: string[] = [];
      const walk = (dir: string, depth: number) => {
        if (depth > 12 || out.length > 5000) return;
        let entries: import('node:fs').Dirent[];
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(`${dir}/${e.name}`, depth + 1); }
          else if (SCRIPT.test(e.name)) out.push(`${dir}/${e.name}`);
        }
      };
      walk(this.root, 0);
      this.files = out;
      this.listedAt = Date.now();
    }
    return [...new Set([...this.files, ...this.overlay.keys()])];
  }
  abs(rel: string) { return path.resolve(this.root, rel).replace(/\\/g, '/'); }
  rel(abs: string) { return path.relative(this.root, abs).replace(/\\/g, '/'); }
  /** The editor's text for a file (its unsaved state); undefined goes back to the file on disk. */
  setText(rel: string, text?: string) {
    const f = this.abs(rel);
    if (text === undefined) { this.overlay.delete(f); return f; }
    const o = this.overlay.get(f);
    if (o?.text !== text) this.overlay.set(f, { text, version: (o?.version ?? 0) + 1 });
    if (!this.files.includes(f)) this.listedAt = 0;
    return f;
  }
  text(abs: string) { return this.overlay.get(abs)?.text ?? (existsSync(abs) ? readFileSync(abs, 'utf8') : ''); }
  sourceFile(abs: string) { return this.service.getProgram()?.getSourceFile(abs); }
}

const projects = new Map<string, TsProject>();
/** The project of a repository root (one per folder, kept while the studio runs). */
export function tsProject(root: string) {
  let p = projects.get(root);
  if (!p) { p = new TsProject(root); projects.set(root, p); }
  return p;
}
/** Applies text changes to a string (TypeScript's edits, in any order). */
export function applyEdits(text: string, edits: readonly ts.TextChange[]) {
  return [...edits].sort((a, b) => b.span.start - a.span.start).reduce((t, e) => t.slice(0, e.span.start) + e.newText + t.slice(e.span.start + e.span.length), text);
}
export { ts };
