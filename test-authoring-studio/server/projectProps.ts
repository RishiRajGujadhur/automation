/**
 * Project Properties (Visual Studio 2026's project property pages) over SDK-style .csproj text: read the properties of
 * each PropertyGroup and change one property at a time, keeping the file's own layout, comments and line endings.
 * Evaluated values (SDK defaults, Directory.Build.props) come from the .NET SDK: `dotnet msbuild -getProperty`.
 */
import { command, dotnet } from './core.js';

const GROUP = /([ \t]*)<PropertyGroup(\s+Condition\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/PropertyGroup>/g;
const NAME = /^[A-Za-z_][\w.-]*$/;
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (v: string) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The configuration a PropertyGroup condition selects: '$(Configuration)'=='Debug' or '$(Configuration)|$(Platform)'=='Debug|AnyCPU'. */
export function configOf(condition?: string) {
  if (!condition) return undefined;
  const m = /^\s*'\$\(Configuration\)(?:\|\$\(Platform\))?'\s*==\s*'([^'|]+)(?:\|[^']*)?'\s*$/.exec(condition);
  return m ? m[1] : null;
}

/** Properties of the unconditioned groups (`all`) and of each configuration's groups; other conditions are skipped. */
export function readProperties(xml: string) {
  const all: Record<string, string> = {};
  const byConfig: Record<string, Record<string, string>> = {};
  for (const g of xml.matchAll(GROUP)) {
    const cfg = configOf(g[3]);
    if (cfg === null) continue;
    const target = cfg ? (byConfig[cfg] ??= {}) : all;
    for (const p of g[4].matchAll(/<([A-Za-z_][\w.-]*)(\s+Condition\s*=\s*"[^"]*")?\s*(?:\/>|>([\s\S]*?)<\/\1>)/g)) if (!p[2]) target[p[1]] = unesc((p[3] ?? '').trim());
  }
  return { all, byConfig };
}

const conditionFor = (config: string) => `'$(Configuration)'=='${config}'`;
/** The indentation one level inside an element whose own indentation is `outer` (from the file's first nested line). */
function unitOf(xml: string) { return /\n([ \t]+)</.exec(xml)?.[1] ?? '  '; }

/**
 * Sets (or with `value` null removes) a property in the unconditioned group, or in `config`'s group. A new property
 * goes at the end of the group; a missing group is added after the last PropertyGroup (or first thing in <Project>).
 */
export function setProperty(xml: string, name: string, value: string | null, config?: string) {
  if (!NAME.test(name)) throw new Error(`"${name}" is not a property name.`);
  const eol = xml.includes('\r\n') ? '\r\n' : '\n';
  const unit = unitOf(xml);
  const groups = [...xml.matchAll(GROUP)].map((g) => ({ start: g.index!, end: g.index! + g[0].length, indent: g[1], cfg: configOf(g[3]), body: g[4], bodyStart: g.index! + g[0].indexOf('>') + 1 }));
  const target = groups.find((g) => (config ? g.cfg === config : g.cfg === undefined));
  const prop = new RegExp(`([ \\t]*)<${name.replace(/\./g, '\\.')}\\s*(?:/>|>[\\s\\S]*?</${name.replace(/\./g, '\\.')}>)[ \\t]*(\\r?\\n)?`);
  if (target) {
    const m = prop.exec(target.body);
    if (m) {
      const from = target.bodyStart + m.index!, to = from + m[0].length;
      if (value === null) {
        let next = xml.slice(0, from) + xml.slice(to);
        // A configuration group left empty goes too (with its line).
        const left = config ? [...next.matchAll(GROUP)].find((g) => configOf(g[3]) === config) : undefined;
        if (left && !/<[A-Za-z]/.test(left[4])) {
          let e = left.index! + left[0].length;
          if (next.startsWith('\r\n', e)) e += 2; else if (next[e] === '\n') e++;
          next = next.slice(0, left.index!) + next.slice(e);
        }
        return next;
      }
      return xml.slice(0, from) + `${m[1]}<${name}>${esc(value)}</${name}>${m[2] ?? ''}` + xml.slice(to);
    }
    if (value === null) return xml;
    const close = target.end - '</PropertyGroup>'.length;
    const inner = /\n([ \t]+)</.exec(target.body)?.[1] ?? target.indent + unit;
    const before = xml.slice(0, close).replace(/[ \t]*$/, '');
    return `${before}${before.endsWith('\n') ? '' : eol}${inner}<${name}>${esc(value)}</${name}>${eol}${target.indent}</PropertyGroup>${xml.slice(target.end)}`;
  }
  if (value === null) return xml;
  const groupIndent = groups[0]?.indent ?? unit;
  const head = config ? `<PropertyGroup Condition="${conditionFor(config)}">` : '<PropertyGroup>';
  const block = `${groupIndent}${head}${eol}${groupIndent}${unit}<${name}>${esc(value)}</${name}>${eol}${groupIndent}</PropertyGroup>`;
  const last = groups.at(-1);
  if (last) return `${xml.slice(0, last.end)}${eol}${block}${xml.slice(last.end)}`;
  const open = /<Project\b[^>]*>/.exec(xml);
  if (!open) throw new Error('The file has no <Project> element.');
  const at = open.index + open[0].length;
  return `${xml.slice(0, at)}${eol}${block}${xml.slice(at)}`;
}

/** Applies several property changes (name → value, null removes). */
export function setProperties(xml: string, changes: Record<string, string | null>, config?: string) {
  return Object.entries(changes).reduce((x, [k, v]) => setProperty(x, k, v, config), xml);
}

/** Evaluated values of properties from the .NET SDK (defaults, imports, Directory.Build.props); {} when it cannot run. */
export async function evaluate(projectPath: string, names: string[], cwd: string, configuration?: string) {
  const safe = names.filter((n) => NAME.test(n)).slice(0, 60);
  if (!safe.length) return {};
  const out = await command(dotnet, ['msbuild', projectPath, '-nologo', ...(configuration ? [`-property:Configuration=${configuration}`] : []), ...safe.map((n) => `-getProperty:${n}`)], '', cwd).catch(() => '');
  if (!out.trim()) return {};
  if (safe.length === 1) return { [safe[0]]: out.trim() };
  try { return (JSON.parse(out) as { Properties?: Record<string, string> }).Properties ?? {}; } catch { return {}; }
}
