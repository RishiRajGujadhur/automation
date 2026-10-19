import { useEffect, useMemo, useState } from 'react';
import { Play, History, Hammer, TestTubeDiagonal, GitBranch } from 'lucide-react';
import { api } from '../api';

const RECENT = 'tas:rider:runAnything';
export const recentRuns = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]') as string[]; } catch { return []; } };
export function rememberRun(cmd: string) {
  try { localStorage.setItem(RECENT, JSON.stringify([cmd, ...recentRuns().filter((c) => c !== cmd)].slice(0, 20))); } catch { /* storage blocked */ }
}

type Suggestion = { command: string; detail: string; kind: 'recent' | 'build' | 'test' | 'git' | 'run' };
const ICONS = { recent: History, build: Hammer, test: TestTubeDiagonal, git: GitBranch, run: Play };

/**
 * Run Anything (Rider: press Ctrl twice): type a command line and press Enter to run it in the Terminal. Suggests
 * recent commands and build / test / Git commands for the solution's projects.
 */
export default function RunAnything({ onRun }: { onRun: (command: string) => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [projects, setProjects] = useState<string[]>([]);
  useEffect(() => { api<{ projects: { file: string }[]; solutionFile: string | null }>('/solution').then((s) => setProjects([...(s.solutionFile ? [s.solutionFile] : []), ...s.projects.map((p) => p.file)]), () => {}); }, []);
  const all = useMemo<Suggestion[]>(() => [
    ...recentRuns().map((c) => ({ command: c, detail: 'Recent', kind: 'recent' as const })),
    ...projects.flatMap((p) => [
      { command: `dotnet build "${p}"`, detail: 'Build', kind: 'build' as const },
      { command: `dotnet test "${p}"`, detail: 'Run tests', kind: 'test' as const },
      { command: `dotnet restore "${p}"`, detail: 'Restore packages', kind: 'build' as const },
    ]),
    { command: 'git status', detail: 'Git', kind: 'git' },
    { command: 'git log --oneline -20', detail: 'Git', kind: 'git' },
    { command: 'git pull', detail: 'Git', kind: 'git' },
    { command: 'dotnet --info', detail: '.NET', kind: 'run' },
  ], [projects]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((s, i) => (!q || s.command.toLowerCase().includes(q)) && all.findIndex((x) => x.command === s.command) === i);
    // What you typed is always runnable, first.
    return q && !list.some((s) => s.command.toLowerCase() === q) ? [{ command: query.trim(), detail: 'Run in the Terminal', kind: 'run' as const }, ...list] : list;
  }, [all, query]);
  const run = (cmd: string) => { if (!cmd.trim()) return; rememberRun(cmd); onRun(cmd); };
  return (
    <div className="goto-all">
      <input
        autoFocus
        aria-label="Command to run"
        placeholder="Run anything: a command, dotnet test, git…"
        value={query}
        spellCheck={false}
        onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(shown.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); run(shown[index]?.command ?? query); }
        }}
      />
      <ul className="goto-results" role="listbox" aria-label="Run Anything">
        {shown.map((s, i) => {
          const Icon = ICONS[s.kind];
          return (
            <li key={`${s.kind}:${s.command}`} role="option" aria-selected={i === index} className={i === index ? 'active' : ''} onMouseMove={() => { if (index !== i) setIndex(i); }} onMouseDown={(e) => { e.preventDefault(); run(s.command); }}>
              <Icon size={14} aria-hidden="true" />
              <span className="goto-label"><code>{s.command}</code></span>
              <small>{s.detail}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
