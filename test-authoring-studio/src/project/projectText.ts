/** Text helpers for project files shared by the client (CSHARP-20.md). */

/** NoWarn with a code added (Suppress ▸ In Project File): keeps $(NoWarn) first and existing codes, no repeats. */
export function addNoWarn(current: string | undefined, code: string) {
  const parts = (current ?? '').split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === code.toLowerCase())) return null;
  const rest = parts.filter((p) => p !== '$(NoWarn)');
  return ['$(NoWarn)', ...rest, code].join(';');
}
