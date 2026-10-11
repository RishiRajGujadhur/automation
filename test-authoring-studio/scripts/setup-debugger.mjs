// Downloads netcoredbg (Samsung, MIT licence): the .NET debugger behind the studio's Debug windows.
// Usage: node scripts/setup-debugger.mjs [outDir]   (default: ../.tools/netcoredbg)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const out = path.resolve(process.argv[2] ?? path.join(here, '../../.tools/netcoredbg'));
const version = '3.2.0-1092';
const asset = { win32: 'netcoredbg-win64.zip', linux: `netcoredbg-linux-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tar.gz`, darwin: 'netcoredbg-osx-arm64.zip' }[process.platform];
const exe = process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg';
if (!asset) throw new Error(`netcoredbg has no build for ${process.platform}.`);
if (existsSync(path.join(out, exe)) && !process.argv.includes('--force')) {
  console.log(`netcoredbg already installed in ${out}`);
  process.exit(0);
}
const url = `https://github.com/Samsung/netcoredbg/releases/download/${version}/${asset}`;
console.log(`Downloading ${url}`);
const r = await fetch(url);
if (!r.ok) throw new Error(`Download failed: ${r.status} ${r.statusText}`);
const temp = mkdtempSync(path.join(os.tmpdir(), 'netcoredbg-'));
try {
  const archive = path.join(temp, asset);
  writeFileSync(archive, Buffer.from(await r.arrayBuffer()));
  const unpacked = path.join(temp, 'x');
  mkdirSync(unpacked);
  // bsdtar (Windows 10+, macOS) reads zip and tar.gz alike.
  // Windows' own tar.exe, not a GNU tar from Git Bash that may come first on PATH (it reads no zip).
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', archive, '-C', unpacked], { stdio: 'inherit' });
  const inner = readdirSync(unpacked).length === 1 && existsSync(path.join(unpacked, 'netcoredbg')) ? path.join(unpacked, 'netcoredbg') : unpacked;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(inner, out, { recursive: true });
  console.log(`netcoredbg ${version} installed in ${out}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
