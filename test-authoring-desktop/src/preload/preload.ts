import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type DesktopBridge, type MenuCommand } from '../shared/bridge';

const bridge: DesktopBridge = {
  platform: process.platform,
  versions: { app: process.env.npm_package_version ?? '', electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  pickFolder: (title) => ipcRenderer.invoke(IPC.pickFolder, title),
  openInEditor: (file) => ipcRenderer.invoke(IPC.openInEditor, file),
  reveal: (file) => ipcRenderer.invoke(IPC.reveal, file),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  notify: (title, body) => ipcRenderer.send(IPC.notify, title, body),
  setProgress: (value) => ipcRenderer.send(IPC.progress, value),
  setTheme: (colors) => ipcRenderer.send(IPC.theme, colors),
  onMenu: (cb) => {
    const h = (_e: unknown, c: MenuCommand) => cb(c);
    ipcRenderer.on(IPC.menu, h);
    return () => { ipcRenderer.removeListener(IPC.menu, h); };
  },
};
contextBridge.exposeInMainWorld('desktop', bridge);
