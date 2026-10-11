import { snippet, snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { keymap, type EditorView } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';

/**
 * Visual Studio's C# code snippets (shortcut + Tab), plus test and step-definition ones for this kind of repository.
 * ${name} fields are visited with Tab; the class name is filled in where Visual Studio does ($classname$).
 */
const templates: { label: string; detail: string; body: (cls: string) => string }[] = [
  { label: 'prop', detail: 'Auto-implemented property', body: () => 'public ${int} ${MyProperty} { get; set; }' },
  { label: 'propfull', detail: 'Property with backing field', body: () => 'private ${int} ${myVar};\n\npublic ${int} ${MyProperty}\n{\n\tget { return ${myVar}; }\n\tset { ${myVar} = value; }\n}' },
  { label: 'ctor', detail: 'Constructor', body: (cls) => `public ${cls}()\n{\n\t\${}\n}` },
  { label: 'for', detail: 'for loop', body: () => 'for (int ${i} = 0; ${i} < ${length}; ${i}++)\n{\n\t${}\n}' },
  { label: 'foreach', detail: 'foreach loop', body: () => 'foreach (var ${item} in ${collection})\n{\n\t${}\n}' },
  { label: 'if', detail: 'if statement', body: () => 'if (${true})\n{\n\t${}\n}' },
  { label: 'else', detail: 'else block', body: () => 'else\n{\n\t${}\n}' },
  { label: 'while', detail: 'while loop', body: () => 'while (${true})\n{\n\t${}\n}' },
  { label: 'try', detail: 'try / catch', body: () => 'try\n{\n\t${}\n}\ncatch (${Exception} ${ex})\n{\n\tthrow;\n}' },
  { label: 'tryf', detail: 'try / finally', body: () => 'try\n{\n\t${}\n}\nfinally\n{\n\t\n}' },
  { label: 'using', detail: 'using statement', body: () => 'using (${resource})\n{\n\t${}\n}' },
  { label: 'switch', detail: 'switch statement', body: () => 'switch (${value})\n{\n\tcase ${0}:\n\t\t${}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}' },
  { label: 'cw', detail: 'Console.WriteLine', body: () => 'Console.WriteLine(${});' },
  { label: 'class', detail: 'class', body: () => 'public class ${MyClass}\n{\n\t${}\n}' },
  { label: 'interface', detail: 'interface', body: () => 'public interface ${IInterface}\n{\n\t${}\n}' },
  { label: 'test', detail: 'NUnit test method', body: () => '[Test]\npublic void ${Method_Scenario_Expected}()\n{\n\t${}\n}' },
  { label: 'testa', detail: 'NUnit async test method', body: () => '[Test]\npublic async Task ${Method_Scenario_Expected}()\n{\n\t${}\n}' },
  { label: 'fact', detail: 'xUnit fact', body: () => '[Fact]\npublic void ${Method_Scenario_Expected}()\n{\n\t${}\n}' },
  { label: 'given', detail: 'Given step definition', body: () => '[Given(@"${the step text}")]\npublic void ${GivenTheStepText}()\n{\n\t${}\n}' },
  { label: 'when', detail: 'When step definition', body: () => '[When(@"${the step text}")]\npublic void ${WhenTheStepText}()\n{\n\t${}\n}' },
  { label: 'then', detail: 'Then step definition', body: () => '[Then(@"${the step text}")]\npublic void ${ThenTheStepText}()\n{\n\t${}\n}' },
];

/** The name of the class enclosing a position (for ctor), by scanning backwards for "class Name". */
function enclosingClass(view: EditorView, pos: number) {
  const before = view.state.sliceDoc(Math.max(0, pos - 20000), pos);
  const all = [...before.matchAll(/\b(?:class|record|struct)\s+([A-Za-z_]\w*)/g)];
  return all.at(-1)?.[1] ?? 'MyClass';
}
const expand = (view: EditorView, body: string, from: number, to: number) => snippet(body.replace(/\t/g, '    '))(view, null, from, to);

/** Snippets as completions (shown with IntelliSense when the typed word matches a shortcut). */
export function snippetOptions(view: EditorView, pos: number): Completion[] {
  return templates.map((t) => snippetCompletion(t.body(enclosingClass(view, pos)).replace(/\t/g, '    '), { label: t.label, detail: `${t.detail} (snippet)`, type: 'text', boost: -10 }));
}

/** shortcut + Tab expands, as in Visual Studio. */
export function snippetTab(): Extension {
  return Prec.high(keymap.of([{
    key: 'Tab',
    run: (view) => {
      const r = view.state.selection.main;
      if (!r.empty) return false;
      const line = view.state.doc.lineAt(r.head);
      const word = /([A-Za-z]+)$/.exec(line.text.slice(0, r.head - line.from))?.[1];
      const t = word && templates.find((x) => x.label === word);
      // Only a whole word at the end of the indentation or after "{" / ";" (not inside an identifier like "context").
      if (!t || !/^\s*$|[{;}]\s*$/.test(line.text.slice(0, r.head - line.from - word.length))) return false;
      expand(view, t.body(enclosingClass(view, r.head)), r.head - word.length, r.head);
      return true;
    },
  }]));
}
