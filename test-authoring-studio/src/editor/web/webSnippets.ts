import { snippet, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

/** Put a missing React hook import after a top-of-file directive, preserving `use client`. */
function reactHookCompletion(hook: string, label: string, detail: string, body: string): Completion {
  return { ...snippetCompletion(body, { label, detail, type: 'text' }), apply: (view, _completion, originalFrom, originalTo) => {
    let from = originalFrom, to = originalTo;
    const source = view.state.doc.toString();
    const reactImports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react['"]/g)];
    const alreadyImported = reactImports.some((match) => match[1].split(',').some((member) =>
      !/^type\s/.test(member.trim()) && new RegExp(`^${hook}(?:\\s|$)`).test(member.trim()) && !new RegExp(`^${hook}\\s+as\\b`).test(member.trim())));
    if (!alreadyImported) {
      const existing = reactImports[0];
      let at: number;
      let added: string;
      if (existing) {
        const members = existing[1];
        at = existing.index + existing[0].indexOf('{') + 1 + members.trimEnd().length;
        added = `${members.trim() && !members.trimEnd().endsWith(',') ? ', ' : ' '}${hook}`;
      } else {
        at = /^(?:(?:\s*\/\/[^\n]*\n)|(?:\s*\/\*[\s\S]*?\*\/\s*)|(?:[ \t]*\r?\n))*/.exec(source)?.[0].length ?? 0;
        const directive = /^(['"])use (?:client|server|strict)\1\s*;?[ \t]*(?:\r?\n|$)/;
        for (let match = directive.exec(source.slice(at)); match; match = directive.exec(source.slice(at))) at += match[0].length;
        added = `import { ${hook} } from 'react';\n`;
      }
      view.dispatch({ changes: { from: at, insert: added }, userEvent: 'input.complete' });
      if (at <= from) { from += added.length; to += added.length; }
    }
    snippet(body)(view, null, from, to);
  } };
}

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
  if (/\.(jsx|tsx)$/i.test(file) && 'state'.startsWith(word.text)) {
    options.push(reactHookCompletion('useState', 'state', 'React state hook with import', 'const [${1:value}, set${2:Value}] = useState(${3:initialValue});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'effect'.startsWith(word.text)) {
    options.push(reactHookCompletion('useEffect', 'effect', 'React effect hook with import', 'useEffect(() => {\n  ${1}\n}, [${2}]);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'layoutEffect'.startsWith(word.text)) {
    options.push(reactHookCompletion('useLayoutEffect', 'layoutEffect', 'React layout effect with import', 'useLayoutEffect(() => {\n  ${1}\n}, [${2}]);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'memoValue'.startsWith(word.text)) {
    options.push(reactHookCompletion('useMemo', 'memoValue', 'React memoized value with import', 'const ${1:result} = useMemo(() => ${2:compute()}, [${3}]);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'callback'.startsWith(word.text)) {
    options.push(reactHookCompletion('useCallback', 'callback', 'React memoized callback with import', 'const ${1:handleAction} = useCallback(() => {\n  ${2}\n}, [${3}]);${0}'));
  }
  if (/\.tsx$/i.test(file) && 'domRef'.startsWith(word.text)) {
    options.push(reactHookCompletion('useRef', 'domRef', 'Typed React DOM ref with import', 'const ${1:elementRef} = useRef<${2:HTMLDivElement} | null>(null);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'reducer'.startsWith(word.text)) {
    options.push(reactHookCompletion('useReducer', 'reducer', 'React reducer hook with import', 'const [${1:state}, ${2:dispatch}] = useReducer(${3:reducer}, ${4:initialState});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'stableId'.startsWith(word.text)) {
    options.push(reactHookCompletion('useId', 'stableId', 'React accessible ID with import', 'const ${1:id} = useId();${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'transition'.startsWith(word.text)) {
    options.push(reactHookCompletion('useTransition', 'transition', 'React transition state with import', 'const [${1:isPending}, ${2:startTransition}] = useTransition();${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'deferredValue'.startsWith(word.text)) {
    options.push(reactHookCompletion('useDeferredValue', 'deferredValue', 'React deferred value with import', 'const ${1:deferredValue} = useDeferredValue(${2:value});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'externalStore'.startsWith(word.text)) {
    options.push(reactHookCompletion('useSyncExternalStore', 'externalStore', 'React external store subscription with import', 'const ${1:snapshot} = useSyncExternalStore(${2:subscribe}, ${3:getSnapshot}, ${4:getServerSnapshot});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'contextValue'.startsWith(word.text)) {
    options.push(reactHookCompletion('useContext', 'contextValue', 'React context value with import', 'const ${1:value} = useContext(${2:Context});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && 'listItems'.startsWith(word.text)) {
    options.push(snippetCompletion('{${1:items}.map((${2:item}) => (\n  <li key={${2:item}.${3:id}}>{${2:item}.${4:name}}</li>\n))}${0}', { label: 'listItems', detail: 'Render keyed React list items', type: 'text' }));
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
