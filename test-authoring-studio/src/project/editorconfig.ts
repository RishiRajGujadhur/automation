/**
 * .editorconfig editing (Visual Studio's EditorConfig designer): read the value of an option in a section and set or
 * remove it, keeping the rest of the file (comments, order, other sections) as it is.
 */
const SECTION = /^\s*\[([^\]]+)\]\s*$/;
const KEY = /^\s*([^#;=\s][^=]*?)\s*=\s*(.*?)\s*$/;

/** Values per section header ("*" for [*], "*.cs" for [*.cs]); root-level keys are under "". */
export function readEditorConfig(text: string) {
  const out: Record<string, Record<string, string>> = {};
  let section = '';
  for (const l of text.split(/\r?\n/)) {
    const s = SECTION.exec(l);
    if (s) { section = s[1]; continue; }
    const k = KEY.exec(l);
    if (k && !/^\s*[#;]/.test(l)) (out[section] ??= {})[k[1].toLowerCase()] = k[2];
  }
  return out;
}
/** Sets (value null: removes) `key` in [section]; a missing section is added at the end. */
export function setEditorConfig(text: string, section: string, key: string, value: string | null) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text ? text.split(/\r?\n/) : [];
  let start = -1, end = lines.length;
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const s = SECTION.exec(lines[i]);
    if (s) { if (cur === section && start >= 0) { end = i; break; } cur = s[1]; if (cur === section) start = i; }
  }
  if (section === '' ) { start = -1; end = lines.findIndex((l) => SECTION.test(l)); if (end < 0) end = lines.length; }
  const from = start + 1;
  const at = lines.slice(from, end).findIndex((l) => { const k = KEY.exec(l); return !!k && !/^\s*[#;]/.test(l) && k[1].toLowerCase() === key.toLowerCase(); });
  if (at >= 0) {
    if (value === null) lines.splice(from + at, 1); else lines[from + at] = `${key} = ${value}`;
    return lines.join(eol);
  }
  if (value === null) return text;
  if (start < 0 && section !== '') {
    while (lines.length && lines.at(-1) === '') lines.pop();
    return [...lines, ...(lines.length ? [''] : []), `[${section}]`, `${key} = ${value}`, ''].join(eol);
  }
  let insert = end;
  while (insert > from && lines[insert - 1].trim() === '') insert--;
  lines.splice(insert, 0, `${key} = ${value}`);
  return lines.join(eol);
}

/** Options the designer shows (Visual Studio's Whitespace, Code Style and Naming pages, in short). */
export type ConfigOption = { section: string; key: string; label: string; values: string[] };
export const OPTIONS: ConfigOption[] = [
  { section: '*', key: 'indent_style', label: 'Indent style', values: ['space', 'tab'] },
  { section: '*', key: 'indent_size', label: 'Indent size', values: ['2', '4'] },
  { section: '*', key: 'end_of_line', label: 'Line endings', values: ['crlf', 'lf'] },
  { section: '*', key: 'insert_final_newline', label: 'Final newline', values: ['true', 'false'] },
  { section: '*', key: 'charset', label: 'Charset', values: ['utf-8', 'utf-8-bom'] },
  { section: '*.cs', key: 'csharp_style_namespace_declarations', label: 'Namespace declarations', values: ['file_scoped:warning', 'file_scoped:suggestion', 'block_scoped:silent'] },
  { section: '*.cs', key: 'csharp_style_var_for_built_in_types', label: "'var' for built-in types", values: ['true:suggestion', 'false:suggestion', 'false:silent'] },
  { section: '*.cs', key: 'csharp_prefer_braces', label: 'Prefer braces', values: ['true:warning', 'true:suggestion', 'when_multiline:silent', 'false:silent'] },
  { section: '*.cs', key: 'csharp_new_line_before_open_brace', label: 'New line before {', values: ['all', 'none'] },
  { section: '*.cs', key: 'dotnet_sort_system_directives_first', label: 'System usings first', values: ['true', 'false'] },
  { section: '*.cs', key: 'csharp_using_directive_placement', label: 'Using placement', values: ['outside_namespace:warning', 'inside_namespace:warning'] },
  { section: '*.cs', key: 'dotnet_style_readonly_field', label: 'Readonly fields', values: ['true:suggestion', 'false:silent'] },
];
export const SEVERITIES = ['none', 'silent', 'suggestion', 'warning', 'error'];
