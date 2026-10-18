import { useSyncExternalStore } from 'react';
import { commandOn, featureOfCommand, onFeaturesChanged } from '../features';
export { commandOn };

/**
 * JetBrains Rider features: one registry of commands shown in the web menu bar, the native desktop menus (which send
 * `rider` with the id), the command palette and the Productivity Guide. Commands register from RiderHost.
 */
export type RiderMenu = 'Edit' | 'View' | 'Code' | 'Navigate' | 'Tools' | 'Help';
export type RiderCommand = {
  id: string;
  label: string;
  menu: RiderMenu;
  /** Shown in menus and taught by the Key Promoter, e.g. "Ctrl Shift U". */
  shortcut?: string;
  /** Starts a new group (separator) in its menu. */
  group?: boolean;
  /** For checkable commands (soft wraps, distraction-free mode…). */
  checked?: () => boolean;
  run: () => void;
};
export type Via = 'menu' | 'key' | 'palette';

let commands: RiderCommand[] = [];
let version = 0;
const listeners = new Set<() => void>();
const changed = () => { version++; for (const l of listeners) l(); };
export const useRiderCommands = () => { useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version); return commands; };
export const riderCommands = () => commands;
/** Re-renders menus that show checked state. */
export const riderChanged = changed;
// Menus and the palette follow Settings ▸ Features.
onFeaturesChanged(changed);

/** Registers (or replaces, by id) commands; returns a function that removes them. */
export function registerRider(list: RiderCommand[]) {
  const ids = new Set(list.map((c) => c.id));
  commands = [...commands.filter((c) => !ids.has(c.id)), ...list];
  changed();
  return () => { commands = commands.filter((c) => !ids.has(c.id) || !list.includes(c)); changed(); };
}

// Productivity Guide: how often each feature was used, and how often with its shortcut.
export type Usage = Record<string, { count: number; keys: number; last: number }>;
const USAGE = 'tas:rider:usage';
export function readUsage(): Usage { try { return JSON.parse(localStorage.getItem(USAGE) ?? '{}') as Usage; } catch { return {}; } }
export function noteUsage(id: string, via: Via) {
  const u = readUsage();
  const e = u[id] ?? { count: 0, keys: 0, last: 0 };
  u[id] = { count: e.count + 1, keys: e.keys + (via === 'key' ? 1 : 0), last: Date.now() };
  try { localStorage.setItem(USAGE, JSON.stringify(u)); } catch { /* storage blocked */ }
}

/** Key Promoter: a command with a shortcut used from a menu or the palette shows its key. */
export const PROMOTE_EVENT = 'tas:key-promoter';
export type Promotion = { label: string; shortcut: string; times: number };

export function runRider(id: string, via: Via = 'menu') {
  const c = commands.find((x) => x.id === id);
  if (!c) return false;
  if (!commandOn(id)) {
    // A key of a turned-off feature does nothing; a menu or palette entry is hidden anyway.
    if (via !== 'key') window.dispatchEvent(new CustomEvent('tas:notice', { detail: `${featureOfCommand(id)?.label ?? c.label} is turned off in Settings ▸ Features.` }));
    return false;
  }
  noteUsage(id, via);
  if (via !== 'key' && c.shortcut) {
    const u = readUsage()[id];
    window.dispatchEvent(new CustomEvent<Promotion>(PROMOTE_EVENT, { detail: { label: c.label, shortcut: c.shortcut, times: (u?.count ?? 1) - (u?.keys ?? 0) } }));
  }
  c.run();
  return true;
}

/** Entries for a web menu bar dropdown. */
export function menuEntries(menu: RiderMenu, list = commands) {
  const out: ({ label: string; shortcut?: string; onSelect: () => void } | 'separator')[] = [];
  for (const c of list.filter((x) => x.menu === menu && commandOn(x.id))) {
    if (c.group && out.length && out.at(-1) !== 'separator') out.push('separator');
    out.push({ label: `${c.checked ? (c.checked() ? '✓ ' : ' ') : ''}${c.label}`, shortcut: c.shortcut, onSelect: () => runRider(c.id, 'menu') });
  }
  return out;
}
