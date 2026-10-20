/** Text helpers for project files shared by the client (CSHARP-20.md). */

/** NoWarn with a code added (Suppress ▸ In Project File): keeps $(NoWarn) first and existing codes, no repeats. */
export function addNoWarn(current: string | undefined, code: string) {
  const parts = (current ?? '').split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === code.toLowerCase())) return null;
  const rest = parts.filter((p) => p !== '$(NoWarn)');
  return ['$(NoWarn)', ...rest, code].join(';');
}

/**
 * Tidy Project File: PackageReference / ProjectReference / Using items sorted by Include inside each ItemGroup (one-line
 * items only), empty groups removed, trailing spaces trimmed, blank-line runs collapsed, one final newline.
 */
export function tidyProject(xml: string) {
  const eol = xml.includes('\r\n') ? '\r\n' : '\n';
  let out = xml.replace(/[ \t]+(\r?\n)/g, '$1');
  out = out.replace(/(<ItemGroup[^>]*>)([\s\S]*?)(\n[ \t]*<\/ItemGroup>)/g, (all, open: string, body: string, close: string) => {
    const lines = body.split(/\r?\n/).slice(1);
    const sortable = lines.length > 1 && lines.every((l) => /^\s*<(PackageReference|ProjectReference|Using)\s+Include="[^"]*"[^>]*\/>\s*$/.test(l));
    if (!sortable) return all;
    const key = (l: string) => /Include="([^"]*)"/.exec(l)![1].toLowerCase();
    return `${open}${eol}${[...lines].sort((a, b) => key(a).localeCompare(key(b))).join(eol)}${close}`;
  });
  out = out.replace(/[ \t]*<(ItemGroup|PropertyGroup)(\s[^>]*)?>\s*<\/\1>[ \t]*\r?\n?/g, '');
  out = out.replace(/(\r?\n){3,}/g, `${eol}${eol}`);
  return out.replace(/\s*$/, '') + eol;
}

/** The folders from a project's folder up to the repository root, nearest first ('' = root). */
export function foldersUp(project: string) {
  const parts = project.split('/').slice(0, -1);
  return Array.from({ length: parts.length + 1 }, (_, i) => parts.slice(0, parts.length - i).join('/'));
}
export const DIRECTORY_BUILD_PROPS = '<Project>\n  <!-- Settings shared by every project in this folder and below (Directory.Build.props). -->\n  <PropertyGroup>\n  </PropertyGroup>\n</Project>\n';
