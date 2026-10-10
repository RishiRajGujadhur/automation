import fs from 'node:fs/promises';
import path from 'node:path';
import { configSchema, scan, confined, projectRoot } from './core.js';
const [command, ...args] = process.argv.slice(2);
const rootFlag = args.indexOf('--root');
const root = rootFlag >= 0 ? path.resolve(args[rootFlag + 1]) : path.join(projectRoot, 'fixtures');
const index = await scan(configSchema.parse({ repositoryRoot: root }));
if (command === 'scan') console.log(JSON.stringify(index, null, 2));
else if (command === 'search') {
  const [kind, query = ''] = args;
  const items =
    kind === 'backgrounds'
      ? index.features.flatMap((f) => f.backgrounds)
      : kind === 'selectors'
        ? index.selectors
        : index.stepDefinitions;
  console.log(
    JSON.stringify(
      items.filter((x) => JSON.stringify(x).toLowerCase().includes(query.toLowerCase())),
      null,
      2,
    ),
  );
} else if (command === 'show') {
  const [file, line = '1'] = args[0].split(/:(?=\d+$)/);
  const content = (await fs.readFile(await confined(root, file), 'utf8')).split(/\r?\n/);
  console.log(
    content
      .slice(Math.max(0, +line - 4), +line + 6)
      .map((v, i) => `${Math.max(1, +line - 3) + i}: ${v}`)
      .join('\n'),
  );
} else
  throw new Error(
    'Usage: npm run cli -- scan|search steps|backgrounds|selectors <query>|show <file:line> [--root <path>]',
  );
