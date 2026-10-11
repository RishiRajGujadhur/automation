import { app, clipboard, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

/**
 * E1–E8: Electron shows no context menu by default. The studio draws its own right-click menus for cards
 * and rows (those call preventDefault, so Chromium never asks), so this only covers text fields, selections and links.
 */
export function attachContextMenu(win: BrowserWindow) {
  win.webContents.on('context-menu', (_e, p) => {
    const items: MenuItemConstructorOptions[] = [];
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
      if (!p.dictionarySuggestions.length) items.push({ label: 'No spelling suggestions', enabled: false });
      items.push({ label: `Add “${p.misspelledWord}” to Dictionary`, click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' });
    }
    if (p.isEditable) {
      items.push(
        { role: 'undo', enabled: p.editFlags.canUndo }, { role: 'redo', enabled: p.editFlags.canRedo }, { type: 'separator' },
        { role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste },
        { label: 'Paste as Plain Text', accelerator: 'CmdOrCtrl+Shift+V', enabled: p.editFlags.canPaste, click: async () => { win.webContents.insertText(await clipboard.readText()); } },
        { role: 'selectAll' },
      );
    } else if (p.selectionText.trim()) {
      items.push({ role: 'copy' });
    }
    const sel = p.selectionText.trim();
    if (sel) {
      const short = sel.length > 30 ? sel.slice(0, 30) + '…' : sel;
      items.push({ type: 'separator' }, { label: `Search the Web for “${short}”`, click: () => shell.openExternal(`https://www.bing.com/search?q=${encodeURIComponent(sel)}`) });
    }
    if (p.linkURL && /^https?:/.test(p.linkURL)) items.push({ type: 'separator' }, { label: 'Open Link in Browser', click: () => shell.openExternal(p.linkURL) }, { label: 'Copy Link Address', click: () => clipboard.writeText(p.linkURL) });
    if (!app.isPackaged) items.push({ type: 'separator' }, { label: 'Inspect Element', click: () => win.webContents.inspectElement(p.x, p.y) });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}
