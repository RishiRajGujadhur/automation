import { snippetCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

/** Frontend snippets stay scoped to the file types where their output is valid. */
export function webSnippetCompletion(file: string, ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[A-Za-z]*/);
  if (!word || (!ctx.explicit && !word.text)) return null;
  const options = [];
  if (/\.tsx$/i.test(file) && 'rfc'.startsWith(word.text)) {
    const stem = (file.split(/[\\/]/).at(-1) ?? 'Component').replace(/\.tsx$/i, '');
    const name = stem.replace(/(^|[-_. ])([A-Za-z0-9])/g, (_m, _sep: string, letter: string) => letter.toUpperCase()).replace(/[^A-Za-z0-9_]/g, '') || 'Component';
    const safeName = /^[A-Za-z_]/.test(name) ? name : `Component${name}`;
    options.push(snippetCompletion('export function ${1:' + safeName + '}() {\n  return <div>${0}</div>;\n}', { label: 'rfc', detail: 'React function component', type: 'text' }));
  }
  return options.length ? { from: word.from, options } : null;
}
