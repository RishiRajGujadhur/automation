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
  if (/\.(css|scss|sass|less)$/i.test(file) && 'autogrid'.startsWith(word.text)) {
    options.push(snippetCompletion('display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, ${1:16rem}), 1fr));\n  gap: ${2:1rem};${0}', { label: 'autogrid', detail: 'Responsive auto-fit grid', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'reduceMotion'.startsWith(word.text)) {
    options.push(snippetCompletion('@media (prefers-reduced-motion: reduce) {\n  ${1:.element} {\n    animation: none;\n    transition: none;\n  }\n}${0}', { label: 'reduceMotion', detail: 'Reduced motion override', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'darkScheme'.startsWith(word.text)) {
    options.push(snippetCompletion('@media (prefers-color-scheme: dark) {\n  ${1::root} {\n    color-scheme: dark;\n    background: ${2:#111827};\n    color: ${3:#f9fafb};\n  }\n}${0}', { label: 'darkScheme', detail: 'System dark color scheme', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'fluidType'.startsWith(word.text)) {
    options.push(snippetCompletion('font-size: clamp(${1:1rem}, ${2:calc(1rem + 1vw)}, ${3:2rem});${0}', { label: 'fluidType', detail: 'Fluid type scale', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'srOnly'.startsWith(word.text)) {
    options.push(snippetCompletion('${1:.sr-only} {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}${0}', { label: 'srOnly', detail: 'Screen-reader-only utility', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && 'logicalBox'.startsWith(word.text)) {
    options.push(snippetCompletion('padding-block: ${1:1rem};\n  padding-inline: ${2:1.5rem};\n  margin-block: ${3:0};\n  margin-inline: ${4:auto};${0}', { label: 'logicalBox', detail: 'Direction-aware spacing', type: 'text' }));
  }
  return options.length ? { from: word.from, options } : null;
}
