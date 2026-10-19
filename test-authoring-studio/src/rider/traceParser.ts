/**
 * Analyze Stack Trace (Rider's Tools ▸ Analyze Stack Trace): a .NET stack trace (from a test failure, a log, a bug
 * report) with its frames' file:line turned into links into the solution.
 */
export type Frame = { method: string; file?: string; line?: number; raw: string };
export function parseStackTrace(text: string): Frame[] {
  const out: Frame[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*at\s+(.+?)(?:\s+in\s+(.+?):line\s+(\d+))?\s*$/.exec(raw);
    if (m) out.push({ method: m[1], file: m[2], line: m[3] ? Number(m[3]) : undefined, raw });
  }
  return out;
}
/** The repository file a frame's (absolute, machine-specific) path refers to: the longest path suffix that matches. */
export function matchFile(path: string, files: string[]) {
  const parts = path.replace(/\\/g, '/').split('/');
  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.slice(i).join('/');
    const hit = files.find((f) => f.toLowerCase() === suffix.toLowerCase());
    if (hit) return hit;
  }
  const name = parts.at(-1)?.toLowerCase();
  return files.find((f) => f.toLowerCase().endsWith(`/${name}`) || f.toLowerCase() === name);
}
