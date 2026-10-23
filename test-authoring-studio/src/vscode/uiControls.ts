import { defineSetting, importSettings, onSettingsChanged } from './settings';

/** Guide Me stays available from Help and the command palette. */
export const showGuideMe = defineSetting<boolean>({ key: 'general.showGuideMe', category: 'General', title: 'Show Guide Me button', type: 'boolean', default: false, description: 'Show the guided tour button in the title bar.' });

/** Workbench button visibility in web and desktop. The underlying commands and shortcuts are unchanged. */
const controls = [
  // Activity bar
  ['activity-dashboard', 'Dashboard', true, ''],
  ['activity-features', 'Features', true, ''],
  ['activity-search', 'Search', true, ''],
  ['activity-testing', 'Test Explorer', true, ''],
  ['activity-git', 'Git Changes', true, ''],
  ['activity-generator', 'Test Generator', true, ''],
  ['activity-recorder', 'Playwright Recorder', true, ''],
  ['activity-dictionary', 'Dictionary Inspector', true, ''],
  ['activity-design', 'Test Design', true, ''],
  ['activity-steps', 'Step Catalog', true, ''],
  ['activity-backgrounds', 'Backgrounds', true, ''],
  ['activity-selectors', 'Selectors', true, ''],
  ['activity-project', 'Project Explorer', true, ''],
  // Title bar
  ['nav-back', 'Go Back', true, '.app-header .nav-buttons button[aria-label="Go Back"]'],
  ['nav-forward', 'Go Forward', true, '.app-header .nav-buttons button[aria-label="Go Forward"]'],
  ['search-options', 'Search Options', false, '.app-header .command-center-more'],
  ['layout-customize', 'Customize Layout', false, '.app-header .layout-controls button[aria-label="Customize Layout…"]'],
  ['layout-sidebar', 'Toggle Primary Side Bar', true, '.app-header .layout-controls button[aria-label="Toggle Primary Side Bar"]'],
  ['layout-panel', 'Toggle Panel', true, '.app-header .layout-controls button[aria-label="Toggle Panel"]'],
  ['layout-secondary', 'Toggle Secondary Side Bar', false, '.app-header .layout-controls button[aria-label="Toggle Secondary Side Bar"]'],
  // Explorer
  ['explorer-sync', 'Sync with Active Document', false, '.solution-explorer .se-tools button[aria-label="Sync with Active Document"]'],
  ['explorer-track', 'Track Active Item', false, '.solution-explorer .se-tools button[aria-label^="Track Active Item:"]'],
  ['explorer-pending', 'Pending changes filter', false, '.solution-explorer .se-tools button[aria-label="Pending changes filter"], .solution-explorer .se-tools button[aria-label="Show all changes filter off"]'],
  ['explorer-open', 'Open files filter', false, '.solution-explorer .se-tools button[aria-label="Open files filter"], .solution-explorer .se-tools button[aria-label="Open files filter off"]'],
  ['explorer-new-file', 'New File', true, '.solution-explorer .se-tools button[aria-label="New File…"]'],
  ['explorer-refresh', 'Refresh Explorer', false, '.solution-explorer .se-tools button[aria-label="Refresh Explorer"]'],
  ['explorer-collapse', 'Collapse all folders', false, '.solution-explorer .se-tools button[aria-label="Collapse all folders"]'],
  ['explorer-all-files', 'Show all files', false, '.solution-explorer .se-tools button[aria-label="Show all files"]'],
  ['explorer-new-feature', 'New feature', true, '.solution-explorer .se-tools button[aria-label="New feature"]'],
  ['explorer-find-mode', 'Explorer find mode', false, '.solution-explorer .find-mode'],
  // Editor tabs and feature editor
  ['editor-debug', 'Debug feature', false, '.editor-tab-actions button[aria-label="Debug"]'],
  ['editor-step-definitions', 'Step definitions', false, '.editor-tab-actions button[aria-label="Step definitions"]'],
  ['editor-validate', 'Validate feature', true, '.editor-tab-actions button[aria-label="Validate"]'],
  ['editor-run-tests', 'Run feature tests', true, '.editor-tab-actions button[aria-label="Run tests"]'],
  ['editor-review', 'Review changes', false, '.editor-tab-actions button[aria-label="Review changes (diff)"]'],
  ['editor-fullscreen', 'Full screen feature editor', false, '.gherkin-editor .editor-toolbar button[aria-label="Full screen editor"]'],
  ['editor-opened-list', 'Show opened editors', false, '.editor-tabs button[aria-label="Show opened editors"]'],
  ['panel-move', 'Move panel', false, '.dock-bar .dock-move'],
  ['panel-maximize', 'Maximize panel', true, '.dock-bar .dock-maximize'],
  // Test Explorer
  ['tests-run-all', 'Run All Tests', true, '.test-explorer button[aria-label="Run All Tests"]'],
  ['tests-run-selected', 'Run selected tests', true, '.test-explorer button[aria-label="Run selected tests"]'],
  ['tests-debug-selected', 'Debug selected test', true, '.test-explorer button[aria-label="Debug selected test"]'],
  ['tests-coverage', 'Analyze Code Coverage', false, '.test-explorer button[aria-label="Analyze Code Coverage for All Tests"]'],
  ['tests-run-failed', 'Run Failed Tests', false, '.test-explorer button[aria-label="Run Failed Tests"]'],
  ['tests-slowest', 'Slowest tests', false, '.test-explorer button[aria-label="Slowest tests"]'],
  ['tests-continuous', 'Continuous testing', false, '.test-explorer button[aria-label="Continuous testing"]'],
  ['tests-environment', 'Test environment variables', false, '.test-explorer button[aria-label="Test environment variables"]'],
  ['tests-impacted', 'Run impacted tests', false, '.test-explorer button[aria-label="Run impacted tests"]'],
  ['tests-export', 'Export results as CSV', false, '.test-explorer button[aria-label="Export results as CSV"]'],
  ['tests-copy-summary', 'Copy results summary', false, '.test-explorer button[aria-label="Copy results summary"]'],
  ['tests-failed-filter', 'Show only failed tests', false, '.test-explorer button[aria-label="Show only failed tests"]'],
  ['tests-refresh', 'Refresh tests', true, '.test-explorer button[aria-label="Refresh tests"]'],
  // Build window
  ['build-solution', 'Build Solution', true, '.build-panel button[aria-label="Build Solution"]'],
  ['build-rebuild', 'Rebuild Solution', false, '.build-panel button[aria-label="Rebuild Solution"]'],
  ['build-clean', 'Clean Solution', false, '.build-panel button[aria-label="Clean Solution"]'],
  ['build-copy-errors', 'Copy all errors', false, '.build-panel button[aria-label="Copy all errors"]'],
  ['build-copy-output', 'Copy Output', false, '.build-panel button[aria-label="Copy Output"]'],
  ['build-clear-output', 'Clear Output', false, '.build-panel button[aria-label="Clear All"]'],
  ['build-wrap-output', 'Toggle Word Wrap', false, '.build-panel button[aria-label="Toggle Word Wrap"]'],
  // Debug window
  ['debug-restart', 'Restart debugging', false, '.debug-panel:not(.build-panel) .debug-toolbar button[aria-label="Restart"]'],
  ['debug-break-all', 'Break All', false, '.debug-panel:not(.build-panel) .debug-toolbar button[aria-label="Break All"]'],
  ['debug-step-into', 'Step Into', true, '.debug-panel:not(.build-panel) .debug-toolbar button[aria-label="Step Into"]'],
  ['debug-step-over', 'Step Over', true, '.debug-panel:not(.build-panel) .debug-toolbar button[aria-label="Step Over"]'],
  ['debug-step-out', 'Step Out', true, '.debug-panel:not(.build-panel) .debug-toolbar button[aria-label="Step Out"]'],
  ['debug-delete-breakpoints', 'Delete all breakpoints', false, '.debug-panel:not(.build-panel) button[aria-label="Delete all breakpoints"]'],
  ['debug-disable-breakpoints', 'Disable all breakpoints', false, '.debug-panel:not(.build-panel) button[aria-label="Disable all breakpoints"]'],
  ['debug-enable-breakpoints', 'Enable all breakpoints', false, '.debug-panel:not(.build-panel) button[aria-label="Enable all breakpoints"]'],
  // Status bar
  ['status-remote', 'Remote window actions', true, '.status-bar button[aria-label="Open a Remote Window"]'],
  ['status-rescan', 'Rescan repository', true, '.status-bar button[aria-label="Rescan repository"]'],
  ['status-diagnostics', 'Diagnostics', false, '.status-bar button[aria-label="Open diagnostics"]'],
] as const satisfies readonly (readonly [string, string, boolean, string])[];

