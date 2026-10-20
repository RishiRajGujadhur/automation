import { useEffect } from 'react';
import { useBuild } from './build/store';
import { useTestRun } from './testing/store';
import { featureOn } from './features';
import { setBusyTitle } from './windowTitle';

/** "Building" / "Running tests" in the window title (and taskbar), so a long run is visible from another window. */
export default function BusyTitle() {
  const build = useBuild();
  const tests = useTestRun();
  const text = !featureOn('busy-title') ? '' : build.status === 'running' ? (build.action === 'clean' ? '⏳ Cleaning' : '⏳ Building') : tests.status === 'running' ? '▶ Running tests' : '';
  useEffect(() => { setBusyTitle(text); }, [text]);
  return null;
}
