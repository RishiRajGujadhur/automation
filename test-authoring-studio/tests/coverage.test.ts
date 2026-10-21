import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { parseCobertura } from '../server/testRunner';

describe('parseCobertura', () => {
  it('collects covered / uncovered lines per repository file from class lines (not method duplicates)', () => {
    const root = path.resolve('/repo');
    const xml = `<coverage><sources><source>${root}</source></sources><packages><package><classes>
      <class name="A" filename="Steps${path.sep}A.cs"><methods><method><lines><line number="3" hits="1"/></lines></method></methods>
        <lines><line number="3" hits="1"/><line number="4" hits="0"/></lines></class>
      <class name="B" filename="${path.join(path.resolve('/elsewhere'), 'B.cs')}"><lines><line number="1" hits="1"/></lines></class>
    </classes></package></packages></coverage>`;
    const c = parseCobertura(xml, root);
    expect(c.files).toEqual({ 'Steps/A.cs': { covered: [3], uncovered: [4] } });
    expect(c.lineRate).toBe(0.5);
  });
});

describe('parseCobertura branches (RIDER-VSCODE-FEATURES.md 142)', () => {
  it('partly covered lines and the branch rate', () => {
    const root = 'C:/repo';
    const xml = '<coverage><sources><source>C:/repo</source></sources><packages><package><classes><class name="A" filename="A.cs"><lines><line number="3" hits="1" branch="True" condition-coverage="50% (1/2)" /><line number="4" hits="1" branch="False" /><line number="5" hits="2" branch="True" condition-coverage="100% (2/2)" /></lines></class></classes></package></packages></coverage>';
    const c = parseCobertura(xml, root);
    expect(c.files['A.cs'].partial).toEqual([{ line: 3, covered: 1, total: 2 }, { line: 5, covered: 2, total: 2 }]);
    expect(c.branchRate).toBe(0.75);
  });
});
