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
  await fs.rm(fixtures, { recursive: true, force: true });
  await fs.cp(snapshot, fixtures, { recursive: true });
  await fs.rm(snapshot, { recursive: true, force: true });
}
export default async function globalSetup() {
  await snapshotFixtures();
  return async () => restoreFixtures();
}
