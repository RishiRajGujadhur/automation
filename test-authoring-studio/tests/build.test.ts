import { describe, it, expect } from 'vitest';
import { parseDiagnostics } from '../server/build';

describe('build output → Error List', () => {
  const root = 'C:\\repo';
  const output = [
    'C:\\repo\\tests\\Specs\\Steps\\CartSteps.cs(12,5): error CS0103: The name \'x\' does not exist in the current context [C:\\repo\\tests\\Specs\\Specs.csproj]',
    'C:\\repo\\src\\Pages\\CartPage.cs(3,10,3,14): warning CS0168: The variable \'e\' is declared but never used [C:\\repo\\src\\Pages\\Pages.csproj]',
    // MSBuild repeats diagnostics at the end of the build.
    'C:\\repo\\tests\\Specs\\Steps\\CartSteps.cs(12,5): error CS0103: The name \'x\' does not exist in the current context [C:\\repo\\tests\\Specs\\Specs.csproj]',
    'MSBUILD : error MSB1009: Project file does not exist.',
    '    0 Warning(s)',
    'Build succeeded.',
  ].join('\n');
  it('parses located and general diagnostics, repo-relative, without duplicates', () => {
    const d = parseDiagnostics(output, root);
    expect(d).toHaveLength(3);
    expect(d[0]).toMatchObject({ severity: 'error', code: 'CS0103', file: 'tests/Specs/Steps/CartSteps.cs', line: 12, column: 5, project: 'Specs' });
    expect(d[1]).toMatchObject({ severity: 'warning', code: 'CS0168', file: 'src/Pages/CartPage.cs', line: 3, column: 10, project: 'Pages' });
    expect(d[2]).toMatchObject({ severity: 'error', code: 'MSB1009', message: 'Project file does not exist.' });
    expect(d[2].file).toBeUndefined();
  });
});
