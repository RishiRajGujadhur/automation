/* Step-definition scaffolding: a Gherkin step → a C# binding method in the repository's own style. */

export type PatternStyle = 'cucumber' | 'regex';
type Param = { name: string; type: string };

/** Pattern and parameters for a step text. Quoted values and numbers become placeholders. */
export function stepPattern(text: string, style: PatternStyle) {
  const params: Param[] = [];
  let pattern = '';
  const re = /"([^"]*)"|'([^']*)'|(-?\d+\.\d+)|(-?\b\d+\b)/g;
  let last = 0, m: RegExpExecArray | null;
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapeCucumber = (s: string) => s.replace(/([(){}\\/])/g, '\\$1');
  const lit = (s: string) => (style === 'regex' ? escapeRegex(s) : escapeCucumber(s));
  while ((m = re.exec(text))) {
    pattern += lit(text.slice(last, m.index));
    const n = params.length + 1;
    if (m[1] !== undefined || m[2] !== undefined) {
      pattern += style === 'regex' ? '"(.*)"' : '{string}';
      params.push({ name: `value${n}`, type: 'string' });
    } else if (m[3] !== undefined) {
      pattern += style === 'regex' ? '(-?\\d+\\.\\d+)' : '{float}';
      params.push({ name: `number${n}`, type: 'decimal' });
    } else {
      pattern += style === 'regex' ? '(-?\\d+)' : '{int}';
      params.push({ name: `number${n}`, type: 'int' });
    }
    last = m.index + m[0].length;
  }
  pattern += lit(text.slice(last));
  return { pattern: style === 'regex' ? `^${pattern}$` : pattern, params };
}

/** PascalCase method name from the step's words, quoted words included (numbers and punctuation dropped). */
export function methodName(text: string) {
  const words = text.replace(/["']/g, ' ').replace(/-?\d+(\.\d+)?/g, ' ').match(/[A-Za-z][A-Za-z0-9]*/g) ?? ['Step'];
  const name = words.slice(0, 8).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return /^[A-Za-z]/.test(name) ? name : 'Step' + name;
}

/** C# string literal for an attribute argument (verbatim when the pattern has backslashes or quotes). */
const literal = (s: string) => (/[\\"]/.test(s) ? `@"${s.replace(/"/g, '""')}"` : `"${s}"`);

export function bindingMethod(keyword: string, text: string, style: PatternStyle, indent = '    ', existing: string[] = []) {
  const { pattern, params } = stepPattern(text, style);
  let name = methodName(text);
  for (let i = 2; existing.includes(name); i++) name = methodName(text) + i;
  const kw = ['Given', 'When', 'Then'].includes(keyword) ? keyword : 'Given';
  const lines = [
    `${indent}[${kw}(${literal(pattern)})]`,
    `${indent}public void ${name}(${params.map((p) => `${p.type} ${p.name}`).join(', ')})`,
    `${indent}{`,
    `${indent}    // TODO: call the page object; keep locators in the dictionary XML.`,
    `${indent}    throw new PendingStepException();`,
    `${indent}}`,
  ];
  return { code: lines.join('\n'), name, pattern };
}

/** Position of the closing brace of the first [Binding] class (string and comment aware). */
export function bindingClassEnd(source: string) {
  const attr = source.search(/\[\s*Binding\s*\]/);
  const cls = source.slice(Math.max(0, attr)).search(/\bclass\s+\w+/);
  if (cls < 0) return -1;
  let i = source.indexOf('{', Math.max(0, attr) + cls);
  if (i < 0) return -1;
  let depth = 0;
  for (; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (c === '/' && n === '/') { i = source.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && n === '*') { i = source.indexOf('*/', i + 2) + 1; if (i <= 0) return -1; continue; }
    if (c === '@' && n === '"') { i += 2; while (i < source.length && !(source[i] === '"' && source[i + 1] !== '"')) i += source[i] === '"' ? 2 : 1; continue; }
    if (c === '"') { i++; while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1; continue; }
    if (c === "'") { i++; while (i < source.length && source[i] !== "'") i += source[i] === '\\' ? 2 : 1; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Inserts a method before the binding class's closing brace; returns the new source and the attribute's line. */
export function insertMethod(source: string, keyword: string, text: string, style: PatternStyle) {
  const end = bindingClassEnd(source);
  if (end < 0) throw new Error('No [Binding] class found in this file.');
  const memberIndent = /\n([ \t]+)\[(Given|When|Then)/.exec(source)?.[1] ?? /\n([ \t]+)(public|private|internal)/.exec(source)?.[1] ?? '    ';
  const existing = [...source.matchAll(/\b(?:void|Task)\s+(\w+)\s*\(/g)].map((m) => m[1]);
  const method = bindingMethod(keyword, text, style, memberIndent, existing);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lineStart = source.lastIndexOf('\n', end - 1) + 1;
  const before = source.slice(0, lineStart).replace(/\s*$/, '');
  const insertion = `${eol}${eol}${method.code.replace(/\n/g, eol)}${eol}`;
  const next = before + insertion + source.slice(lineStart);
  const line = (before + eol + eol).split(/\r?\n/).length;
  return { source: next, line, method };
}

/** A new step-definition file following the conventions of existing ones (usings, namespace style). */
export function newStepFile(className: string, keyword: string, text: string, style: PatternStyle, sample?: string) {
  const usings = sample ? [...sample.matchAll(/^using\s+[\w.]+;\s*$/gm)].map((m) => m[0].trim()) : [];
  const binding = usings.find((u) => /Reqnroll|TechTalk\.SpecFlow/.test(u)) ?? 'using TechTalk.SpecFlow;';
  const ns = sample ? /^namespace\s+([\w.]+)\s*(;|\{)/m.exec(sample) : null;
  const fileScoped = !ns || ns[2] === ';';
  const namespace = ns?.[1] ?? 'Tests.Steps';
  const indent = fileScoped ? '    ' : '        ';
  const method = bindingMethod(keyword, text, style, indent);
  const body = [`[Binding]`, `public class ${className}`, `{`, method.code, `}`];
  const lines = [...new Set([binding, ...usings.filter((u) => u !== binding)])];
  const out = fileScoped
    ? [...lines, '', `namespace ${namespace};`, '', ...body]
    : [...lines, '', `namespace ${namespace}`, '{', ...body.map((l) => (l ? '    ' + l : l)), '}'];
  const source = out.join('\n') + '\n';
  return { source, line: source.split('\n').findIndex((l) => /^\s*\[(Given|When|Then)\(/.test(l)) + 1, method };
}
