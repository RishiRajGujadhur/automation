import { snippetCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

/** Frontend snippets stay scoped to the file types where their output is valid. */
export function webSnippetCompletion(file: string, ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[A-Za-z]*/);
  if (!word || (!ctx.explicit && !word.text)) return null;
  const options = [];
  if (/\.tsx$/i.test(file)) {
    const stem = (file.split(/[\\/]/).at(-1) ?? 'Component').replace(/\.tsx$/i, '');
    const name = stem.replace(/(^|[-_. ])([A-Za-z0-9])/g, (_m, _sep: string, letter: string) => letter.toUpperCase()).replace(/[^A-Za-z0-9_]/g, '') || 'Component';
    const safeName = /^[A-Za-z_]/.test(name) ? name : `Component${name}`;
    if ('rfc'.startsWith(word.text)) options.push(snippetCompletion('export function ${1:' + safeName + '}() {\n  return <div>${0}</div>;\n}', { label: 'rfc', detail: 'React function component', type: 'text' }));
    if ('rfcp'.startsWith(word.text)) options.push(snippetCompletion('type ${1:' + safeName + '}Props = {\n  ${2:title}: string;\n};\n\nexport function ${1:' + safeName + '}({ ${2:title} }: ${1:' + safeName + '}Props) {\n  return <div>{${2:title}}</div>;\n}${0}', { label: 'rfcp', detail: 'React component with typed props', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'flexc'.startsWith(word.text)) {
    options.push(snippetCompletion('display: flex;\n  align-items: center;\n  gap: ${1:1rem};${0}', { label: 'flexc', detail: 'Flex container', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'gridc'.startsWith(word.text)) {
    options.push(snippetCompletion('display: grid;\n  grid-template-columns: repeat(${1:2}, minmax(0, 1fr));\n  gap: ${2:1rem};${0}', { label: 'gridc', detail: 'Grid container', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'mediaq'.startsWith(word.text)) {
    options.push(snippetCompletion('@media (min-width: ${1:768px}) {\n  ${0}\n}', { label: 'mediaq', detail: 'Responsive media query', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'containerq'.startsWith(word.text)) {
    options.push(snippetCompletion('@container (min-width: ${1:30rem}) {\n  ${0}\n}', { label: 'containerq', detail: 'Container query', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'focusv'.startsWith(word.text)) {
    options.push(snippetCompletion('${1:.control}:focus-visible {\n  outline: ${2:2px} solid currentColor;\n  outline-offset: ${3:2px};\n}${0}', { label: 'focusv', detail: 'Visible keyboard focus', type: 'text' }));
  }
  return options.length ? { from: word.from, options } : null;
}
