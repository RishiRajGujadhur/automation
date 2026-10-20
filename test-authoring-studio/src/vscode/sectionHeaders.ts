import { defineSetting } from './settings';
import { addMinimapHeaders, setMinimapHeaderFont, type MinimapHeader } from './minimap';

/** Minimap section headers (VS Code 1.88+): `// MARK: Name` comments and `#region Name` lines labelled in the minimap. */
const C = 'Text Editor ▸ Minimap';
export const sectionHeaders = {
  region: defineSetting<boolean>({ key: 'editor.minimap.showRegionSectionHeaders', category: C, title: 'Show Region Section Headers', type: 'boolean', default: true, description: 'Controls whether named regions are shown as section headers in the minimap.' }),
  mark: defineSetting<boolean>({ key: 'editor.minimap.showMarkSectionHeaders', category: C, title: 'Show Mark Section Headers', type: 'boolean', default: true, description: 'Controls whether MARK: comments are shown as section headers in the minimap.' }),
  regex: defineSetting<string>({ key: 'editor.minimap.markSectionHeaderRegex', category: C, title: 'Mark Section Header Regex', type: 'string', default: String.raw`\bMARK:\s*(?<separator>-?)\s*(?<label>.*)$`, description: 'Defines the regular expression used to find section headers in comments. The regex must contain a named match group `label` (written as `(?<label>.+)`) that encapsulates the section header, otherwise it will not work. Optionally you can include another match group named `separator`.' }),
  fontSize: defineSetting<number>({ key: 'editor.minimap.sectionHeaderFontSize', category: C, title: 'Section Header Font Size', type: 'number', default: 9, min: 4, max: 32, description: 'Controls the font size of section headers in the minimap.' }),
  spacing: defineSetting<number>({ key: 'editor.minimap.sectionHeaderLetterSpacing', category: C, title: 'Section Header Letter Spacing', type: 'number', default: 1, min: 0, max: 5, description: 'Controls the amount of space (in pixels) between characters of section header.' }),
};

const COMMENT = /(\/\/+|#(?!region\b|endregion\b)|<!--|\/\*)/;
/** The section headers of a text: regions and comment marks. Pure, for the unit tests. */
export function findSectionHeaders(lines: string[], o: { region: boolean; mark: boolean; regex: string }): MinimapHeader[] {
  let re: RegExp | null = null;
  try { re = o.mark && o.regex ? new RegExp(o.regex) : null; } catch { re = null; }
  const out: MinimapHeader[] = [];
  lines.forEach((text, i) => {
    const region = o.region ? /^\s*#region\b\s*(.*?)\s*$/.exec(text) : null;
    if (region) { if (region[1]) out.push({ line: i + 1, label: region[1], separator: false }); return; }
    if (!re) return;
    const c = COMMENT.exec(text);
    if (!c) return;
    const m = re.exec(text.slice(c.index + c[0].length).replace(/\s*(\*\/|-->)\s*$/, ''));
    if (m?.groups && 'label' in m.groups) out.push({ line: i + 1, label: (m.groups.label ?? '').trim(), separator: !!m.groups.separator });
  });
  return out;
}

// The minimap redraws on every scroll: the headers are worked out once per text and settings.
const cache = new WeakMap<object, { key: string; headers: MinimapHeader[] }>();
addMinimapHeaders((state) => {
  const region = sectionHeaders.region(), mark = sectionHeaders.mark();
  if (!region && !mark) return [];
  const key = `${region}${mark}${sectionHeaders.regex()}`;
  const hit = cache.get(state.doc);
  if (hit?.key === key) return hit.headers;
  const lines: string[] = [];
  for (let n = 1; n <= state.doc.lines; n++) lines.push(state.doc.line(n).text);
  const headers = findSectionHeaders(lines, { region, mark, regex: sectionHeaders.regex() });
  cache.set(state.doc, { key, headers });
  return headers;
});
setMinimapHeaderFont(() => ({ size: sectionHeaders.fontSize(), spacing: sectionHeaders.spacing() }));
