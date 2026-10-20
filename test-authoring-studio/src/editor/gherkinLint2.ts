import { linter, type Diagnostic } from '@codemirror/lint';
import { featureOn } from '../features';

/** Gherkin warnings of the fourth batch (IDE-FEATURES-4.md): pure checks on the text, shown by one linter. */
type Problem = { line: number; message: string };
const CHECKS: { feature: string; run: (src: string) => Problem[] }[] = [];

/** Two scenarios with the same name (case-insensitive) in one file: reports and test filters cannot tell them apart. */
export function duplicateScenarioNames(src: string): Problem[] {
  const seen = new Map<string, number>();
  const out: Problem[] = [];
  src.split('\n').forEach((l, i) => {
    const m = /^\s*(Scenario|Scenario Outline|Scenario Template|Example):\s*(.*?)\s*$/.exec(l);
    if (!m || !m[2]) return;
    const key = m[2].toLowerCase();
    const first = seen.get(key);
    if (first) out.push({ line: i + 1, message: `Another scenario is also named "${m[2]}" (line ${first}).` });
    else seen.set(key, i + 1);
  });
  return out;
}
CHECKS.push({ feature: 'duplicate-scenario-names', run: duplicateScenarioNames });

export const gherkinLint2 = linter((view) => {
  const src = view.state.doc.toString();
  const out: Diagnostic[] = [];
  for (const c of CHECKS) {
    if (!featureOn(c.feature)) continue;
    for (const p of c.run(src)) {
      const line = view.state.doc.line(Math.min(p.line, view.state.doc.lines));
      const at = line.from + /^\s*/.exec(line.text)![0].length;
      out.push({ from: at, to: line.to, severity: 'warning', source: 'Gherkin', message: p.message });
    }
  }
  return out;
}, { delay: 400 });
