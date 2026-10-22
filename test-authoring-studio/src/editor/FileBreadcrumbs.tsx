import { useEffect, useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { api } from '../api';
import { Dropdown, type MenuEntry } from '../radix';
import { fileType } from '../files/fileTypes';
import { fileOutline, type OutlineItem } from '../rider/outline';
import { openLocation } from '../quickinput/providers';
import { openQuickInput } from '../quickinput/store';
import { isBrowser } from '../files/provider';
import { defineSetting, useSettings } from '../vscode/settings';

/** breadcrumbs.filePath / symbolPath / icons (VSCODE-250.md W85). */
const B = 'Workbench ▸ Breadcrumbs';
const pathOpts = [{ value: 'on', description: 'Show the whole path.' }, { value: 'off', description: 'Do not show it.' }, { value: 'last', description: 'Only show the last element.' }];
export const crumbSettings = {
  filePath: defineSetting<'on' | 'off' | 'last'>({ key: 'breadcrumbs.filePath', category: B, title: 'File Path', type: 'enum', default: 'on', description: 'Controls whether and how file paths are shown in the breadcrumbs view.', options: pathOpts }),
  symbolPath: defineSetting<'on' | 'off' | 'last'>({ key: 'breadcrumbs.symbolPath', category: B, title: 'Symbol Path', type: 'enum', default: 'on', description: 'Controls whether and how symbols are shown in the breadcrumbs view.', options: pathOpts }),
  icons: defineSetting<boolean>({ key: 'breadcrumbs.icons', category: B, title: 'Icons', type: 'boolean', default: true, description: 'Render breadcrumb items with icons.' }),
};
import { activeEditor } from './activeEditor';
import { registerRider } from '../rider/commands';

/** The active editor's breadcrumbs: its last part focused, and with `select` its picker open (W84). */
export function focusBreadcrumbs(select: boolean) {
  const a = activeEditor();
  const nav = a?.view.dom.closest('.code-editor')?.querySelector<HTMLElement>('nav.file-breadcrumbs');
  const parts = nav ? [...nav.querySelectorAll<HTMLElement>('.crumb-part')] : [];
  const last = parts.at(-1);
  if (!last) return;
  last.focus();
  // Radix menus open on a key, not on a synthetic click.
  if (select) last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}
registerRider([
  { id: 'breadcrumbs-focus-select', label: 'Focus and Select Breadcrumbs', menu: 'View', shortcut: 'Ctrl+Shift+.', run: () => focusBreadcrumbs(true) },
  { id: 'breadcrumbs-focus', label: 'Focus Breadcrumbs', menu: 'View', shortcut: 'Ctrl+Shift+;', run: () => focusBreadcrumbs(false) },
]);
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || (e.code !== 'Period' && e.code !== 'Semicolon')) return;
  if (!activeEditor()) return;
  e.preventDefault();
  e.stopPropagation();
  focusBreadcrumbs(e.code === 'Period');
}, true);

// The workspace's files, shared by every breadcrumb bar (refreshed now and then).
let files: string[] = [];
let fetched = 0;
async function workspaceFiles() {
  if (!isBrowser() && Date.now() - fetched > 10_000) { fetched = Date.now(); try { files = (await api<{ files: { file: string }[] }>('/solution')).files.map((f) => f.file); } catch { /* keep */ } }
  return files;
}
/** The direct children of a folder ('' is the root): sub-folders, then files. */
function children(folder: string) {
  const pre = folder ? `${folder}/` : '';
  const dirs = new Set<string>(), out: string[] = [];
  for (const f of files) {
    if (!f.startsWith(pre)) continue;
    const rest = f.slice(pre.length);
    const i = rest.indexOf('/');
    if (i >= 0) dirs.add(rest.slice(0, i)); else out.push(f);
  }
  return { dirs: [...dirs].sort(), files: out.sort() };
}

