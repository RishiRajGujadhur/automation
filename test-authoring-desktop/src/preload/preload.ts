import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type DesktopBridge, type MenuCommand } from '../shared/bridge';

const bridge: DesktopBridge = {
  platform: process.platform,
  versions: { app: process.env.npm_package_version ?? '', electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  pickFolder: (title) => ipcRenderer.invoke(IPC.pickFolder, title),
  openSolution: () => ipcRenderer.invoke(IPC.openSolution),
  openInEditor: (file, line) => ipcRenderer.invoke(IPC.openInEditor, file, line),
  copyPath: (file) => ipcRenderer.invoke(IPC.copyPath, file),
  reveal: (file) => ipcRenderer.invoke(IPC.reveal, file),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  notify: (title, body) => ipcRenderer.send(IPC.notify, title, body),
  setProgress: (value) => ipcRenderer.send(IPC.progress, value),
  setTheme: (colors) => ipcRenderer.send(IPC.theme, colors),
  onMenu: (cb) => {
    const h = (_e: unknown, c: MenuCommand, arg?: unknown) => cb(c, arg);
    ipcRenderer.on(IPC.menu, h);
    return () => { ipcRenderer.removeListener(IPC.menu, h); };
  },
};
contextBridge.exposeInMainWorld('desktop', bridge);

// D12: a folder dropped anywhere the page doesn't handle drops itself (e.g. not a CSV/report drop zone) opens it as the repository.
window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files') && !e.defaultPrevented) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (e.defaultPrevented || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  const p = webUtils.getPathForFile(e.dataTransfer.files[0]);
  if (p) ipcRenderer.send(IPC.dropFolder, p);
});
