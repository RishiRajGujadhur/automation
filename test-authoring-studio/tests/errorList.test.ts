import { describe, expect, it } from 'vitest';
import { errorRows } from '../src/build/errorList';
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
});
