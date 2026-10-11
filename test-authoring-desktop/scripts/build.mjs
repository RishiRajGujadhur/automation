// Builds the desktop app:
//   1. the studio's React client (vite build → ../test-authoring-studio/dist), unless --skip-studio and it already exists;
//   2. the studio's Express API + search worker, bundled with esbuild into studio/server (ESM, Node target);
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
const app = path.join(root, 'studio');
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
// Self-contained Roslyn scanner (no .NET install needed on the user's machine). Cached between builds.
const rid = process.platform === 'win32' ? 'win-x64' : process.platform === 'darwin' ? 'osx-arm64' : 'linux-x64';
const scannerOut = path.join(root, '.cache/scanner', rid);
const exeName = process.platform === 'win32' ? 'Scanner.exe' : 'Scanner';
if (!existsSync(path.join(scannerOut, exeName)) || process.argv.includes('--scanner')) {
  step(`Publishing the self-contained scanner (${rid})…`);
  const localSdk = path.resolve(root, '../.tools/dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
  const dotnet = process.env.DOTNET_PATH || (existsSync(localSdk) ? localSdk : 'dotnet');
  try {
    execSync(`"${dotnet}" publish "${path.join(studio, 'scanner/Scanner.csproj')}" -c Release -r ${rid} --self-contained true -p:PublishSingleFile=false -o "${scannerOut}"`, { stdio: 'inherit' });
  } catch {
    console.warn('  Scanner publish failed (needs the .NET 10 SDK); C# indexing will need an installed .NET runtime.');
  }
}
if (existsSync(path.join(scannerOut, exeName))) cpSync(scannerOut, path.join(app, 'scanner', rid), { recursive: true });
const scanner = path.join(studio, 'scanner/bin/Release');
if (!existsSync(path.join(scannerOut, exeName)) && existsSync(scanner)) cpSync(scanner, path.join(app, 'scanner/bin/Release'), { recursive: true });
// The API bundle sits outside app.asar (worker threads and the scanner need real files), so modules it keeps
// external must sit beside it: Playwright drives the recorder and selector verification.
for (const mod of ['playwright', 'playwright-core']) {
  const src = path.join(root, 'node_modules', mod);
  if (existsSync(src)) cpSync(src, path.join(app, 'node_modules', mod), { recursive: true, dereference: true });
  else console.warn(`  ${mod} not installed; recording will be unavailable.`);
}
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
