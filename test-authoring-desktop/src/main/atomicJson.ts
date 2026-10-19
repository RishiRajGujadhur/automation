import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Read only JSON objects; truncated files and scalar JSON must not replace settings. */
export function readObject(file: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

function replace(file: string, contents: string) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx', flush: true });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Preserve the previous valid state before atomically replacing the primary file. */
export function writeObject(file: string, next: object) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const contents = JSON.stringify(next, null, 2);
  const previous = readObject(file);
  if (previous) replace(`${file}.bak`, JSON.stringify(previous, null, 2));
  else if (!readObject(`${file}.bak`)) replace(`${file}.bak`, contents);
  replace(file, contents);
}
