import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { SourceMapConsumer } from 'source-map-js';
import { ts, type TsProject } from './tsService.js';

/**
 * F24 Navigate TypeScript declaration files: the text of a declaration file outside the repository's own sources
 * (node_modules typings, TypeScript's lib.*.d.ts), read-only. Only those two places may be read.
 */
export function declarationSource(project: TsProject, file: string) {
  const f = path.resolve(file).replace(/\\/g, '/');
  const lib = path.dirname(ts.getDefaultLibFilePath({})).replace(/\\/g, '/');
  const allowed = (f.startsWith(`${project.root}/`) && f.includes('/node_modules/')) || f.startsWith(`${lib}/`);
  if (!allowed || !/\.d\.[cm]?ts$/i.test(f)) throw new Error('Only declaration files of node_modules or TypeScript can be shown.');
  return { name: f.startsWith(`${lib}/`) ? path.basename(f) : f.slice(f.lastIndexOf('/node_modules/') + 14), text: readFileSync(f, 'utf8') };
}

/**
 * F25 Navigate source maps: from a generated file to the original source position, or from a source file to the
 * generated code. The map comes from the file's `//# sourceMappingURL=` (a file or an inline data: URL) or a
 * `.map` file beside it; source paths resolve against the map's folder and its sourceRoot.
 */
function mapOf(abs: string): { consumer: SourceMapConsumer; dir: string } | undefined {
  const text = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  const url = /\/[/*][#@]\s*sourceMappingURL=([^\s*]+)/.exec(text)?.[1];
  let raw: string | undefined;
  let dir = path.dirname(abs);
  if (url?.startsWith('data:')) raw = Buffer.from(url.slice(url.indexOf(',') + 1), /;base64/.test(url) ? 'base64' : 'utf8').toString('utf8');
  else {
    const mapFile = url ? path.resolve(dir, decodeURIComponent(url)) : `${abs}.map`;
    if (existsSync(mapFile)) { raw = readFileSync(mapFile, 'utf8'); dir = path.dirname(mapFile); }
  }
  if (!raw) return undefined;
  return { consumer: new SourceMapConsumer(JSON.parse(raw)), dir };
}
const sourcePath = (consumer: SourceMapConsumer, dir: string, source: string) => {
  const root = (consumer as unknown as { sourceRoot?: string }).sourceRoot ?? '';
  return path.resolve(dir, root, source.replace(/^webpack:\/\/[^/]*\//, '').replace(/^file:\/\//, '')).replace(/\\/g, '/');
};

export function toOriginal(project: TsProject, file: string, line: number, column: number) {
  const m = mapOf(project.abs(file));
  if (!m) return undefined;
  const p = m.consumer.originalPositionFor({ line, column: column - 1, bias: SourceMapConsumer.GREATEST_LOWER_BOUND });
  if (!p.source || p.line == null) return undefined;
  return { file: project.rel(sourcePath(m.consumer, m.dir, p.source)), line: p.line, column: (p.column ?? 0) + 1 };
}

/** The generated files of the repository whose maps list `file` as a source (looked up beside .map files). */
export function toGenerated(project: TsProject, file: string, line: number, column: number) {
  const target = project.abs(file);
  const maps: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 10 || maps.length > 200) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walk(`${dir}/${e.name}`, depth + 1); }
      else if (e.name.endsWith('.js.map') || e.name.endsWith('.css.map') || e.name.endsWith('.mjs.map')) maps.push(`${dir}/${e.name}`);
    }
  };
  walk(project.root, 0);
  for (const mapFile of maps) {
    const generated = mapFile.slice(0, -4);
    if (!existsSync(generated)) continue;
    const m = mapOf(generated);
    if (!m) continue;
    const source = m.consumer.sources.find((s) => sourcePath(m.consumer, m.dir, s) === target);
    if (!source) continue;
    const g = m.consumer.generatedPositionFor({ source, line, column: column - 1, bias: SourceMapConsumer.LEAST_UPPER_BOUND });
    if (g.line == null) continue;
    return { file: project.rel(generated), line: g.line, column: (g.column ?? 0) + 1 };
  }
  return undefined;
}
