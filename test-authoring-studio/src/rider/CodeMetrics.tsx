import { Fragment } from 'react';

export type MemberMetrics = { name: string; kind: string; line: number; mi: number; cc: number; coupling: number; loc: number };
export type TypeMetrics = MemberMetrics & { members: MemberMetrics[] };

/** Visual Studio's maintainability rating: green 20–100, yellow 10–19, red 0–9. */
const rating = (mi: number) => (mi >= 20 ? 'good' : mi >= 10 ? 'fair' : 'poor');

/** Code Metrics Results (Visual Studio): one row per type and member; a row opens its line. */
export default function CodeMetrics({ file, types, onOpen }: { file: string; types: TypeMetrics[]; onOpen: (line: number) => void }) {
  if (!types.length) return <p className="subtle">No types in {file}.</p>;
  const row = (m: MemberMetrics, type: boolean) => (
    <tr key={`${m.name}:${m.line}`} className={type ? 'metrics-type' : ''} tabIndex={0} onClick={() => onOpen(m.line)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m.line); }}>
      <th scope="row" style={{ paddingLeft: type ? 4 : 18 }}>{m.name}</th>
      <td><span className={`mi mi-${rating(m.mi)}`} aria-hidden="true" />{m.mi}</td>
      <td>{m.cc}</td>
      <td>{m.coupling}</td>
      <td>{m.loc}</td>
    </tr>
  );
  return (
    <table className="code-metrics" aria-label="Code metrics">
      <thead><tr><th>Hierarchy</th><th title="Maintainability Index (0–100, higher is better)">Maintainability</th><th title="Cyclomatic Complexity">Complexity</th><th title="Class Coupling">Coupling</th><th title="Lines of code">Lines</th></tr></thead>
      <tbody>{types.map((t) => <Fragment key={`${t.name}:${t.line}`}>{row(t, true)}{t.members.map((m) => row(m, false))}</Fragment>)}</tbody>
    </table>
  );
}
