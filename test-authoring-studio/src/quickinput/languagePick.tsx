import { activeEditor } from '../editor/activeEditor';
import { LANGUAGES, associatedLanguage, languageById, languageOf, naturalLanguage, notifyLanguageModes, setLanguageMode } from '../editor/languageMode';
import { setSetting } from '../vscode/settings';
import { files } from '../vscode/files';
import { registerRider } from '../rider/commands';
import { openQuickPick, type QuickItem } from './store';

/** W23 Change Language Mode (Ctrl+K M, the status bar's language): VS Code's list of languages for this file. */
export function changeLanguageMode(file: string) {
  const current = languageOf(file);
  const natural = naturalLanguage(file);
  const items: QuickItem[] = [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name)).map((l, i) => ({
    id: l.id, label: l.name, description: `(${l.id})${l.id === current ? ' - Configured Language' : ''}`, separator: i === 0 ? 'languages (identifier)' : undefined,
    accept: () => setLanguageMode(file, l.id),
  }));
  if (current !== natural) items.unshift({ id: '<auto>', label: `Reset to ${languageById(natural)?.name ?? natural}`, description: 'by file extension', accept: () => setLanguageMode(file, undefined) });
  // W24: every file with this extension gets a language (files.associations).
  const ext = file.split('/').pop()!.includes('.') ? `.${file.split('.').pop()}` : '';
  if (ext) items.unshift({ id: '<assoc>', label: `Configure File Association for '${ext}'...`, accept: () => setTimeout(() => configureFileAssociation(ext)) });
  openQuickPick({ placeholder: 'Select Language Mode', items, activeId: current });
}

/** files.associations["*.ext"] = the picked language (W24). */
export function configureFileAssociation(ext: string) {
  const current = associatedLanguage(`x${ext}`) ?? naturalLanguage(`x${ext}`);
  openQuickPick({
    placeholder: `Select Language Mode to Associate with '${ext}'`,
    activeId: current,
    items: [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name)).map((l) => ({ id: l.id, label: l.name, description: `(${l.id})`, accept: () => { setSetting('files.associations', { ...files.associations(), [`*${ext}`]: l.id }); notifyLanguageModes(); } })),
  });
}

registerRider([{ id: 'change-language-mode', label: 'Change Language Mode', menu: 'View', shortcut: 'Ctrl+K M', run: () => { const a = activeEditor(); if (a) changeLanguageMode(a.file); } }]);
