import { featureOn } from '../features';
import { unsavedFiles } from './autosave';
import { SAVE_ALL_EVENT } from './events';

/**
 * Save before build / test runs (Visual Studio's "Save all changes before build"): unsaved editors are written first;
 * waits until they are (at most 3 s).
 */
export async function saveBeforeRun() {
  if (!featureOn('save-before-run') || !unsavedFiles().length || typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SAVE_ALL_EVENT));
  const until = Date.now() + 3000;
  while (unsavedFiles().length && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
}
