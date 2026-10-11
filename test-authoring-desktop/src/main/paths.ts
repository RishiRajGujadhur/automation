import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Bundled studio resources (client, API, fixtures, scanner): `<resources>/studio` when packaged, `./studio` in development. */
export const resourcesRoot = () => (app.isPackaged ? path.join(process.resourcesPath, 'studio') : path.resolve(here, '../../studio'));
/** Writable state (workspace, settings, traces, logs). */
export const dataRoot = () => app.getPath('userData');
export const logFile = () => path.join(app.getPath('logs'), 'studio.log');
export const preloadPath = () => path.resolve(here, '../preload/preload.cjs');
/** Window icon during development (packaged builds use the executable's icon). */
export const devIcon = () => (app.isPackaged ? undefined : path.resolve(here, '../../build/icon.png'));
