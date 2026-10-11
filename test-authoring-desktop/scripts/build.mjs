// Builds the desktop app:
//   1. the studio's React client (vite build → ../test-authoring-studio/dist), unless --skip-studio and it already exists;
//   2. the studio's Express API + search worker, bundled with esbuild into app/server (ESM, Node target);
//   3. resources the API expects under STUDIO_ROOT: dist/, fixtures/, scanner/bin/ (when built);
//   4. the Electron main process (ESM) and preload (CommonJS, required for sandboxed preloads) into out/.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const studio = path.resolve(root, '../test-authoring-studio');
const app = path.join(root, 'app');
const skipStudio = process.argv.includes('--skip-studio');
const step = (m) => console.log(`\x1b[36m›\x1b[0m ${m}`);

if (!existsSync(path.join(studio, 'package.json'))) throw new Error(`Studio not found at ${studio}`);
if (!skipStudio || !existsSync(path.join(studio, 'dist/index.html'))) {
  step('Building the studio client (vite)…');
  execSync('npm run build', { cwd: studio, stdio: 'inherit' });
}

rmSync(app, { recursive: true, force: true });
mkdirSync(path.join(app, 'server'), { recursive: true });

// ESM output that still needs `require` for CommonJS dependencies (express et al.).
const banner = { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" };
const external = ['playwright', 'playwright-core', 'chromium-bidi', 'fsevents', 'electron'];
step('Bundling the studio API…');
await build({
  entryPoints: [path.join(studio, 'server/index.ts')],
  outfile: path.join(app, 'server/index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true, banner, external,
  logLevel: 'warning',
  // The studio resolves node_modules from its own folder; point esbuild there too.
  nodePaths: [path.join(studio, 'node_modules')],
});
step('Bundling the search worker…');
await build({
  entryPoints: [path.join(studio, 'server/search-worker.mjs')],
  outfile: path.join(app, 'server/search-worker.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', banner, logLevel: 'warning',
  nodePaths: [path.join(studio, 'node_modules')],
});

step('Copying client, fixtures and scanner…');
cpSync(path.join(studio, 'dist'), path.join(app, 'dist'), { recursive: true });
cpSync(path.join(studio, 'fixtures'), path.join(app, 'fixtures'), { recursive: true, filter: (s) => !/[\\/](bin|obj)([\\/]|$)/.test(s) });
const scanner = path.join(studio, 'scanner/bin/Release');
if (existsSync(scanner)) cpSync(scanner, path.join(app, 'scanner/bin/Release'), { recursive: true });
else console.warn('  Scanner not built (npm run scanner:build in the studio); C# indexing will be unavailable.');
// settings.ts locates its root by package name when STUDIO_DATA is unset; keep that lookup working too.
writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'test-authoring-studio', private: true, type: 'module' }, null, 2));

step('Bundling Electron main and preload…');
await build({
  entryPoints: [path.join(root, 'src/main/main.ts')],
  outfile: path.join(root, 'out/main/main.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true, external: ['electron'], banner, logLevel: 'warning',
});
await build({
  entryPoints: [path.join(root, 'src/preload/preload.ts')],
  outfile: path.join(root, 'out/preload/preload.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], logLevel: 'warning',
});
step('Done.');
