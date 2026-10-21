import { useSyncExternalStore } from 'react';

/**
 * VS Code–style settings (VSCODE-20.md): each feature declares its settings with an id like `editor.minimap.enabled`,
 * a category ("Text Editor ▸ Minimap"), a type and a default. Settings ▸ Text Editor / Workbench lists them, marks the
 * ones that differ from the default and resets them. Only changed values are stored.
 */
export type SettingOption = { value: string; label?: string; description?: string };
export type SettingDef = {
  key: string;
  /** "Text Editor ▸ Minimap", "Workbench ▸ Screencast Mode". */
  category: string;
  title: string;
  description: string;
  type: 'boolean' | 'number' | 'enum' | 'string' | 'numbers' | 'object';
  default: unknown;
  options?: SettingOption[];
  min?: number;
  max?: number;
  step?: number;
};

export const SETTINGS: SettingDef[] = [];
const KEY = 'tas:settings';
let values: Record<string, unknown> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>; } catch { return {}; } })();
const listeners = new Set<() => void>();
let version = 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Declares a setting; returns a getter for its current value. */
export function defineSetting<T>(def: Omit<SettingDef, 'default'> & { default: T }): () => T {
  if (!SETTINGS.some((s) => s.key === def.key)) SETTINGS.push(def);
  return () => setting<T>(def.key);
}
const defOf = (key: string) => SETTINGS.find((s) => s.key === key);
/** The value of a setting (its default when unchanged or invalid). */
export function setting<T>(key: string): T {
  const d = defOf(key);
  const v = values[key];
  return (v === undefined || (d && !valid(d, v)) ? d?.default : v) as T;
}
/** Whether `v` fits the setting's type, options and range. */
export function valid(d: SettingDef, v: unknown): boolean {
  switch (d.type) {
    case 'boolean': return typeof v === 'boolean';
    case 'number': return typeof v === 'number' && Number.isFinite(v) && (d.min === undefined || v >= d.min) && (d.max === undefined || v <= d.max);
    case 'enum': return typeof v === 'string' && !!d.options?.some((o) => o.value === v);
    case 'string': return typeof v === 'string';
    case 'numbers': return Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
    // Objects of strings (files.associations, files.exclude…): edited as JSON.
    case 'object': return !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string' || typeof x === 'boolean');
  }
}
function changed() {
  try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* storage blocked */ }
  version++;
  for (const l of listeners) l();
}
export function setSetting(key: string, v: unknown) {
  const d = defOf(key);
  if (d && same(v, d.default)) { const { [key]: _, ...rest } = values; void _; values = rest; } else values = { ...values, [key]: v };
  changed();
}
export function resetSetting(key: string) { setSetting(key, defOf(key)?.default); }
export const settingModified = (key: string) => values[key] !== undefined && !same(values[key], defOf(key)?.default);
export const onSettingsChanged = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useSettings = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
/** settings.json: the changed settings only, sorted by id. */
export const exportSettings = () => JSON.stringify(Object.fromEntries(Object.keys(values).filter(settingModified).sort().map((k) => [k, values[k]])), null, 2);
/** Applies a settings.json; unknown ids and invalid values are skipped. Returns how many were applied. */
export function importSettings(json: string) {
  const v = JSON.parse(json.replace(/^\s*\/\/.*$/gm, '')) as Record<string, unknown>;
  let n = 0;
  const next = { ...values };
  for (const [k, x] of Object.entries(v)) { const d = defOf(k); if (d && valid(d, x)) { next[k] = x; n++; } }
  values = next;
  changed();
  return n;
}
/** Parses a comma-separated list of columns ("80, 120") for array settings. */
export const parseNumbers = (text: string) => text.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
