/**
 * Project Properties (Visual Studio 2026's project property pages) over SDK-style .csproj text: read the properties of
 * each PropertyGroup and change one property at a time, keeping the file's own layout, comments and line endings.
 * Evaluated values (SDK defaults, Directory.Build.props) come from the .NET SDK: `dotnet msbuild -getProperty`.
 */
import { command, dotnet } from './core.js';
export { relativeProjectPath } from '../src/solutionFormat.js';

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
  const out = await command(dotnet, ['msbuild', projectPath, '-nologo', '-nodeReuse:false', ...(configuration ? [`-property:Configuration=${configuration}`] : []), ...safe.map((n) => `-getProperty:${n}`)], '', cwd).catch(() => '');
  if (!out.trim()) return {};
  if (safe.length === 1) return { [safe[0]]: out.trim() };
  try { return (JSON.parse(out) as { Properties?: Record<string, string> }).Properties ?? {}; } catch { return {}; }
}

const xmlAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The range of an element plus its indentation and line break, to delete the whole line. */
const lineOf = (xml: string, start: number, end: number) => {
  let s = start, e = end;
  while (s > 0 && (xml[s - 1] === ' ' || xml[s - 1] === '\t')) s--;
  if (xml.startsWith('\r\n', e)) e += 2; else if (xml[e] === '\n') e++;
  return [s, e] as const;
};
/** Removes ItemGroups left without items (their line too). */
const dropEmptyItemGroups = (xml: string) => xml.replace(/[ \t]*<ItemGroup\s*>\s*<\/ItemGroup>[ \t]*\r?\n?/g, '');
/** Adds item lines as a new ItemGroup before </Project>. */
function addItemGroup(xml: string, lines: string[]) {
  if (!lines.length) return xml;
  const eol = xml.includes('\r\n') ? '\r\n' : '\n';
  const unit = /\n([ \t]+)</.exec(xml)?.[1] ?? '  ';
  const close = xml.lastIndexOf('</Project>');
  if (close < 0) throw new Error('The file has no </Project>.');
  let before = xml.slice(0, close);
  if (!before.endsWith('\n')) before += eol;
  return `${before}${unit}<ItemGroup>${eol}${lines.map((l) => `${unit}${unit}${l}${eol}`).join('')}${unit}</ItemGroup>${eol}${xml.slice(close)}`;
}

/** Build events (Project Properties ▸ Build Events): Visual Studio's PreBuild / PostBuild targets with an Exec. */
export function readEvents(xml: string) {
  const get = (name: string) => { const m = new RegExp(`<Target\\s+Name="${name}"[^>]*>[\\s\\S]*?<Exec\\s+Command="([^"]*)"`).exec(xml); return m ? unesc(m[1]) : ''; };
  return { pre: get('PreBuild'), post: get('PostBuild') };
}
export function setEvent(xml: string, which: 'pre' | 'post', commandLine: string | null) {
  const name = which === 'pre' ? 'PreBuild' : 'PostBuild';
  const when = which === 'pre' ? 'BeforeTargets="PreBuildEvent"' : 'AfterTargets="PostBuildEvent"';
  const m = new RegExp(`<Target\\s+Name="${name}"[^>]*>[\\s\\S]*?</Target>`).exec(xml);
  let out = xml;
  if (m) { const [s, e] = lineOf(xml, m.index, m.index + m[0].length); out = xml.slice(0, s) + xml.slice(e); }
  if (!commandLine) return out;
  const eol = xml.includes('\r\n') ? '\r\n' : '\n';
  const unit = /\n([ \t]+)</.exec(xml)?.[1] ?? '  ';
  const close = out.lastIndexOf('</Project>');
  let before = out.slice(0, close);
  if (!before.endsWith('\n')) before += eol;
  return `${before}${unit}<Target Name="${name}" ${when}>${eol}${unit}${unit}<Exec Command="${xmlAttr(commandLine)}" />${eol}${unit}</Target>${eol}${out.slice(close)}`;
}

