import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Studio-level settings (not workspace settings). Shared by the API server, vite.config.ts and
 * playwright.config.ts, so it must stay dependency-light and synchronous.
 * Environment variables win over the file: STUDIO_WEB_PORT, STUDIO_API_PORT.
 */
// Locate the studio root by its package.json; vite bundles this file into a temp config elsewhere.
function findRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try {
      if (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name === 'test-authoring-studio') return dir;
    } catch {
      /* keep walking */
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}
const root = process.env.STUDIO_DATA ? path.resolve(process.env.STUDIO_DATA) : findRoot();
export const settingsFile = path.join(root, '.local/settings.json');
export const tracesDir = path.join(root, '.local/traces');

const port = z.coerce.number().int().min(1024, 'Use a port from 1024 to 65535.').max(65535, 'Use a port from 1024 to 65535.');
export const settingsSchema = z
  .object({
    webPort: port.default(5173),
    apiPort: port.default(4310),
    tracing: z
      .object({
        enabled: z.boolean().default(false),
        screenshots: z.boolean().default(true),
        snapshots: z.boolean().default(true),
        sources: z.boolean().default(false),
      })
      .default({ enabled: false, screenshots: true, snapshots: true, sources: false }),
  })
  .refine((s) => s.webPort !== s.apiPort, { message: 'The web and API ports must differ.', path: ['apiPort'] });
export type StudioSettings = z.infer<typeof settingsSchema>;

export function readSettings(): StudioSettings {
  let file: unknown = {};
  try {
    file = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    /* defaults */
  }
  const parsed = settingsSchema.safeParse(file);
  const s = parsed.success ? parsed.data : settingsSchema.parse({});
  return {
    ...s,
    webPort: Number(process.env.STUDIO_WEB_PORT) || s.webPort,
    apiPort: Number(process.env.STUDIO_API_PORT) || s.apiPort,
  };
}
export function writeSettings(next: StudioSettings) {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(next, null, 2) + '\n', 'utf8');
}
