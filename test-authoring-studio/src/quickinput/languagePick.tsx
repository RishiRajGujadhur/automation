import { activeEditor } from '../editor/activeEditor';
import { LANGUAGES, languageById, languageOf, naturalLanguage, setLanguageMode } from '../editor/languageMode';
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
  openQuickPick({ placeholder: 'Select Language Mode', items, activeId: current });
}

registerRider([{ id: 'change-language-mode', label: 'Change Language Mode', menu: 'View', shortcut: 'Ctrl+K M', run: () => { const a = activeEditor(); if (a) changeLanguageMode(a.file); } }]);
