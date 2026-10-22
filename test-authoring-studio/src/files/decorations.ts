import { useEffect, useSyncExternalStore } from 'react';
import { forEachDiagnostic } from '@codemirror/lint';
import { api } from '../api';
import { allEditors } from '../editor/activeEditor';
import { GIT_CHANGED_EVENT } from '../editor/events';
import { isBrowser } from './provider';
import { defineSetting } from '../vscode/settings';

/**
 * File decorations (VSCODE-250.md W66 / W67, W92): each open file's errors and warnings (its squiggles) and its Git
 * status letter, for tab names, badges and the Explorer.
 */
const C = 'Workbench ▸ Editor Management';
export const decorationColors = defineSetting<boolean>({ key: 'workbench.editor.decorations.colors', category: C, title: 'Decorations: Colors', type: 'boolean', default: true, description: 'Controls whether editor file decorations should use colors (errors red, warnings yellow, Git changes).' });
export const decorationBadges = defineSetting<boolean>({ key: 'workbench.editor.decorations.badges', category: C, title: 'Decorations: Badges', type: 'boolean', default: true, description: 'Controls whether editor file decorations should use badges (problem counts, Git letters).' });

export type FileDecoration = { errors: number; warnings: number; git?: string };
let problems = new Map<string, { errors: number; warnings: number }>();
let git = new Map<string, string>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };
const same = (a: Map<string, unknown>, b: Map<string, unknown>) => a.size === b.size && [...a].every(([k, v]) => JSON.stringify(b.get(k)) === JSON.stringify(v));

function readProblems() {
  const next = new Map<string, { errors: number; warnings: number }>();
  for (const { view, file } of allEditors()) {
    if (next.has(file)) continue;
    let errors = 0, warnings = 0;
    forEachDiagnostic(view.state, (d) => { if (d.severity === 'error') errors++; else if (d.severity === 'warning') warnings++; });
    if (errors || warnings) next.set(file, { errors, warnings });
  }
  if (!same(next, problems)) { problems = next; emit(); }
}
async function readGit() {
  if (isBrowser()) return;
  try {
    const s = await api<{ files: { file: string; status: string }[] }>('/git/status');
    const next = new Map<string, string>();
    // Unstaged letters win over staged ones, as in VS Code's Explorer.
    for (const f of s.files) next.set(f.file, f.status === '?' ? 'U' : f.status);
    if (!same(next, git)) { git = next; emit(); }
  } catch { /* not a repository */ }
}
let users = 0;
let stop: (() => void) | undefined;
function start() {
  readProblems(); void readGit();
  const p = setInterval(readProblems, 1000);
  const g = setInterval(() => { if (document.visibilityState === 'visible') void readGit(); }, 5000);
  const h = () => void readGit();
  window.addEventListener(GIT_CHANGED_EVENT, h);
  stop = () => { clearInterval(p); clearInterval(g); window.removeEventListener(GIT_CHANGED_EVENT, h); };
}
/** Subscribes the caller to file decorations (a 1 s problem poll and a 5 s Git poll while anyone listens). */
export function useFileDecorations() {
  useEffect(() => { if (users++ === 0) start(); return () => { if (--users === 0) { stop?.(); stop = undefined; } }; }, []);
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
  return (file: string): FileDecoration => ({ ...(problems.get(file) ?? { errors: 0, warnings: 0 }), git: git.get(file) });
}
/** Files that have problems now. */
export const decoratedFiles = () => [...problems.keys()];
/** VS Code's colour class for a decoration: errors, then warnings, then the Git status. */
export const decorationClass = (d: FileDecoration) => (d.errors ? 'deco-error' : d.warnings ? 'deco-warning' : d.git === 'U' ? 'deco-untracked' : d.git === 'A' ? 'deco-added' : d.git === 'D' ? 'deco-deleted' : d.git ? 'deco-modified' : '');
