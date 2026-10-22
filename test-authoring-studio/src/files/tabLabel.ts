import { fileSource } from './provider';
import { labelFormat } from '../vscode/editorManagement';

/**
 * workbench.editor.labelFormat (VSCODE-250.md W68): the text after a tab's name. Short is the folder, medium the
 * path in the workspace, long the absolute path; default shows the folder only to tell same-named files apart.
 */
export function tabDescription(file: string, duplicate: boolean) {
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  switch (labelFormat()) {
    case 'short': return dir.split('/').pop() ?? '';
    case 'medium': return dir;
    case 'long': {
      const src = fileSource();
      const root = src.kind === 'server' ? (src.root ?? '') : src.name;
      const sep = root.includes('\\') ? '\\' : '/';
      return dir ? `${root.replace(/[\\/]$/, '')}${sep}${dir.split('/').join(sep)}` : root;
    }
    default: return duplicate ? dir.split('/').pop() ?? '' : '';
  }
}
