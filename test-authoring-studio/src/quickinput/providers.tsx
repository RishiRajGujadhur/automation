import { api } from '../api';
import { activeEditor } from '../editor/activeEditor';
import { recentFiles, removeRecent } from '../navHistory';
import { fileType } from '../files/fileTypes';
import { featureOn } from '../features';
import { fuzzyScore, matchesWords, scoreFile } from './fuzzy';
import { readUsage } from '../rider/commands';
import { quickOpen } from '../vscode/quickOpen';
import { editorPreview } from '../vscode/editorManagement';
import { CONFIGURE_KEYBINDING_EVENT } from '../keybindings';
import { closeQuickInput, lastQuery, openQuickInput, refreshQuickInput, registerQuickAccess, type QuickItem } from './store';

/** Opens a file (and line) in the editor, as Go to All does. */
export function openLocation(file: string, line?: number, column?: number, preview?: boolean) {
  window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file, line, column, preview } }));
  // As in VS Code the opened editor takes the focus (which also makes it a Back / Forward location).
  let tries = 0;
  const focus = () => {
    const a = activeEditor();
    if (a && a.file === file && a.view.dom.isConnected) { if (!a.view.hasFocus) a.view.focus(); return; }
    if (++tries < 40) setTimeout(focus, 50);
  };
  setTimeout(focus, 30);
}

const fileIcon = (f: string) => { const t = fileType(f); return <t.icon size={16} style={{ color: t.color }} aria-hidden="true" />; };
const split = (f: string) => { const i = f.lastIndexOf('/'); return { name: f.slice(i + 1), dir: i > 0 ? f.slice(0, i) : '' }; };

// The workspace's files, fetched when Quick Open opens (cached for a few seconds).
let files: string[] = [];
let fetched = 0;
async function workspaceFiles() {
  if (Date.now() - fetched > 5000) {
    try { files = (await api<{ files: { file: string }[] }>('/solution')).files.map((f) => f.file); fetched = Date.now(); } catch { /* keep the last list */ }
  }
  return files;
}
/** Opens a file in the split editor (Explorer's Open to the Side; feature files open normally). */
export const openToSide = (file: string) => { if (file.endsWith('.feature')) openLocation(file); else window.dispatchEvent(new CustomEvent('tas:open-split', { detail: file })); };
const fileItem = (f: string, extra: Partial<QuickItem> = {}): QuickItem => {
  const { name, dir } = split(f);
  // W11: Ctrl+Enter or the split button opens to the side; W12: a recent file can be removed from the list.
  const buttons = [{ icon: <span className="codicon codicon-split-horizontal" />, title: 'Open to the Side', run: () => { closeQuickInput(); openToSide(f); } }];
  if (recentFiles().includes(f)) buttons.push({ icon: <span className="codicon codicon-close" />, title: 'Remove from Recently Opened', run: () => { removeRecent(f); refreshQuickInput(); } });
  return { id: `file:${f}`, label: name, description: dir, icon: fileIcon(f), buttons, accept: ({ side }) => (side ? openToSide(f) : openLocation(f, undefined, undefined, editorPreview.enable() && editorPreview.fromQuickOpen())), ...extra };
};

/** W1 Quick Open (Ctrl+P): recently opened files first, then every file of the workspace, fuzzy matched. */
registerQuickAccess({
  prefix: '',
  help: 'Go to File',
  placeholder: 'Search files by name (append : to go to line or @ to go to symbol)',
  noResults: 'No matching results',
  provide: async (filter) => {
    const q = filter.trim();
    const recent = recentFiles();
    if (!q) return recent.slice(0, 30).map((f, i) => fileItem(f, i === 0 ? { separator: 'recently opened' } : {}));
    const all = await workspaceFiles();
    const scored: { f: string; score: number; item: QuickItem }[] = [];
    for (const f of new Set([...recent, ...all])) {
      const { name, dir } = split(f);
      const s = scoreFile(q, name, f);
      if (!s) continue;
      const r = recent.indexOf(f);
      scored.push({ f, score: s.score + (r >= 0 ? 200 - r : 0), item: fileItem(f, { labelMatches: s.name, descriptionMatches: s.path.filter((m) => m.end <= dir.length) }) });
    }
    scored.sort((a, b) => b.score - a.score || a.f.length - b.f.length);
    const top = scored.slice(0, 200).map((x) => x.item);
    const firstOther = top.findIndex((it) => !recent.includes(it.id.slice(5)));
    if (top.length && recent.includes(top[0].id.slice(5))) top[0] = { ...top[0], separator: 'recently opened' };
    if (firstOther > 0) top[firstOther] = { ...top[firstOther], separator: 'file results' };
    return top;
  },
});

