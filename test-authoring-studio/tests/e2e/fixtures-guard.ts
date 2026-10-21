import fs from 'node:fs/promises';
import path from 'node:path';

// The browser suite drives a live app pointed at fixtures/. Snapshot it before the run and restore it
// afterwards so an interrupted or failing test can never leave modified fixtures for the unit tests.
const root = path.resolve(import.meta.dirname, '../..');
const fixtures = path.join(root, 'fixtures');
const snapshot = path.join(root, '.local/fixtures-snapshot');

export async function snapshotFixtures() {
  await fs.rm(snapshot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(snapshot), { recursive: true });
  await fs.cp(fixtures, snapshot, { recursive: true });
}
export async function restoreFixtures() {
  try {
    await fs.access(snapshot);
  } catch {
    return;
  }
  // A shell the app started in fixtures/ (Terminal) can hold it for a moment after the run.
  await fs.rm(fixtures, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  await fs.cp(snapshot, fixtures, { recursive: true });
  await fs.rm(snapshot, { recursive: true, force: true });
}
/**
 * Specs that open another folder restore the workspace in `finally`, but a test that times out loses its request
 * context first. Point the dev server back at fixtures/ at the end of every run, whatever happened.
 */
async function resetWorkspace() {
  try {
    const { readSettings } = await import('../../server/settings');
    const { apiPort } = readSettings();
    await fetch(`http://127.0.0.1:${apiPort}/api/workspace`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repositoryRoot: fixtures, targetProject: '.', solution: '' }) });
  } catch { /* server already stopped */ }
}
export default async function globalSetup() {
  await snapshotFixtures();
  return async () => { await resetWorkspace(); await restoreFixtures(); };
}
