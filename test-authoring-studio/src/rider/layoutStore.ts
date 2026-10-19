/**
 * Window layouts (Visual Studio's Window ▸ Save Window Layout / Apply Window Layout / Reset Window Layout): the
 * panel, side bar and tool window state of this browser, saved under a name.
 */
const LAYOUT_KEYS = ['tas:dockSide', 'tas:dockTab', 'tas:riderTools', 'tas:sidebarWidth', 'tas:sidebarView', 'tas:splitFile', 'tas:todoOpen', 'tas:outputOpen', 'tas:outputSource', 'tas:structureSorted', 'tas:mdMode'];
const STORE = 'tas:windowLayouts';
export type WindowLayout = { name: string; saved: number; values: Record<string, string | null>; sidebar?: boolean };
export function windowLayouts(): WindowLayout[] { try { return JSON.parse(localStorage.getItem(STORE) ?? '[]') as WindowLayout[]; } catch { return []; } }
const prefs = () => { try { return JSON.parse(localStorage.getItem('tas:prefs') ?? '{}') as Record<string, unknown>; } catch { return {}; } };
export function saveWindowLayout(name: string) {
  const values = Object.fromEntries(LAYOUT_KEYS.map((k) => [k, localStorage.getItem(k)]));
  const list = [{ name, saved: Date.now(), values, sidebar: prefs().sidebar !== false }, ...windowLayouts().filter((l) => l.name !== name)].slice(0, 10);
  localStorage.setItem(STORE, JSON.stringify(list));
}
const applyValues = (values: Record<string, string | null>, sidebar: boolean) => {
  for (const k of LAYOUT_KEYS) { const v = values[k]; if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  localStorage.setItem('tas:prefs', JSON.stringify({ ...prefs(), sidebar }));
  location.reload();
};
export function applyWindowLayout(name: string) { const l = windowLayouts().find((x) => x.name === name); if (l) applyValues(l.values, l.sidebar !== false); }
export function deleteWindowLayout(name: string) { localStorage.setItem(STORE, JSON.stringify(windowLayouts().filter((l) => l.name !== name))); }
/** Reset Window Layout: the default panel, side bar and tool windows. */
export const resetWindowLayout = () => applyValues({}, true);
