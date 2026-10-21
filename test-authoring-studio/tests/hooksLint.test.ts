import { describe, it, expect } from 'vitest';
import { hookProblemsLoaded as hookProblems } from '../server/web/hooksLint';

describe('React Hooks checks (FRONTEND-100.md F46–F48)', () => {
  it('reports missing dependencies with a suggested array, in TSX', async () => {
    const src = 'import { useEffect, useState } from "react";\nexport function Clock({ step }: { step: number }) {\n  const [n, setN] = useState<number>(0);\n  useEffect(() => { setN(n + step); }, []);\n  return <b>{n}</b>;\n}\n';
    const p = await hookProblems('src/Clock.tsx', src);
    expect(p).toHaveLength(1);
    expect(p[0].rule).toBe('react-hooks/exhaustive-deps');
    expect(p[0].message).toMatch(/missing dependencies: 'n' and 'step'/);
    expect(p[0].fixes[0].text).toBe('[n, step]');
  });
  it('reports a hook called conditionally', async () => {
    const src = 'import { useState } from "react";\nexport function A({ on }) {\n  if (on) { const [x] = useState(1); }\n  return null;\n}\n';
    const p = await hookProblems('src/A.jsx', src);
    expect(p.map((x) => x.rule)).toEqual(['react-hooks/rules-of-hooks']);
    expect(p[0].message).toMatch(/called conditionally/);
  });
});
