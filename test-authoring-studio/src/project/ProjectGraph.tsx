import { useEffect, useState } from 'react';
import { api } from '../api';
import { graphLayers } from './projectText';

type Project = { file: string; name: string; references?: string[]; frameworks?: string[]; missing?: boolean };
const W = 180, H = 46, GX = 70, GY = 18;

/** Project Dependency Graph (Visual Studio's dependency diagram / Rider's project diagram): projects and their references. */
export default function ProjectGraph({ onOpen }: { onOpen: (file: string) => void }) {
  const [projects, setProjects] = useState<Project[]>();
  useEffect(() => { void api<{ projects?: Project[] }>('/solution').then((s) => setProjects((s.projects ?? []).filter((p) => /\.(cs|fs|vb)proj$/i.test(p.file) && !p.missing)), () => setProjects([])); }, []);
  if (!projects) return <p className="subtle">Loading…</p>;
  if (!projects.length) return <p className="subtle">The workspace has no projects.</p>;
  const { layers, edges } = graphLayers(projects);
  const pos = new Map<string, { x: number; y: number }>();
  layers.forEach((l, i) => l.forEach((f, j) => pos.set(f, { x: 10 + i * (W + GX), y: 10 + j * (H + GY) })));
  const width = 20 + layers.length * (W + GX) - GX, height = 20 + Math.max(...layers.map((l) => l.length)) * (H + GY) - GY;
  const byFile = new Map(projects.map((p) => [p.file, p]));
  return (
    <div className="project-graph">
      <p className="subtle">{projects.length} project{projects.length === 1 ? '' : 's'}, {edges.length} reference{edges.length === 1 ? '' : 's'}. Arrows point from a project to the ones it references; click one to open its project file.</p>
      <svg width={width} height={height} role="img" aria-label="Project dependency graph" viewBox={`0 0 ${width} ${height}`}>
        <defs><marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="pg-arrowhead" /></marker></defs>
        {edges.map((e) => { const a = pos.get(e.from)!, b = pos.get(e.to)!; return <path key={`${e.from}>${e.to}`} className="pg-edge" d={`M ${a.x} ${a.y + H / 2} C ${a.x - GX / 2} ${a.y + H / 2}, ${b.x + W + GX / 2} ${b.y + H / 2}, ${b.x + W} ${b.y + H / 2}`} markerEnd="url(#pg-arrow)" />; })}
        {[...pos].map(([f, p]) => { const pr = byFile.get(f)!; return (
          <g key={f} className="pg-node" transform={`translate(${p.x},${p.y})`} role="button" aria-label={`Project ${pr.name}`} tabIndex={0} onClick={() => onOpen(f)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(f); }}>
            <rect width={W} height={H} rx="6" />
            <text x="10" y="19" className="pg-name">{pr.name.length > 22 ? `${pr.name.slice(0, 21)}…` : pr.name}</text>
            <text x="10" y="36" className="pg-meta">{(pr.frameworks ?? []).join(', ') || f}</text>
          </g>
        ); })}
      </svg>
    </div>
  );
}
