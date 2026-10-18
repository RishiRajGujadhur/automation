/**
 * Power Save Mode (Rider's File ▸ Power Save Mode): background analysis pauses — C# diagnostics as you type, CodeLens
 * reference counts and inlay hints. Explicit commands (Find References, Problems, builds) still work.
 */
const KEY = 'tas:rider:powerSave';
let on = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const mark = () => { if (typeof document !== 'undefined') { if (on) document.documentElement.dataset.powerSave = 'true'; else delete document.documentElement.dataset.powerSave; } };
mark();
export const powerSave = () => on;
export function setPowerSave(next: boolean) {
  on = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
  mark();
}
