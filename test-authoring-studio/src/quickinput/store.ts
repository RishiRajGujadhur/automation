import { useSyncExternalStore, type ReactNode } from 'react';
import type { Match } from './fuzzy';

/**
 * VS Code's Quick Input (VSCODE-250.md W1–W20): one quick pick at the top of the window. What it lists depends on the
 * prefix typed first, as in VS Code: nothing = files (Quick Open), `>` commands, `@` symbols of the editor, `:` go to
 * line, `#` workspace symbols, `?` help… Each prefix has a provider; features register theirs.
 */
export type QuickButton = { icon: ReactNode; title: string; run: () => void };
export type QuickItem = {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  icon?: ReactNode;
  keybinding?: string;
  labelMatches?: Match[];
  descriptionMatches?: Match[];
  /** Starts a group: a border above and this label on the right (VS Code's "recently used"). */
  separator?: string;
  buttons?: QuickButton[];
  /** `side`: Ctrl+Enter (open to the side). */
  accept: (o: { side: boolean }) => void;
};
export type QuickProvider = {
  prefix: string;
  /** What `?` lists for this prefix. */
  help: string;
  placeholder?: string;
  provide: (filter: string, signal: AbortSignal) => QuickItem[] | Promise<QuickItem[]>;
  /** The highlighted item changed (previews, e.g. Go to Line). */
  onActive?: (item: QuickItem | undefined, filter: string) => void;
  /** Closed without accepting (undo a preview). */
  onCancel?: () => void;
  /** A message shown above the list (e.g. "Current Line: 3…"). */
  message?: (filter: string) => string | undefined;
  noResults?: string;
};

const providers: QuickProvider[] = [];
export function registerQuickAccess(p: QuickProvider) {
  const i = providers.findIndex((x) => x.prefix === p.prefix);
  if (i >= 0) providers.splice(i, 1, p); else providers.push(p);
  return () => { const j = providers.indexOf(p); if (j >= 0) providers.splice(j, 1); };
}
export const quickProviders = () => providers;
/** The provider of a query: the longest registered prefix it starts with. */
export function providerFor(value: string) {
  let best: QuickProvider | undefined;
  for (const p of providers) if (value.startsWith(p.prefix) && (!best || p.prefix.length > best.prefix.length)) best = p;
  return best;
}

/** A one-off quick pick (status bar pickers, Change Language Mode…): its own items instead of a prefix provider. */
export type QuickPick = { placeholder: string; items: QuickItem[] | ((filter: string) => QuickItem[] | Promise<QuickItem[]>); title?: string; onCancel?: () => void; onActive?: (item: QuickItem | undefined) => void; activeId?: string };
type State = { open: boolean; value: string; /** Changes on every open, so the widget resets its selection. */ session: number; select?: boolean; /** Changes when the items should be fetched again. */ revision: number; pick?: QuickPick };
let state: State = { open: false, value: '', session: 0, revision: 0 };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
export const useQuickInput = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
/** Opens the Quick Input with `value` (a prefix such as '>' or ''); `select` selects the text after the prefix. */
export function openQuickInput(value = '', select = false) { state = { open: true, value, session: state.session + 1, select, revision: state.revision }; emit(); }
/** Shows a quick pick; the typed text filters its items by label and description. */
export function openQuickPick(pick: QuickPick) { state = { open: true, value: '', session: state.session + 1, revision: state.revision, pick }; emit(); }
/** Asks the open widget for its items again (after a row's button changed them). */
export function refreshQuickInput() { state = { ...state, revision: state.revision + 1 }; emit(); }
export function closeQuickInput() { if (state.open) { state = { ...state, open: false }; emit(); } }
export const quickInputOpen = () => state.open;

// The last text of each prefix, for preserve-input (W14) and the palette's "last query" (QOL-50).
const last = new Map<string, string>();
export const rememberQuery = (value: string) => last.set(providerFor(value)?.prefix ?? '', value);
export const lastQuery = (prefix: string) => last.get(prefix);
