/**
 * Rename Step: re-word a step definition's pattern and every feature line bound to it, carrying the parameter
 * values over (regex capture groups or Cucumber-expression parameters, in order).
 */
const cucumberParam = /\{(int|float|word|string|double|decimal|long|byte|short|bigdecimal|biginteger|)\}/g;
// A fresh, non-global regex for testing: .test on a /g regex keeps lastIndex between calls.
export const isCucumber = (pattern: string) => new RegExp(cucumberParam.source).test(pattern) && !/[\\^$()[\]]/.test(pattern.replace(cucumberParam, ''));

/** Top-level capturing groups of a regex pattern: [start, end) index pairs of "( … )". */
function groups(pattern: string) {
  const out: [number, number][] = [];
  let depth = 0, start = -1, inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') {
      const capturing = pattern[i + 1] !== '?' || /^\(\?<[A-Za-z]/.test(pattern.slice(i, i + 4));
      if (depth === 0 && capturing) start = i;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0 && start >= 0) { out.push([start, i + 1]); start = -1; }
    }
  }
  return out;
}
/** Regex literal text → plain text (\. → ., anchors removed). */
const unescape = (s: string) => s.replace(/^\^/, '').replace(/\$$/, '').replace(/\\(.)/g, '$1');

export function parameterCount(pattern: string) {
  return isCucumber(pattern) ? (pattern.match(cucumberParam) ?? []).length : groups(pattern).length;
}

/** The parameter values of a step text for a pattern (null when it does not match). */
export function values(pattern: string, text: string): string[] | null {
  if (isCucumber(pattern)) {
    const parts = pattern.split(cucumberParam);
    // parts: [literal, type, literal, type, …, literal]
    let re = '^';
    for (let i = 0; i < parts.length; i++) re += i % 2 === 0 ? parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : parts[i] === 'string' ? '("[^"]*"|\'[^\']*\')' : parts[i] === 'int' || parts[i] === 'long' || parts[i] === 'short' || parts[i] === 'byte' ? '(-?\\d+)' : parts[i] === 'word' ? '([^\\s]+)' : parts[i] === '' ? '(.*)' : '(-?\\d*\\.?\\d+)';
    const m = new RegExp(`${re}$`).exec(text);
    return m ? m.slice(1) : null;
  }
  const m = new RegExp(`^(?:${pattern.replace(/^\^/, '').replace(/\$$/, '')})$`).exec(text);
  if (!m) return null;
  // Only top-level groups are parameters (nested groups are part of them).
  const top = groups(pattern).length;
  return m.slice(1, 1 + top + (m.length - 1 - top)).slice(0, top);
}

/** The step text for a (new) pattern with the given parameter values. */
export function render(pattern: string, vals: string[]): string {
  if (isCucumber(pattern)) {
    let i = 0;
    return pattern.replace(cucumberParam, () => vals[i++] ?? '');
  }
  const gs = groups(pattern);
  let out = '', at = 0;
  gs.forEach(([s, e], i) => { out += unescape(pattern.slice(at, s)) + (vals[i] ?? ''); at = e; });
  return out + unescape(pattern.slice(at));
}

/** The C# attribute line with its pattern string replaced (verbatim @"…" doubles quotes; regular "…" escapes them). */
export function replaceAttributePattern(line: string, oldPattern: string, newPattern: string) {
  const verbatim = (p: string) => `@"${p.replace(/"/g, '""')}"`;
  const regular = (p: string) => `"${p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (line.includes(verbatim(oldPattern))) return line.replace(verbatim(oldPattern), verbatim(newPattern));
  if (line.includes(regular(oldPattern))) return line.replace(regular(oldPattern), regular(newPattern));
  return null;
}
