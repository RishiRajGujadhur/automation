import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const local = path.resolve('../.tools/dotnet/dotnet.exe');
const exe = process.env.DOTNET_PATH || (existsSync(local) ? local : 'dotnet');
const result = spawnSync(exe, ['build', 'langserver/LangServer.csproj', '-c', 'Release'], {
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) console.error('Install .NET 10 SDK or set DOTNET_PATH.', result.error.message);
process.exit(result.status ?? 1);