/** A command of the palette (App and Rider commands; set by the shell on every render). */
export type PaletteEntry = { label: string; run: () => void; shortcut?: string; /** Last use (ms). */ recent?: number; /** A Rider command's id (its use is counted by runRider). */ id?: string };
let commands: PaletteEntry[] = [];
export const setPaletteCommands = (list: PaletteEntry[]) => { commands = list; };
/** Runs a palette entry by label (a custom keybinding bound to it). */
export const runPaletteCommand = (label: string) => commands.find((c) => c.label === label)?.run();
/** A custom keybinding the user gave the command (Keyboard Shortcuts). */
const customKey = (e: PaletteEntry) => { let b: Record<string, string> = {}; try { b = JSON.parse(localStorage.getItem('tas:keybindings') ?? '{}') as Record<string, string>; } catch { /* none */ } const id = e.id ? `rider:${e.id}` : `palette:${e.label}`; return Object.entries(b).find(([, c]) => c === id)?.[0]; };
/** VS Code's keybinding label from a stored shortcut ("recent · Ctrl Shift U" → "Ctrl Shift U"). */
const keysOf = (s?: string) => s?.replace(/^recent( · )?/, '') || undefined;

// Commands run from the palette, newest last use per label (VS Code's command history).
const USED = 'tas:palette:used';
const paletteUsage = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(USED) ?? '{}') as Record<string, number>; } catch { return {}; } };
const notePaletteUse = (label: string) => { try { localStorage.setItem(USED, JSON.stringify({ ...paletteUsage(), [label]: Date.now() })); } catch { /* storage blocked */ } };
/** How many recently used commands the palette keeps first (workbench.commandPalette.history, W15). */
const historySize = () => quickOpen.history();

/** W2 Command Palette (Ctrl+Shift+P, `>`): recently used commands first, then the others, with their keys. */
registerQuickAccess({
  prefix: '>',
  help: 'Show and Run Commands',
  placeholder: 'Type the name of a command to run.',
  noResults: 'No matching commands',
  provide: (filter) => {
    const q = filter.trim();
    const seen = new Set<string>();
    const rows: { e: PaletteEntry; m: ReturnType<typeof matchesWords>; i: number }[] = [];
    commands.forEach((e, i) => { if (seen.has(e.label)) return; seen.add(e.label); const m = matchesWords(q, e.label); if (m) rows.push({ e, m, i }); });
    // Recency: the palette's own record of what ran from it, and the Rider usage counter (menus, keys).
    const used = paletteUsage(), rider = readUsage();
    const last = (e: PaletteEntry) => Math.max(used[e.label] ?? 0, e.id ? rider[e.id]?.last ?? 0 : e.recent ?? 0);
    const recentFirst = featureOn('palette-recent');
    const recent = recentFirst ? rows.filter((r) => last(r.e)).sort((a, b) => last(b.e) - last(a.e)).slice(0, historySize()) : [];
    const others = rows.filter((r) => !recent.includes(r)).sort((a, b) => (q ? (a.m![0]?.start ?? 0) - (b.m![0]?.start ?? 0) : 0) || a.e.label.localeCompare(b.e.label));
    // W18: the gear on a row opens Keyboard Shortcuts to give the command a key.
    const configure = (e: PaletteEntry) => ({ icon: <span className="codicon codicon-gear" />, title: 'Configure Keybinding', run: () => { closeQuickInput(); window.dispatchEvent(new CustomEvent(CONFIGURE_KEYBINDING_EVENT, { detail: { id: e.id ? `rider:${e.id}` : `palette:${e.label}`, label: e.label } })); } });
    const item = (r: (typeof rows)[number], separator?: string): QuickItem => ({ id: `cmd:${r.e.label}`, label: r.e.label, labelMatches: r.m ?? [], keybinding: keysOf(r.e.shortcut) ?? customKey(r.e), separator, buttons: [configure(r.e)], accept: () => { notePaletteUse(r.e.label); r.e.run(); } });
    const out = [...recent.map((r, i) => item(r, i === 0 ? 'recently used' : undefined)), ...others.map((r, i) => item(r, i === 0 && recent.length ? 'other commands' : undefined))];
    if (out.length || !q) return out;
    // W19: nothing contains the words: the closest titles by fuzzy match, as "similar commands".
    const similar = [...seen].map((label) => ({ label, s: fuzzyScore(q.replace(/\s+/g, ''), label.replace(/\s+/g, ''), true) })).filter((x) => x.s).sort((a, b) => b.s![0] - a.s![0]).slice(0, 10);
    return similar.map((x, i) => { const e = commands.find((c) => c.label === x.label)!; return item({ e, m: [], i }, i === 0 ? 'similar commands' : undefined); });
  },
});

/** Ctrl+Shift+P: the palette with its last query selected (workbench.commandPalette.preserveInput, W14, or QOL-50 "palette-last"), else just `>`. */
export const openCommandPalette = () => openQuickInput(quickOpen.palettePreserveInput() || featureOn('palette-last') ? lastQuery('>') ?? '>' : '>', true);
/** Ctrl+P: Quick Open, with the last query selected when workbench.quickOpen.preserveInput is on (W14). */
export const openQuickOpen = () => openQuickInput(quickOpen.preserveInput() ? lastQuery('') ?? '' : '', true);
import './symbols';
import './gotoLine';
import './workspaceSymbols';
import './help';
import './editors';
import './textSearch';
import './languagePick';
