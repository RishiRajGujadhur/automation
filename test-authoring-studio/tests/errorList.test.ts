import { describe, expect, it } from 'vitest';
import { errorRows, errorText, errorHelpUrl, sortErrors, nextSort } from '../src/build/errorList';
import type { BuildDiagnostic } from '../src/build/store';

const ds: BuildDiagnostic[] = [
  { severity: 'error', code: 'CS1002', message: '; expected', file: 'src/App/Program.cs', line: 9, project: 'App' },
  { severity: 'warning', code: 'CS0168', message: 'unused x', file: 'src/App/Util.cs', line: 3, project: 'App' },
  { severity: 'error', code: 'NU1101', message: 'package missing', project: 'Tests' },
];
const base = { errors: true, warnings: true, query: '', scope: 'solution' as const, open: [] as string[] };

describe('Error List (X65…)', () => {
  it('X65 scope: Entire Solution, Open Documents, Current Document', () => {
    expect(errorRows(ds, base)).toHaveLength(3);
    expect(errorRows(ds, { ...base, scope: 'open', open: ['src/App/Util.cs', 'README.md'] }).map((d) => d.code)).toEqual(['CS0168']);
    expect(errorRows(ds, { ...base, scope: 'current', current: 'src/App/Program.cs' }).map((d) => d.code)).toEqual(['CS1002']);
    expect(errorRows(ds, { ...base, scope: 'current' })).toEqual([]);
    expect(errorRows(ds, { ...base, warnings: false, query: 'app' }).map((d) => d.code)).toEqual(['CS1002']);
  });
  it('X66 copy and error help', () => {
    expect(errorText(ds[0])).toBe('Error\tCS1002\t; expected\tApp\tsrc/App/Program.cs\t9');
    expect(errorHelpUrl('CS1002')).toBe('https://learn.microsoft.com/en-us/dotnet/csharp/misc/cs1002');
    expect(errorHelpUrl('NU1101')).toBe('https://learn.microsoft.com/en-us/search/?terms=NU1101');
  });
  it('X67 sort by column: ascending, descending, build order', () => {
    expect(sortErrors(ds, { key: 'code', desc: false }).map((d) => d.code)).toEqual(['CS0168', 'CS1002', 'NU1101']);
    expect(sortErrors(ds, { key: 'line', desc: true }).map((d) => d.line ?? 0)).toEqual([9, 3, 0]);
    expect(nextSort(null, 'code')).toEqual({ key: 'code', desc: false });
    expect(nextSort({ key: 'code', desc: false }, 'code')).toEqual({ key: 'code', desc: true });
    expect(nextSort({ key: 'code', desc: true }, 'code')).toBeNull();
    expect(nextSort({ key: 'code', desc: true }, 'file')).toEqual({ key: 'file', desc: false });
  });
});
