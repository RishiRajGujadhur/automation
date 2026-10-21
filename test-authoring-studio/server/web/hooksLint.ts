import type { Linter } from 'eslint';

/**
 * React Hooks checks (FRONTEND-100.md F46–F48): the official eslint-plugin-react-hooks rules, run in-process with
 * ESLint's Linter. Babel parses TypeScript and JSX (typescript-eslint would load the project's TypeScript 7, which
 * has no API). exhaustive-deps reports missing / unnecessary dependencies with a suggested array; rules-of-hooks
 * reports hooks called conditionally, in loops or outside components and hooks.
 */
export type HookProblem = { from: number; to: number; severity: 'error' | 'warning'; rule: string; message: string; fixes: { title: string; from: number; to: number; text: string }[] };

// Loaded on first use: ESLint and Babel are large, and the API should start without them.
let engine: { linter: Linter; plugin: unknown; parser: unknown } | undefined;
let loading: Promise<void> | undefined;
export function loadHooksEngine() {
  return (loading ??= Promise.all([import('eslint'), import('eslint-plugin-react-hooks'), import('@babel/eslint-parser')]).then(([eslint, hooks, babel]) => {
    const mod = <T,>(m: T): T => (m as { default?: T }).default ?? m;
    engine = { linter: new eslint.Linter({ configType: 'flat' }), plugin: mod(mod(hooks)), parser: mod(babel) };
  }));
}

const config = (file: string): Linter.Config[] => [{
  // Extensions spelled out: ESLint does not count a catch-all pattern as matching a file.
  files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
  languageOptions: {
    parser: engine!.parser as Linter.Parser,
    sourceType: 'module',
    parserOptions: {
      requireConfigFile: false,
      // Babel's parser with its TypeScript / JSX syntax plugins (.ts gets no JSX: `<T>(x) => …` must parse).
      babelOptions: { babelrc: false, configFile: false, parserOpts: { plugins: /\.[cm]?ts$/i.test(file) ? ['typescript'] : /\.tsx$/i.test(file) ? ['typescript', 'jsx'] : ['jsx'] } },
    },
  },
  plugins: { 'react-hooks': engine!.plugin as never },
  rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
}];

/** Offsets of an ESLint line / column (1-based line, 1-based column). */
const offsetIn = (text: string) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (line: number, column: number) => (starts[line - 1] ?? text.length) + column - 1;
};

/** The problems in a file, once the engine is loaded (until then none; see hookProblemsLoaded). */
export function hookProblems(file: string, text: string): HookProblem[] {
  if (!/\buse[A-Z]\w*\s*\(|\buse\s*\(/.test(text)) return [];
  if (!engine) { void loadHooksEngine(); return []; }
  let messages: Linter.LintMessage[];
  try { messages = engine.linter.verify(text, config(file), { filename: file }); } catch { return []; }
  const at = offsetIn(text);
  return messages.filter((m) => m.ruleId?.startsWith('react-hooks/')).map((m) => ({
    from: at(m.line, m.column), to: m.endLine ? at(m.endLine, m.endColumn ?? m.column) : at(m.line, m.column) + 1,
    severity: m.severity === 2 ? 'error' : 'warning', rule: m.ruleId!, message: m.message,
    fixes: (m.suggestions ?? []).filter((s) => s.fix).map((s) => ({ title: s.desc, from: s.fix!.range[0], to: s.fix!.range[1], text: s.fix!.text })),
  }));
}
export async function hookProblemsLoaded(file: string, text: string) { await loadHooksEngine(); return hookProblems(file, text); }
