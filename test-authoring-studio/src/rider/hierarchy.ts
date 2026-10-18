import { useSyncExternalStore } from 'react';

/** What the Hierarchy tool window shows: a type hierarchy (Ctrl+H) or a call hierarchy (Ctrl+Alt+H). */
export type HNode = { name: string; kind: string; location?: { file: string; line: number; column: number }; external?: boolean };
export type TypeHierarchy = { type: HNode; bases: HNode[]; interfaces: HNode[]; derived: { node: HNode; parent?: string }[] };
export type CallHierarchy = { target: HNode; callers: { node: HNode; sites: { file: string; line: number; column: number }[] }[] };
export type HierarchyState =
  | { kind: 'type'; loading?: boolean; error?: string; data?: TypeHierarchy }
  | { kind: 'call'; loading?: boolean; error?: string; data?: CallHierarchy }
  | null;

let state: HierarchyState = null;
const listeners = new Set<() => void>();
export const setHierarchy = (s: HierarchyState) => { state = s; for (const l of listeners) l(); };
export const useHierarchy = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
