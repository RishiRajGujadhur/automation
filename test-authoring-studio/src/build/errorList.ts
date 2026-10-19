import type { BuildDiagnostic } from './store';

/** Error List rows (Visual Studio): severity filters, search, scope (Entire Solution / Open Documents / Current Document). */
export type ErrorScope = 'solution' | 'open' | 'current';
export type ErrorListOptions = { errors: boolean; warnings: boolean; query: string; scope: ErrorScope; open: string[]; current?: string };
const same = (a: string, b: string) => { const x = a.replace(/\\/g, '/').toLowerCase(), y = b.replace(/\\/g, '/').toLowerCase(); return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`); };
export function errorRows(ds: BuildDiagnostic[], o: ErrorListOptions) {
  const q = o.query.toLowerCase();
  return ds.filter((d) =>
    (d.severity === 'error' ? o.errors : o.warnings) &&
    (o.scope === 'solution' || (!!d.file && (o.scope === 'current' ? !!o.current && same(d.file, o.current) : o.open.some((f) => same(d.file!, f))))) &&
    (!q || `${d.code} ${d.message} ${d.file ?? ''} ${d.project ?? ''}`.toLowerCase().includes(q)));
}

/** Copy (Visual Studio's Error List Ctrl+C): severity, code, description, project, file, line, tab-separated. */
export const errorText = (d: BuildDiagnostic) => [d.severity === 'error' ? 'Error' : 'Warning', d.code, d.message, d.project ?? '', d.file ?? '', d.line ?? ''].join('\t');
/** Show Error Help (F1): the compiler error's page on Microsoft Learn; other codes are searched. */
export const errorHelpUrl = (code: string) => (/^CS\d{4}$/i.test(code) ? `https://learn.microsoft.com/en-us/dotnet/csharp/misc/${code.toLowerCase()}` : `https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(code)}`);

/** Sorting by a column header (Visual Studio): again on the same column reverses; a third time restores the build order. */
export type ErrorSort = { key: 'code' | 'message' | 'project' | 'file' | 'line'; desc: boolean } | null;
export function sortErrors(ds: BuildDiagnostic[], sort: ErrorSort) {
  if (!sort) return ds;
  const value = (d: BuildDiagnostic) => (sort.key === 'line' ? d.line ?? 0 : sort.key === 'file' ? d.file?.split('/').pop() ?? '' : d[sort.key] ?? '');
  const c = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...ds].sort((a, b) => { const x = value(a), y = value(b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : c.compare(String(x), String(y)); return sort.desc ? -r : r; });
}
export const nextSort = (sort: ErrorSort, key: NonNullable<ErrorSort>['key']): ErrorSort => (sort?.key !== key ? { key, desc: false } : !sort.desc ? { key, desc: true } : null);