const getters = Object.fromEntries(controls.map(([id, title, essential]) => [id, defineSetting<boolean>({
  key: `workbench.controls.${id}`, category: 'Workbench ▸ Buttons', title, type: 'boolean', default: essential,
  description: id.startsWith('activity-') ? 'Visible in the activity bar when this page is enabled' : 'Visible in the workbench',
})])) as Record<string, () => boolean>;

export const controlVisible = (id: string) => getters[id]?.() ?? true;
export const setControlProfile = () => importSettings(JSON.stringify(Object.fromEntries(controls.map(([id, , essential]) => [`workbench.controls.${id}`, essential]))));
export const activityControlId: Record<string, string> = {
  Dashboard: 'activity-dashboard', Features: 'activity-features', Search: 'activity-search', Testing: 'activity-testing', Git: 'activity-git',
  'Test Generator': 'activity-generator', Recorder: 'activity-recorder', 'Dictionary Inspector': 'activity-dictionary',
  'Test Design': 'activity-design', 'Step Catalog': 'activity-steps', Backgrounds: 'activity-backgrounds', Selectors: 'activity-selectors', 'Project Explorer': 'activity-project',
};

const applyVisibility = () => {
  if (typeof document === 'undefined') return;
  const css = controls.filter(([id, , , selector]) => selector && !controlVisible(id)).map(([, , , selector]) => `${selector}{display:none !important}`).join('\n');
  let style = document.getElementById('workbench-control-visibility') as HTMLStyleElement | null;
  if (!style) { style = document.createElement('style'); style.id = 'workbench-control-visibility'; document.head.append(style); }
  style.textContent = css;
};
if (typeof window !== 'undefined') { onSettingsChanged(applyVisibility); applyVisibility(); }