/**
 * VS Code's breadcrumbs (VSCODE-250.md W83): the file's folders, the file and (when the C# navigation bar is not
 * shown) the symbols around the caret. Each part opens a picker: a folder its contents, the file its siblings, a
 * symbol the symbols beside it.
 */
export default function FileBreadcrumbs({ file, source, line, symbols = true, onGo }: { file: string; source: string; line: number; symbols?: boolean; onGo: (line: number, column: number) => void }) {
  const [, setN] = useState(0);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  useEffect(() => { void workspaceFiles().then(() => setN((n) => n + 1)); }, [file]);
  useEffect(() => {
    if (!symbols) return;
    let live = true;
    const t = setTimeout(() => void fileOutline(file, source).then((o) => { if (live) setOutline(o); }, () => {}), 400);
    return () => { live = false; clearTimeout(t); };
  }, [file, source, symbols]);
  useSettings();
  const allParts = file.split('/');
  // breadcrumbs.filePath: the whole path, the file only, or nothing.
  const fp = crumbSettings.filePath();
  const parts = fp === 'off' ? [] : fp === 'last' ? allParts.slice(-1) : allParts;
  const offset = allParts.length - parts.length;
  const folderEntries = (folder: string): MenuEntry[] => {
    const c = children(folder);
    return [
      ...c.dirs.map((d) => ({ label: `${d}/`, icon: Folder, onSelect: () => openQuickInput(`${folder ? `${folder}/` : ''}${d}/`) })),
      ...c.files.map((f) => ({ label: f.split('/').pop()!, icon: fileType(f).icon, active: f === file, onSelect: () => openLocation(f) })),
    ];
  };
  // The symbols containing the caret, outermost first.
  const fullChain = symbols ? outline.filter((it) => it.start <= line && line <= it.end).sort((a, b) => a.depth - b.depth) : [];
  const sp = crumbSettings.symbolPath();
  const chain = sp === 'off' ? [] : sp === 'last' ? fullChain.slice(-1) : fullChain;
  const siblings = (it: OutlineItem) => outline.filter((o) => o.depth === it.depth && (it.depth === 0 || fullChain.some((p) => p.depth === it.depth - 1 && p.start <= o.start && o.end <= p.end)));
  const Icon = fileType(file).icon;
  return (
    <nav className="file-breadcrumbs" aria-label="Breadcrumbs" onKeyDown={(e) => {
      // W84: ←/→ move between the parts, Escape goes back to the editor.
      const parts = [...e.currentTarget.querySelectorAll<HTMLElement>('.crumb-part')];
      const i = parts.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); parts[Math.max(0, Math.min(parts.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); activeEditor()?.view.focus(); }
    }}>
      {parts.map((p, i) => {
        const folder = allParts.slice(0, offset + i).join('/');
        const last = i === parts.length - 1;
        return (
          <span key={i} className="crumb-wrap">
            {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
            <Dropdown label={last ? 'Files beside it' : `Folder ${p}`} entries={folderEntries(folder)} trigger={
              <button className="crumb-part" aria-label={last ? `File: ${p}` : `Folder: ${p}`}>{last && crumbSettings.icons() ? <Icon size={13} aria-hidden="true" style={{ color: fileType(file).color }} /> : null}{p}</button>
            } />
          </span>
        );
      })}
      {chain.map((it) => (
        <span key={`${it.line}:${it.label}`} className="crumb-wrap">
          <ChevronRight size={12} aria-hidden="true" />
          <Dropdown label={`Symbols beside ${it.label}`} entries={siblings(it).map((s) => ({ label: s.label, active: s === it, onSelect: () => onGo(s.line, s.column) }))} trigger={
            <button className="crumb-part" aria-label={`Symbol: ${it.label}`}>{crumbSettings.icons() && <span className={`codicon codicon-symbol-${it.kind === 'class' ? 'class' : it.kind === 'method' || it.kind === 'function' ? 'method' : 'field'}`} aria-hidden="true" />}{it.label}</button>
          } />
        </span>
      ))}
    </nav>
  );
}
