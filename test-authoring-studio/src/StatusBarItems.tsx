import { useEffect, useState } from 'react';
import { GitBranch, CircleX, TriangleAlert, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from './api';
import { useBuild } from './build/store';
import { useCursor } from './editor/cursor';
import { GIT_CHANGED_EVENT } from './editor/events';

/**
 * Right side of the status bar, like Visual Studio's: Git branch (with ↑/↓), errors and warnings of the last build,
 * and for the active editor the cursor position, line endings and encoding.
 */
export default function StatusBarItems({ repository, onGit, onErrors }: { repository?: string; onGit: () => void; onErrors: () => void }) {
  const build = useBuild();
  const cursor = useCursor();
  const [git, setGit] = useState<{ repo: boolean; branch?: string; ahead: number; behind: number; changes: number }>();
  useEffect(() => {
    let live = true;
    const load = () => api<{ repo: boolean; branch?: string; ahead: number; behind: number; files: unknown[] }>('/git/status').then((s) => live && setGit({ repo: s.repo, branch: s.branch, ahead: s.ahead, behind: s.behind, changes: s.files.length }), () => {});
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    window.addEventListener(GIT_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    return () => { live = false; clearInterval(t); window.removeEventListener(GIT_CHANGED_EVENT, load); window.removeEventListener('focus', load); };
  }, [repository]);
  const errors = build.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = build.diagnostics.length - errors;
  return (
    <span className="status-items">
      {cursor && (
        <>
          <span className="status-item" aria-label="Cursor position" title={cursor.file}>Ln {cursor.line}, Col {cursor.column}{cursor.selected ? ` (${cursor.selected} selected)` : ''}</span>
          <span className="status-item" title="Line endings">{cursor.eol}</span>
          <span className="status-item" title="Encoding">UTF-8</span>
        </>
      )}
      {build.status !== 'idle' && (
        <button className="status-item" aria-label={`${errors} errors, ${warnings} warnings: open the Error List`} title="Error List" onClick={onErrors}>
          <CircleX size={12} />{errors} <TriangleAlert size={12} />{warnings}
        </button>
      )}
      {git?.repo && git.branch && (
        <button className="status-item" aria-label={`Branch ${git.branch}: open Git Changes`} title={`${git.changes} pending change${git.changes === 1 ? '' : 's'} — Git Changes`} onClick={onGit}>
          <GitBranch size={12} />{git.branch}{git.changes ? '*' : ''}
          {git.ahead > 0 && <><ArrowUp size={11} />{git.ahead}</>}
          {git.behind > 0 && <><ArrowDown size={11} />{git.behind}</>}
        </button>
      )}
    </span>
  );
}
