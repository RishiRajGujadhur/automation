// Runs the Electron tests against the packaged app copied OUTSIDE the project, like a real install.
// Inside the repo, Node can resolve modules from the dev node_modules up the tree and hide packaging bugs.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const src = path.resolve('release/win-unpacked');
const dir = mkdtempSync(path.join(os.tmpdir(), 'tas-install-'));
console.log(`Copying the packaged app to ${dir}`);
cpSync(src, dir, { recursive: true });
try {
  execSync('npx playwright test', { stdio: 'inherit', env: { ...process.env, TAS_EXE: path.join(dir, 'TestAuthoring Studio.exe') } });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
