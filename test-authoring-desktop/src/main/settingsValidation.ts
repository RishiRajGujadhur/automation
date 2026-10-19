import type { Shape } from './store';

type SettingsExport = { desktop?: Partial<Shape>; studio?: Record<string, unknown>; workspace?: Record<string, unknown> };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const port = (v: unknown) => number(v) && Number.isInteger(v) && (v as number) >= 1024 && (v as number) <= 65535;
const bools = ['autoRescan', 'chromiumOffered', 'alwaysOnTop', 'autoHideMenu', 'fullscreen', 'minimizeToTray', 'closeToTray', 'trayHintShown', 'doNotDisturb', 'globalShortcut', 'hardwareAcceleration', 'spellcheck', 'firstRunDone'];

/** Validate every supplied section before any settings file is changed. Never coerce values. */
export function validateSettingsExport(input: unknown): { data?: SettingsExport; errors: string[] } {
  const errors: string[] = [];
  const check = (ok: boolean, field: string, message: string) => { if (!ok) errors.push(`${field}: ${message}`); };
  const keys = (value: Record<string, unknown>, allowed: string[], prefix: string) => {
    for (const key of Object.keys(value)) check(allowed.includes(key), `${prefix}.${key}`, 'Unknown setting.');
  };
  if (!object(input)) return { errors: ['Export: expected a JSON object.'] };
  check(input.format === 'testauthoring-settings', 'format', 'Expected a TestAuthoring Studio settings export.');
  check(input.version === 1, 'version', 'Only export version 1 is supported.');
  keys(input, ['format', 'version', 'exported', 'desktop', 'studio', 'workspace'], 'export');
  check(['desktop', 'studio', 'workspace'].some((k) => input[k] !== undefined), 'export', 'No settings sections were supplied.');
  for (const section of ['desktop', 'studio', 'workspace']) {
    if (input[section] === undefined) continue;
    const value = input[section];
    if (!object(value)) { errors.push(`${section}: expected an object.`); continue; }
    if (section === 'desktop') {
      keys(value, [...bools, 'window', 'zoom', 'recent', 'pinned', 'lastClosed', 'lastPage', 'editor', 'apiPort', 'lastBrowserInstall'], section);
      for (const field of bools) if (field in value) check(typeof value[field] === 'boolean', `desktop.${field}`, 'Expected true or false.');
      for (const field of ['recent', 'pinned']) if (field in value) check(strings(value[field]), `desktop.${field}`, 'Expected an array of paths.');
      if ('lastClosed' in value) check(typeof value.lastClosed === 'string', 'desktop.lastClosed', 'Expected a path.');
      if ('zoom' in value) check(number(value.zoom) && Math.abs(value.zoom as number) <= 10, 'desktop.zoom', 'Expected a zoom level between -10 and 10.');
      if ('apiPort' in value) check(port(value.apiPort), 'desktop.apiPort', 'Expected a whole number from 1024 to 65535.');
      if ('editor' in value) check(['system', 'vscode', 'visualstudio', 'rider', 'notepadpp'].includes(value.editor as string), 'desktop.editor', 'Unknown external editor.');
      if ('lastPage' in value) check(object(value.lastPage) && Object.values(value.lastPage).every((p) => typeof p === 'string' && /^#\/[\w/-]+$/.test(p)), 'desktop.lastPage', 'Expected workspace paths mapped to app pages.');
      if ('window' in value) {
        const w = value.window;
        if (!object(w)) errors.push('desktop.window: expected an object.');
        else {
          keys(w, ['x', 'y', 'width', 'height', 'maximized'], 'desktop.window');
          for (const field of ['width', 'height']) check(number(w[field]) && Number.isInteger(w[field]) && (w[field] as number) > 0, `desktop.window.${field}`, 'Expected a positive whole number.');
          for (const field of ['x', 'y']) if (field in w) check(number(w[field]) && Number.isInteger(w[field]), `desktop.window.${field}`, 'Expected a whole number.');
          check(typeof w.maximized === 'boolean', 'desktop.window.maximized', 'Expected true or false.');
        }
      }
      if ('lastBrowserInstall' in value) {
        const last = value.lastBrowserInstall;
        check(object(last) && typeof last.ok === 'boolean' && typeof last.message === 'string' && typeof last.completedAt === 'string' && Number.isFinite(Date.parse(last.completedAt)), 'desktop.lastBrowserInstall', 'Expected an installation result and valid date.');
      }
    } else if (section === 'studio') {
      keys(value, ['webPort', 'apiPort', 'tracing'], section);
      for (const field of ['webPort', 'apiPort']) check(port(value[field]), `studio.${field}`, 'Expected a whole number from 1024 to 65535.');
      check(value.webPort !== value.apiPort, 'studio.apiPort', 'Must differ from webPort.');
      if (!object(value.tracing)) errors.push('studio.tracing: expected an object.');
      else {
        keys(value.tracing, ['enabled', 'screenshots', 'snapshots', 'sources'], 'studio.tracing');
        for (const field of ['enabled', 'screenshots', 'snapshots', 'sources']) check(typeof value.tracing[field] === 'boolean', `studio.tracing.${field}`, 'Expected true or false.');
      }
    } else {
      keys(value, ['repositoryRoot', 'targetProject', 'solution', 'featurePatterns', 'sourcePatterns', 'selectorPatterns', 'referenceScope', 'ignoredDirectories'], section);
      check(typeof value.repositoryRoot === 'string' && value.repositoryRoot.trim().length > 0, 'workspace.repositoryRoot', 'Expected a non-empty path.');
      for (const field of ['targetProject', 'solution']) if (field in value) check(typeof value[field] === 'string', `workspace.${field}`, 'Expected a path string.');
      for (const field of ['featurePatterns', 'sourcePatterns', 'selectorPatterns', 'ignoredDirectories']) if (field in value) check(strings(value[field]), `workspace.${field}`, 'Expected an array of strings.');
      if ('referenceScope' in value) check(['TargetOnly', 'DirectReferences'].includes(value.referenceScope as string), 'workspace.referenceScope', 'Expected TargetOnly or DirectReferences.');
    }
  }
  return errors.length ? { errors } : { data: input as SettingsExport, errors };
}
