import { useEffect, type RefObject } from 'react';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { api } from '../api';
import { setBase } from './changeGutter';
import { GIT_CHANGED_EVENT } from './events';
import { isBrowser } from '../files/provider';

/** Loads the file's committed text for the change bars, and again after commits, discards and window focus. */
export function useChangeBars(ref: RefObject<ReactCodeMirrorRef | null>, file: string | undefined, ready: boolean) {
  useEffect(() => {
    if (!file || !ready || isBrowser()) return;
    let live = true;
    const load = () => api<{ repo: boolean; text: string | null }>(`/git/head?file=${encodeURIComponent(file)}`).then((r) => {
      let tries = 0;
      const apply = () => { const v = ref.current?.view; if (!live) return; if (v) v.dispatch({ effects: setBase.of(r.repo ? r.text : undefined) }); else if (tries++ < 30) requestAnimationFrame(apply); };
      apply();
    }, () => {});
    void load();
    window.addEventListener(GIT_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    return () => { live = false; window.removeEventListener(GIT_CHANGED_EVENT, load); window.removeEventListener('focus', load); };
  }, [file, ready, ref]);
}
