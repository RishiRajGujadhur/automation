import { api } from '../api';
import { recentFiles } from '../navHistory';
import { fileType } from '../files/fileTypes';
import { featureOn } from '../features';
import { matchesWords, scoreFile } from './fuzzy';
import { readUsage } from '../rider/commands';
import { lastQuery, openQuickInput, registerQuickAccess, type QuickItem } from './store';

/** Opens a file (and line) in the editor, as Go to All does. */
export const openLocation = (file: string, line?: number, column?: number) => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file, line, column } }));

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
const fileItem = (f: string, extra: Partial<QuickItem> = {}): QuickItem => {
  const { name, dir } = split(f);
  return { id: `file:${f}`, label: name, description: dir, icon: fileIcon(f), accept: () => openLocation(f), ...extra };
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
/** VS Code's keybinding label from a stored shortcut ("recent · Ctrl Shift U" → "Ctrl Shift U"). */
const keysOf = (s?: string) => s?.replace(/^recent( · )?/, '') || undefined;

// Commands run from the palette, newest last use per label (VS Code's command history).
const USED = 'tas:palette:used';
const paletteUsage = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(USED) ?? '{}') as Record<string, number>; } catch { return {}; } };
const notePaletteUse = (label: string) => { try { localStorage.setItem(USED, JSON.stringify({ ...paletteUsage(), [label]: Date.now() })); } catch { /* storage blocked */ } };
/** How many recently used commands the palette keeps first (workbench.commandPalette.history, W15). */
const historySize = () => 50;

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
    const item = (r: (typeof rows)[number], separator?: string): QuickItem => ({ id: `cmd:${r.e.label}`, label: r.e.label, labelMatches: r.m ?? [], keybinding: keysOf(r.e.shortcut), separator, accept: () => { notePaletteUse(r.e.label); r.e.run(); } });
    return [...recent.map((r, i) => item(r, i === 0 ? 'recently used' : undefined)), ...others.map((r, i) => item(r, i === 0 && recent.length ? 'other commands' : undefined))];
  },
});

/** Ctrl+Shift+P: the palette with its last query selected (QOL-50 "palette-last"), else just `>`. */
export const openCommandPalette = () => openQuickInput(featureOn('palette-last') ? lastQuery('>') ?? '>' : '>', true);
import './symbols';
import './gotoLine';
import './workspaceSymbols';
import './help';