/** Global usings (Project Properties ▸ Global Usings): <Using Include="…" /> items, with Static / Alias. */
export type GlobalUsing = { include: string; static?: boolean; alias?: string };
export function readUsings(xml: string): GlobalUsing[] {
  return [...xml.matchAll(/<Using\s+([^>]*?)\/?>/g)].flatMap((m) => {
    const a = (n: string) => new RegExp(`\\b${n}="([^"]*)"`).exec(m[1])?.[1];
    const include = a('Include');
    if (!include) return [];
    return [{ include: unesc(include), ...(a('Static') === 'true' ? { static: true } : {}), ...(a('Alias') ? { alias: unesc(a('Alias')!) } : {}) }];
  });
}
export function setUsings(xml: string, usings: GlobalUsing[]) {
  const one = /[ \t]*<Using\s+[^>]*?(?:\/>|>\s*<\/Using>)[ \t]*\r?\n?/;
  let out = xml;
  for (let m = one.exec(out); m; m = one.exec(out)) out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  out = dropEmptyItemGroups(out);
  return addItemGroup(out, usings.map((u) => `<Using Include="${xmlAttr(u.include)}"${u.static ? ' Static="true"' : ''}${u.alias ? ` Alias="${xmlAttr(u.alias)}"` : ''} />`));
}

/** Project references (Add ▸ Project Reference): paths as written in the file (relative, backslashes). */
export function readReferences(xml: string) { return [...xml.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((m) => unesc(m[1])); }
const sameRef = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();
export function setReferences(xml: string, refs: string[]) {
  const have = readReferences(xml);
  let out = xml;
  for (const r of have.filter((h) => !refs.some((x) => sameRef(x, h)))) {
    const m = new RegExp(`<ProjectReference\\s+Include="${reEsc(r)}"\\s*(?:/>|>[\\s\\S]*?</ProjectReference>)`).exec(out);
    if (m) { const [s, e] = lineOf(out, m.index, m.index + m[0].length); out = out.slice(0, s) + out.slice(e); }
  }
  out = dropEmptyItemGroups(out);
  const add = refs.filter((r) => !have.some((h) => sameRef(h, r)));
  return addItemGroup(out, add.map((r) => `<ProjectReference Include="${xmlAttr(r.replace(/\//g, '\\'))}" />`));
}
/** Build Action / Copy to Output Directory of a file (Visual Studio's file Properties), for SDK-style projects. */
export type FileItem = { action: string; copy: 'Never' | 'Always' | 'PreserveNewest' };
const itemRe = (rel: string) => new RegExp(`<(\\w+)\\s+(Include|Update|Remove)="${reEsc(rel)}"\\s*(?:/>|>([\\s\\S]*?)</\\1>)`, 'i');
export function readFileItem(xml: string, rel: string): FileItem {
  const r = rel.replace(/\//g, '\\');
  let action = /\.cs$/i.test(r) ? 'Compile' : 'None';
  let copy: FileItem['copy'] = 'Never';
  for (const m of xml.matchAll(new RegExp(itemRe(r).source, 'gi'))) {
    if (m[2] === 'Include') action = m[1];
    const c = /<CopyToOutputDirectory>([^<]+)</.exec(m[3] ?? '')?.[1];
    if (c === 'Always' || c === 'PreserveNewest') copy = c;
  }
  return { action, copy };
}
export function setFileItem(xml: string, rel: string, item: FileItem) {
  const r = rel.replace(/\//g, '\\');
  let out = xml;
  for (let m = itemRe(r).exec(out); m; m = itemRe(r).exec(out)) { const [s, e] = lineOf(out, m.index, m.index + m[0].length); out = out.slice(0, s) + out.slice(e); }
  out = dropEmptyItemGroups(out);
  const def = /\.cs$/i.test(r) ? 'Compile' : 'None';
  const copy = item.copy === 'Never' ? '' : `<CopyToOutputDirectory>${item.copy}</CopyToOutputDirectory>`;
  const lines = item.action === def
    ? (copy ? [`<${def} Update="${xmlAttr(r)}">${copy}</${def}>`] : [])
    : [`<${def} Remove="${xmlAttr(r)}" />`, copy ? `<${item.action} Include="${xmlAttr(r)}">${copy}</${item.action}>` : `<${item.action} Include="${xmlAttr(r)}" />`];
  return addItemGroup(out, lines);
}
