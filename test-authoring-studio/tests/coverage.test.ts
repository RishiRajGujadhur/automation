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
