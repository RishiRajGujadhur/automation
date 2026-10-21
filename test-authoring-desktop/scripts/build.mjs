// Builds the desktop app:
//   1. the studio's React client (vite build → ../test-authoring-studio/dist), unless --skip-studio and it already exists;
//   2. the studio's Express API + search worker, bundled with esbuild into studio/server (ESM, Node target);
//   3. resources the API expects under STUDIO_ROOT: dist/, fixtures/, scanner/bin/ (when built);
//   4. the Electron main process (ESM) and preload (CommonJS, required for sandboxed preloads) into out/.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
// CommonJS code in the ESM bundle (ESLint's config loader) reads require and __filename / __dirname.
const banner = { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" };
// typescript5 (the front-end language service) loads its lib.*.d.ts files from its own folder, so it stays a real module.
// ESLint + react-hooks + Babel's parser (front-end Hooks checks) resolve files at run time: copied, not bundled.
const HOOKS_LINT = ['eslint', 'eslint-plugin-react-hooks', '@babel/eslint-parser', '@babel/core'];
const external = ['playwright', 'playwright-core', 'chromium-bidi', 'fsevents', 'electron', 'typescript5', ...HOOKS_LINT];
step('Bundling the studio API…');
await build({
  entryPoints: [path.join(studio, 'server/index.ts')],
  outfile: path.join(app, 'server/index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true, banner, external,
  logLevel: 'warning',
  // VS Code's HTML / CSS language services: their ESM build (the UMD one loads its parts with require calls esbuild
  // cannot follow).
  alias: { 'vscode-css-languageservice': path.join(studio, 'node_modules/vscode-css-languageservice/lib/esm/cssLanguageService.js'), 'vscode-html-languageservice': path.join(studio, 'node_modules/vscode-html-languageservice/lib/esm/htmlLanguageService.js') },
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
// A cached publish is reused only while its sources (.cs / .csproj) are older than it.
const newestSource = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((t, e) => (e.name === 'bin' || e.name === 'obj' ? t : e.isDirectory() ? Math.max(t, newestSource(path.join(dir, e.name))) : /\.(cs|csproj)$/.test(e.name) ? Math.max(t, statSync(path.join(dir, e.name)).mtimeMs) : t), 0);
const stale = (exe, src) => !existsSync(exe) || statSync(exe).mtimeMs < newestSource(src);
if (stale(path.join(scannerOut, exeName), path.join(studio, 'scanner')) || process.argv.includes('--scanner')) {
  step(`Publishing the self-contained scanner (${rid})…`);
  const localSdk = path.resolve(root, '../.tools/dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
  const dotnet = process.env.DOTNET_PATH || (existsSync(localSdk) ? localSdk : 'dotnet');
  try {
    execSync(`"${dotnet}" publish "${path.join(studio, 'scanner/Scanner.csproj')}" -c Release -r ${rid} --self-contained true -p:PublishSingleFile=false -p:PublishReadyToRun=true -o "${scannerOut}"`, { stdio: 'inherit' });
  } catch {
    console.warn('  Scanner publish failed (needs the .NET 10 SDK); C# indexing will need an installed .NET runtime.');
  }
}
if (existsSync(path.join(scannerOut, exeName))) cpSync(scannerOut, path.join(app, 'scanner', rid), { recursive: true });
// Self-contained C# language service (IntelliSense, go to definition, rename, organize usings). Cached between builds.
const langOut = path.join(root, '.cache/langserver', rid);
const langExe = process.platform === 'win32' ? 'LangServer.exe' : 'LangServer';
if (stale(path.join(langOut, langExe), path.join(studio, 'langserver')) || process.argv.includes('--scanner')) {
  step(`Publishing the self-contained C# language service (${rid})…`);
  const localSdk = path.resolve(root, '../.tools/dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
  const dotnet = process.env.DOTNET_PATH || (existsSync(localSdk) ? localSdk : 'dotnet');
  try {
    execSync(`"${dotnet}" publish "${path.join(studio, 'langserver/LangServer.csproj')}" -c Release -r ${rid} --self-contained true -p:PublishReadyToRun=true -o "${langOut}"`, { stdio: 'inherit' });
  } catch {
    console.warn('  Language service publish failed (needs the .NET 10 SDK); C# IntelliSense will be unavailable.');
  }
}
if (existsSync(path.join(langOut, langExe))) cpSync(langOut, path.join(app, 'langserver', rid), { recursive: true });
// netcoredbg for the Debug windows (breakpoints, stepping, watch). Cached between builds.
const debuggerOut = path.join(root, '.cache/netcoredbg', rid);
try {
  execSync(`node "${path.join(studio, 'scripts/setup-debugger.mjs')}" "${debuggerOut}"`, { stdio: 'inherit' });
  cpSync(debuggerOut, path.join(app, 'netcoredbg'), { recursive: true });
} catch {
  console.warn('  netcoredbg download failed; debugging will need netcoredbg on PATH.');
}
const scanner = path.join(studio, 'scanner/bin/Release');
if (!existsSync(path.join(scannerOut, exeName)) && existsSync(scanner)) cpSync(scanner, path.join(app, 'scanner/bin/Release'), { recursive: true });
// The API bundle sits outside app.asar (worker threads and the scanner need real files), so modules it keeps
// external must sit beside it: Playwright drives the recorder and selector verification; typescript5 is the
// front-end language service (installed with the studio, not the desktop app).
for (const mod of ['playwright', 'playwright-core', 'typescript5']) {
  const src = [path.join(root, 'node_modules', mod), path.join(studio, 'node_modules', mod)].find((p) => existsSync(p));
  if (src) cpSync(src, path.join(app, 'node_modules', mod), { recursive: true, dereference: true });
  else console.warn(`  ${mod} not installed; ${mod === 'typescript5' ? 'JavaScript / TypeScript features' : 'recording'} will be unavailable.`);
}
// ESLint, the React Hooks rules and Babel's parser (FRONTEND-100.md F46–F48) resolve their own files at run time,
// so they stay external too: each is copied with its dependencies (the studio's flat node_modules).
const copied = new Set();
const copyWithDeps = (mod) => {
  if (copied.has(mod)) return;
  copied.add(mod);
  const src = path.join(studio, 'node_modules', mod);
  if (!existsSync(src)) return;
  cpSync(src, path.join(app, 'node_modules', mod), { recursive: true, dereference: true });
  const pkg = JSON.parse(readFileSync(path.join(src, 'package.json'), 'utf8'));
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) copyWithDeps(dep);
};
for (const mod of HOOKS_LINT) copyWithDeps(mod);
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
