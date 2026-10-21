import { defineSetting, onSettingsChanged } from './vscode/settings';

/**
 * The window title (VSCODE-250.md W46): VS Code's window.title template with its variables (${dirty},
 * ${activeEditorShort}, ${activeEditorMedium}, ${activeFolderShort}, ${rootName}, ${rootPath}, ${appName}, ${separator}…)
 * and a busy prefix while a build or a test run is going (QOL-50).
 */
export const titleTemplate = defineSetting<string>({ key: 'window.title', category: 'Window', title: 'Title', type: 'string', default: '${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}', description: 'Controls the window title based on the current context. Variables: ${activeEditorShort} (the file name or page), ${activeEditorMedium} (the path relative to the workspace folder), ${activeEditorLong}, ${activeFolderShort}, ${activeFolderMedium}, ${rootName}, ${rootPath}, ${appName}, ${dirty} (● when the editor has unsaved changes), ${separator} (shown only between variables with values).' });
export const titleSeparator = defineSetting<string>({ key: 'window.titleSeparator', category: 'Window', title: 'Title Separator', type: 'string', default: ' — ', description: 'Separator used by window.title.' });

export type TitleContext = { file?: string; page?: string; root?: string; dirty?: boolean };
/** Fills a window.title template; a ${separator} next to an empty value (or another separator) is dropped, as in VS Code. */
export function formatTitle(template: string, c: TitleContext, separator = ' — ') {
  const rootName = (c.root ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
  const dir = c.file?.includes('/') ? c.file.slice(0, c.file.lastIndexOf('/')) : '';
  const vars: Record<string, string> = {
    dirty: c.dirty ? '● ' : '',
    activeEditorShort: c.file ? c.file.split('/').pop()! : c.page ?? '',
    activeEditorMedium: c.file ?? c.page ?? '',
    activeEditorLong: c.file && c.root ? `${c.root.replace(/[\\/]$/, '')}/${c.file}` : c.file ?? c.page ?? '',
    activeFolderShort: dir.split('/').pop() ?? '',
    activeFolderMedium: dir,
    activeFolderLong: dir && c.root ? `${c.root.replace(/[\\/]$/, '')}/${dir}` : dir,
    folderName: rootName, folderPath: c.root ?? '', rootName, rootPath: c.root ?? '',
    appName: 'TestAuthoring Studio',
  };
  // Split on ${separator}; keep the parts that have text; join them with the separator.
  const parts = template.split('${separator}').map((p) => p.replace(/\$\{(\w+)\}/g, (_, k: string) => vars[k] ?? ''));
  const kept = parts.filter((p) => p.replace(/[●\s]/g, '') !== '' || /●/.test(p));
  // "${dirty}" alone in front of an empty name sticks to the next part.
  const out: string[] = [];
  for (const p of kept) { if (out.length && /^●\s*$/.test(out[out.length - 1])) out[out.length - 1] += p; else out.push(p); }
  return out.join(separator).trim() || vars.appName;
}

let base = 'TestAuthoring Studio';
let context: TitleContext = {};
let busy = '';
const apply = () => { if (typeof document !== 'undefined') document.title = busy ? `${busy} · ${base}` : base; };
const render = () => { base = formatTitle(titleTemplate(), context, titleSeparator()); apply(); };
/** The shell's current file / page, workspace and unsaved state. */
export function setTitleContext(c: TitleContext) { context = c; render(); }
export function setBusyTitle(text: string) { if (busy !== text) { busy = text; apply(); } }
if (typeof window !== 'undefined') onSettingsChanged(render);
