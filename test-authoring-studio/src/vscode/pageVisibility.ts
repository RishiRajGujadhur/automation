import { defineSetting, setSetting } from './settings';

/** Optional pages and side views. The feature editor is always available. */
const pages = [
  ['Dashboard', 'Dashboard'],
  ['Test Generator', 'Test Generator'],
  ['Recorder', 'Playwright Recorder'],
  ['Scenario Builder', 'Scenario Builder'],
  ['Spy', 'Spy'],
  ['Dictionary Inspector', 'Dictionary Inspector'],
  ['Test Design', 'Test Design'],
  ['Step Catalog', 'Step Catalog'],
  ['Backgrounds', 'Backgrounds'],
  ['Selectors', 'Selectors'],
  ['Project Explorer', 'Project Explorer'],
  ['Config', 'Config'],
  ['Search', 'Search'],
  ['Testing', 'Test Explorer'],
  ['Git', 'Git Changes'],
] as const;

const keyOf = (name: string) => `workbench.pages.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const aliases: Record<string, string> = { 'Playwright Recorder': 'Recorder', 'Feature Editor': 'Features', 'Git Changes': 'Git', 'Test Explorer': 'Testing' };
const activityButtons: Record<string, string> = {
  Dashboard: 'activity-dashboard', 'Test Generator': 'activity-generator', Recorder: 'activity-recorder',
  'Dictionary Inspector': 'activity-dictionary', 'Test Design': 'activity-design', 'Step Catalog': 'activity-steps',
  Backgrounds: 'activity-backgrounds', Selectors: 'activity-selectors', 'Project Explorer': 'activity-project',
  Search: 'activity-search', Testing: 'activity-testing', Git: 'activity-git',
};
const getters = Object.fromEntries(pages.map(([id, title]) => [id, defineSetting<boolean>({
  key: keyOf(id), category: 'Pages', title, type: 'boolean', default: false,
  description: 'Show in navigation',
})])) as Record<string, () => boolean>;

export const pageVisible = (name: string) => {
  if (name === 'Features' || name === 'Editor') return true;
  return getters[aliases[name] ?? name]?.() ?? true;
};

export const setPageVisible = (name: string, visible: boolean) => {
  const id = aliases[name] ?? name;
  setSetting(keyOf(id), visible);
  if (visible && activityButtons[id]) setSetting(`workbench.controls.${activityButtons[id]}`, true);
};
