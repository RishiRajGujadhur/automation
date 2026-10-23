import { snippet, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';

/** Put a missing React hook import after a top-of-file directive, preserving `use client`. */
function reactHookCompletion(hook: string, label: string, detail: string, body: string, module = 'react'): Completion {
  return { ...snippetCompletion(body, { label, detail, type: 'text' }), apply: (view, _completion, originalFrom, originalTo) => {
    let from = originalFrom, to = originalTo;
    const source = view.state.doc.toString();
    const reactImports = [...source.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${module}['"]`, 'g'))];
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
        added = `import { ${hook} } from '${module}';\n`;
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
  if (!word || (!ctx.explicit && word.text.length < 2)) return null;
  const tree = syntaxTree(ctx.state);
  for (let node: typeof tree.topNode | null = tree.resolveInner(ctx.pos, -1); node; node = node.parent) {
    if (/Comment|String|Attribute|OpenTag|CloseTag|TemplateString/.test(node.name)) return null;
    if (/\.(css|scss|sass|less)$/i.test(file) && node.name === 'ValueName') return null;
  }
  const options = [];
  const matches = (label: string) => label.toLowerCase().startsWith(word.text.toLowerCase());
  if (/\.tsx$/i.test(file)) {
    const stem = (file.split(/[\\/]/).at(-1) ?? 'Component').replace(/\.tsx$/i, '');
    const name = stem.replace(/(^|[-_. ])([A-Za-z0-9])/g, (_m, _sep: string, letter: string) => letter.toUpperCase()).replace(/[^A-Za-z0-9_]/g, '') || 'Component';
    const safeName = /^[A-Za-z_]/.test(name) ? name : `Component${name}`;
    if (matches('rfc')) options.push(snippetCompletion('export function ${1:' + safeName + '}() {\n  return <div>${0}</div>;\n}', { label: 'rfc', detail: 'React function component', type: 'text' }));
    if (matches('rfcp')) options.push(snippetCompletion('type ${1:' + safeName + '}Props = {\n  ${2:title}: string;\n};\n\nexport function ${1:' + safeName + '}({ ${2:title} }: ${1:' + safeName + '}Props) {\n  return <div>{${2:title}}</div>;\n}${0}', { label: 'rfcp', detail: 'React component with typed props', type: 'text' }));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('state')) {
    options.push(reactHookCompletion('useState', 'state', 'React state hook with import', 'const [${1:value}, set${2:Value}] = useState(${3:initialValue});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('effect')) {
    options.push(reactHookCompletion('useEffect', 'effect', 'React effect hook with import', 'useEffect(() => {\n  ${1}\n}, [${2}]);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('layoutEffect')) {
    options.push(reactHookCompletion('useLayoutEffect', 'layoutEffect', 'React layout effect with import', 'useLayoutEffect(() => {\n  ${1}\n}, [${2}]);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('memoValue')) {
    options.push(reactHookCompletion('useMemo', 'memoValue', 'React memoized value with import', 'const ${1:result} = useMemo(() => ${2:compute()}, [${3}]);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('callback')) {
    options.push(reactHookCompletion('useCallback', 'callback', 'React memoized callback with import', 'const ${1:handleAction} = useCallback(() => {\n  ${2}\n}, [${3}]);${0}'));
  }
  if (/\.tsx$/i.test(file) && matches('domRef')) {
    options.push(reactHookCompletion('useRef', 'domRef', 'Typed React DOM ref with import', 'const ${1:elementRef} = useRef<${2:HTMLDivElement} | null>(null);${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('reducer')) {
    options.push(reactHookCompletion('useReducer', 'reducer', 'React reducer hook with import', 'const [${1:state}, ${2:dispatch}] = useReducer(${3:reducer}, ${4:initialState});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('stableId')) {
    options.push(reactHookCompletion('useId', 'stableId', 'React accessible ID with import', 'const ${1:id} = useId();${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('transition')) {
    options.push(reactHookCompletion('useTransition', 'transition', 'React transition state with import', 'const [${1:isPending}, ${2:startTransition}] = useTransition();${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('deferredValue')) {
    options.push(reactHookCompletion('useDeferredValue', 'deferredValue', 'React deferred value with import', 'const ${1:deferredValue} = useDeferredValue(${2:value});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('externalStore')) {
    options.push(reactHookCompletion('useSyncExternalStore', 'externalStore', 'React external store subscription with import', 'const ${1:snapshot} = useSyncExternalStore(${2:subscribe}, ${3:getSnapshot}, ${4:getServerSnapshot});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('actionState')) {
    options.push(reactHookCompletion('useActionState', 'actionState', 'React action state and pending flag with import', 'const [${1:state}, ${2:dispatchAction}, ${3:isPending}] = useActionState(${4:action}, ${5:initialState});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('optimisticState')) {
    options.push(reactHookCompletion('useOptimistic', 'optimisticState', 'React optimistic UI state with import', 'const [${1:optimisticValue}, ${2:setOptimisticValue}] = useOptimistic(${3:value});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('formStatus')) {
    options.push(reactHookCompletion('useFormStatus', 'formStatus', 'React form pending status in child component', 'const { ${1:pending} } = useFormStatus();${0}', 'react-dom'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('lazyComponent')) {
    options.push(reactHookCompletion('lazy', 'lazyComponent', 'Lazy-load a React component with import', 'const ${1:DetailsPanel} = lazy(() => import("${2:./DetailsPanel}"));${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('suspenseBoundary')) {
    options.push(reactHookCompletion('Suspense', 'suspenseBoundary', 'React loading boundary with fallback', '<Suspense fallback={<p role="status">${1:Loading…}</p>}>\n  <${2:DetailsPanel} />\n</Suspense>${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('contextValue')) {
    options.push(reactHookCompletion('useContext', 'contextValue', 'React context value with import', 'const ${1:value} = useContext(${2:Context});${0}'));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('listItems')) {
    options.push(snippetCompletion('{${1:items}.map((${2:item}) => (\n  <li key={${2:item}.${3:id}}>{${2:item}.${4:name}}</li>\n))}${0}', { label: 'listItems', detail: 'Render keyed React list items', type: 'text' }));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('emptyState')) {
    options.push(snippetCompletion('{${1:items}.length === 0 ? (\n  <p>${2:No items yet}</p>\n) : (\n  <ul>\n    {${1:items}.map((${3:item}) => <li key={${3:item}.${4:id}}>{${3:item}.${5:name}}</li>)}\n  </ul>\n)}${0}', { label: 'emptyState', detail: 'List with empty state and stable keys', type: 'text' }));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('labeledInput')) {
    options.push(snippetCompletion('<label htmlFor="${1:field}">${2:Label}</label>\n<input id="${1:field}" name="${1:field}" type="${3:text}" />${0}', { label: 'labeledInput', detail: 'Accessible React label and input pair', type: 'text' }));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('pendingButton')) {
    options.push(snippetCompletion('<button type="submit" disabled={${1:isPending}} aria-busy={${1:isPending}}>\n  {${1:isPending} ? "${2:Saving…}" : "${3:Save}"}\n</button>${0}', { label: 'pendingButton', detail: 'Submit button with pending and busy states', type: 'text' }));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('responsiveImage')) {
    options.push(snippetCompletion('<picture>\n  <source media="(min-width: ${1:768px})" srcSet="${2:/images/large.webp}" />\n  <img src="${3:/images/small.webp}" alt="${4:Describe the image}" loading="lazy" decoding="async" />\n</picture>${0}', { label: 'responsiveImage', detail: 'Responsive React picture with accessible image', type: 'text' }));
  }
  if (/\.(jsx|tsx)$/i.test(file) && matches('validatedInput')) {
    options.push(snippetCompletion('<label htmlFor="${1:field}">${2:Label}</label>\n<input id="${1:field}" aria-invalid={${3:hasError}} aria-describedby={${3:hasError} ? "${1:field}-error" : undefined} />\n{${3:hasError} && <p id="${1:field}-error" role="alert">${4:Error message}</p>}${0}', { label: 'validatedInput', detail: 'React input linked to validation message', type: 'text' }));
  }
  if (/\.(html|htm)$/i.test(file) && matches('detailsDisclosure')) {
    options.push(snippetCompletion('<details>\n  <summary>${1:More information}</summary>\n  <p>${2:Details go here.}</p>\n</details>${0}', { label: 'detailsDisclosure', detail: 'Native accessible disclosure', type: 'text' }));
  }
  if (/\.(html|htm)$/i.test(file) && matches('nativeDialog')) {
    options.push(snippetCompletion('<dialog id="${1:details-dialog}" aria-labelledby="${1:details-dialog}-title">\n  <h2 id="${1:details-dialog}-title">${2:Dialog title}</h2>\n  <p>${3:Dialog content}</p>\n  <form method="dialog">\n    <button type="submit">${4:Close}</button>\n  </form>\n</dialog>${0}', { label: 'nativeDialog', detail: 'Labeled native dialog with close button', type: 'text' }));
  }
  if (/\.(html|htm)$/i.test(file) && matches('skipLink')) {
    options.push(snippetCompletion('<a href="#${1:main-content}" class="skip-link">Skip to main content</a>\n<main id="${1:main-content}">\n  ${0}\n</main>', { label: 'skipLink', detail: 'Keyboard skip link and matching main landmark', type: 'text' }));
  }
  if (/\.(html|htm)$/i.test(file) && matches('radioGroup')) {
    options.push(snippetCompletion('<fieldset>\n  <legend>${1:Choose an option}</legend>\n  <label><input type="radio" name="${2:choice}" value="${3:first}" /> ${4:First}</label>\n  <label><input type="radio" name="${2:choice}" value="${5:second}" /> ${6:Second}</label>\n</fieldset>${0}', { label: 'radioGroup', detail: 'Labeled radio group with shared name', type: 'text' }));
  }
  if (/\.(html|htm)$/i.test(file) && matches('pictureSources')) {
    options.push(snippetCompletion('<picture>\n  <source type="image/avif" srcset="${1:image.avif}" />\n  <source type="image/webp" srcset="${2:image.webp}" />\n  <img src="${3:image.jpg}" alt="${4:Describe the image}" width="${5:800}" height="${6:600}" loading="lazy" decoding="async" />\n</picture>${0}', { label: 'pictureSources', detail: 'Modern image formats with sized fallback', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('flexc')) {
    options.push(snippetCompletion('display: flex;\n  align-items: center;\n  gap: ${1:1rem};${0}', { label: 'flexc', detail: 'Flex container', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('gridc')) {
    options.push(snippetCompletion('display: grid;\n  grid-template-columns: repeat(${1:2}, minmax(0, 1fr));\n  gap: ${2:1rem};${0}', { label: 'gridc', detail: 'Grid container', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('mediaq')) {
    options.push(snippetCompletion('@media (min-width: ${1:768px}) {\n  ${0}\n}', { label: 'mediaq', detail: 'Responsive media query', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('containerq')) {
    options.push(snippetCompletion('@container (min-width: ${1:30rem}) {\n  ${0}\n}', { label: 'containerq', detail: 'Container query', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('focusv')) {
    options.push(snippetCompletion('${1:.control}:focus-visible {\n  outline: ${2:2px} solid currentColor;\n  outline-offset: ${3:2px};\n}${0}', { label: 'focusv', detail: 'Visible keyboard focus', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('autogrid')) {
    options.push(snippetCompletion('display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, ${1:16rem}), 1fr));\n  gap: ${2:1rem};${0}', { label: 'autogrid', detail: 'Responsive auto-fit grid', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('reduceMotion')) {
    options.push(snippetCompletion('@media (prefers-reduced-motion: reduce) {\n  ${1:.element} {\n    animation: none;\n    transition: none;\n  }\n}${0}', { label: 'reduceMotion', detail: 'Reduced motion override', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('darkScheme')) {
    options.push(snippetCompletion('@media (prefers-color-scheme: dark) {\n  ${1::root} {\n    color-scheme: dark;\n    background: ${2:#111827};\n    color: ${3:#f9fafb};\n  }\n}${0}', { label: 'darkScheme', detail: 'System dark color scheme', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('fluidType')) {
    options.push(snippetCompletion('font-size: clamp(${1:1rem}, ${2:calc(1rem + 1vw)}, ${3:2rem});${0}', { label: 'fluidType', detail: 'Fluid type scale', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('srOnly')) {
    options.push(snippetCompletion('${1:.sr-only} {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}${0}', { label: 'srOnly', detail: 'Screen-reader-only utility', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('logicalBox')) {
    options.push(snippetCompletion('padding-block: ${1:1rem};\n  padding-inline: ${2:1.5rem};\n  margin-block: ${3:0};\n  margin-inline: ${4:auto};${0}', { label: 'logicalBox', detail: 'Direction-aware spacing', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('safeArea')) {
    options.push(snippetCompletion('padding-block: max(${1:1rem}, env(safe-area-inset-top)) max(${1:1rem}, env(safe-area-inset-bottom));\n  padding-inline: max(${2:1rem}, env(safe-area-inset-left)) max(${2:1rem}, env(safe-area-inset-right));${0}', { label: 'safeArea', detail: 'Viewport safe-area padding', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('stickyHeader')) {
    options.push(snippetCompletion('position: sticky;\n  top: ${1:0};\n  z-index: ${2:10};\n  background: ${3:var(--surface, #fff)};${0}', { label: 'stickyHeader', detail: 'Sticky header with stacking and background', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('supportsFeature')) {
    options.push(snippetCompletion('@supports (${1:display}: ${2:grid}) {\n  ${3:.selector} {\n    ${0}\n  }\n}', { label: 'supportsFeature', detail: 'CSS feature query with editable condition', type: 'text' }));
  }
  if (/\.(css|scss|sass|less)$/i.test(file) && matches('scrollSnap')) {
    options.push(snippetCompletion('display: flex;\n  overflow-x: auto;\n  scroll-snap-type: x ${1:mandatory};\n  scroll-padding-inline: ${2:1rem};\n  gap: ${3:1rem};\n  & > * { scroll-snap-align: ${4:start}; }${0}', { label: 'scrollSnap', detail: 'Horizontal scroll-snap container and items', type: 'text' }));
  }
  return options.length ? { from: word.from, options } : null;
}
