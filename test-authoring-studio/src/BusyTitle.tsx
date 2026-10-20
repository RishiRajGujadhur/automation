import { useEffect, useRef } from 'react';
import { useBuild } from './build/store';
import { useTestRun } from './testing/store';
import { featureOn } from './features';
import { useDebug } from './debug/store';
import { setBusyTitle } from './windowTitle';

/** "Building" / "Running tests" in the window title (and taskbar), so a long run is visible from another window. */
export default function BusyTitle() {
  const build = useBuild();
  const tests = useTestRun();
  // Visual Studio's "(Debugging)" title while a debug session runs (QOL-50).
  const debug = useDebug().state;
  const debugging = featureOn('debug-title') ? (debug.status === 'paused' ? '⏸ Debugging (paused)' : ['building', 'starting', 'running'].includes(debug.status) ? '🐞 Debugging' : '') : '';
  const text = !featureOn('busy-title') ? debugging : build.status === 'running' ? (build.action === 'clean' ? '⏳ Cleaning' : '⏳ Building') : tests.status === 'running' ? '▶ Running tests' : debugging;
  useEffect(() => { setBusyTitle(text); }, [text]);
  // A finished build says how it went (QOL-50): duration, errors and warnings.
  const was = useRef(build.status);
  useEffect(() => {
    const before = was.current;
    was.current = build.status;
    if (before !== 'running' || build.status === 'running' || build.status === 'idle' || !featureOn('build-summary')) return;
    const errors = build.diagnostics.filter((d) => d.severity === 'error').length, warnings = build.diagnostics.length - errors;
    const what = build.action === 'clean' ? 'Clean' : build.action === 'rebuild' ? 'Rebuild' : 'Build';
    const time = build.durationMs !== undefined ? ` in ${(build.durationMs / 1000).toFixed(1)} s` : '';
    const text = build.status === 'cancelled' ? `${what} cancelled.` : `${what} ${build.status === 'succeeded' ? 'succeeded' : 'failed'}${time}: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`;
    window.dispatchEvent(new CustomEvent('tas:notice', { detail: text }));
  }, [build.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
