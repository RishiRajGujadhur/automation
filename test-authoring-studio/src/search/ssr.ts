/**
 * Search with Pattern (Rider's Structural Search and Replace, in short): a C# snippet with $placeholders$. Placeholders
 * match an expression (identifier, member access or call, string, number); the same placeholder twice must match the
 * same text; white space is flexible.
 */
const ESC = /[.*+?^${}()|[\]\\]/g;
const ATOM = String.raw`(?:[A-Za-z_@][\w.]*(?:\((?:[^()]|\([^()]*\))*\))?(?:\.[A-Za-z_]\w*(?:\((?:[^()]|\([^()]*\))*\))?)*|"(?:[^"\\\n]|\\.)*"|\d+(?:\.\d+)?)`;
export function patternRegex(pattern: string) {
  const seen = new Set<string>();
  let src = '';
  for (const part of pattern.trim().split(/(\$[A-Za-z_]\w*\$)/)) {
    const ph = /^\$([A-Za-z_]\w*)\$$/.exec(part);
    if (ph) { src += seen.has(ph[1]) ? `\\k<${ph[1]}>` : `(?<${ph[1]}>${ATOM})`; seen.add(ph[1]); continue; }
    src += part.split(/\s+/).map((w) => w.replace(ESC, '\\$&')).join('\\s*');
  }
  if (!src) throw new Error('Type a pattern, e.g. $x$ == null');
  return new RegExp(src, 'g');
}
/** Every match of a pattern in a text: offset, line and the matched text. */
export function findPattern(text: string, pattern: string) {
  const re = patternRegex(pattern);
  return [...text.matchAll(re)].map((m) => ({ index: m.index!, line: text.slice(0, m.index!).split('\n').length, text: m[0] }));
}
/** The text with every match replaced; $name$ in the replacement is the placeholder's match. */
export function replacePattern(text: string, pattern: string, replacement: string) {
  let count = 0;
  const out = text.replace(patternRegex(pattern), (...args) => { count++; const groups = args.at(-1) as Record<string, string>; return replacement.replace(/\$([A-Za-z_]\w*)\$/g, (all, n: string) => groups?.[n] ?? all); });
  return { text: out, count };
}
