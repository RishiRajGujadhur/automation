import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { linter, type Diagnostic } from '@codemirror/lint';
import { autocompletion, snippetCompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import { hoverTooltip, keymap, type EditorView } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { gherkin } from '@codemirror/legacy-modes/mode/gherkin';
import type { Binding } from '../types';

const STEP = /^(\s*)(Given|When|Then|And|But|\*)(\s+)(.*)$/;
const api = async <T>(url: string, body?: unknown): Promise<T> => {
  const r = await fetch('/api' + url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('request failed');
  return r.json();
};

/** Step lines with their resolved primary keyword (And/But inherit), skipping doc strings. */
export function stepLines(doc: string) {
  const out: { line: number; from: number; keyword: string; resolved: string; text: string; textFrom: number }[] = [];
  let last = 'Given', offset = 0, inDoc = false, outline = false;
  for (const [i, raw] of doc.split('\n').entries()) {
    const t = raw.trim();
    if (t.startsWith('"""') || t.startsWith('```')) inDoc = !inDoc;
    else if (!inDoc) {
      if (/^(Scenario|Background|Example|Rule|Feature)\b/.test(t)) { last = 'Given'; outline = /^Scenario (Outline|Template)/.test(t); }
      const m = STEP.exec(raw);
      if (m) {
        const resolved = ['Given', 'When', 'Then'].includes(m[2]) ? m[2] : last;
        last = resolved;
        if (!(outline && /<[^>]+>/.test(m[4]))) out.push({ line: i + 1, from: offset, keyword: m[2], resolved, text: m[4].trimEnd(), textFrom: offset + m[1].length + m[2].length + m[3].length });
      }
    }
    offset += raw.length + 1;
  }
  return out;
}

/** 1. Real-time syntax errors from the official Cucumber Gherkin parser. */
export const gherkinSyntaxLinter = linter(
  (view) => {
    const src = view.state.doc.toString();
    if (!src.trim()) return [];
    try {
      new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(src);
      return [];
    } catch (e) {
      const errors = ((e as { errors?: { message: string; location?: { line: number; column?: number } }[] }).errors ?? [e as { message: string; location?: { line: number; column?: number } }]);
      return errors.map((err): Diagnostic => {
        const lineNo = Math.min(view.state.doc.lines, Math.max(1, err.location?.line ?? 1));
        const line = view.state.doc.line(lineNo);
        return { from: line.from, to: line.to, severity: 'error', source: 'Gherkin', message: err.message.replace(/^\(\d+:\d+\):\s*/, '') };
      });
    }
  },
  { delay: 300 },
);

/** 2. Steps with no binding, or ambiguous bindings, flagged against the repository index. */
export const bindingLinter = linter(
  async (view) => {
    const lines = stepLines(view.state.doc.toString()).slice(0, 100);
    if (!lines.length) return [];
    try {
      const res = await api<{ status: string; binding: { pattern: string; file: string; line: number } | null }[]>('/steps/match', { steps: lines.map((l) => ({ keyword: l.resolved, text: l.text })) });
      return lines.flatMap((l, i): Diagnostic[] => {
        const r = res[i];
        if (!r || r.status === 'Matched') return [];
        const to = l.textFrom + l.text.length;
        return [{
          from: l.textFrom,
          to,
          severity: r.status === 'Ambiguous' ? 'warning' : 'warning',
          source: 'Bindings',
          message: r.status === 'Ambiguous' ? `Ambiguous: more than one ${l.resolved} binding matches this text.` : `No ${l.resolved} binding matches this step. Use autocomplete (Ctrl+Space) to pick an existing step, or propose a new binding.`,
        }];
      });
    } catch {
      return [];
    }
  },
  { delay: 700 },
);

/** Pattern → snippet template: regex groups / Cucumber parameters become tab-stop fields named after the C# parameters. */
export function bindingSnippet(b: Binding) {
  let n = 0;
  const name = () => b.parameters.filter((p) => p.type !== 'Table')[n++]?.name ?? `value${n}`;
  return b.pattern
    .replace(/^\^|\$$/g, '')
    .replace(/[{}]/g, (c) => c) // keep braces; handled below
    .replace(/\((?:\.\*|\.\+|\[\^"\]\*|\\d\+|\[\^\s\]\+)\)|\{(?:string|int|float|word|)\}/g, (m) => (m === '{string}' ? `"\${${name()}}"` : `\${${name()}}`))
    .replace(/\\(.)/g, '$1');
}
const keywordOptions: Completion[] = ['Feature: ', 'Background:', 'Scenario: ', 'Scenario Outline: ', 'Examples:', 'Rule: ', 'Given ', 'When ', 'Then ', 'And ', 'But '].map((k) => ({ label: k.trim(), apply: k, type: 'keyword', boost: k.startsWith('Given') || k.startsWith('When') || k.startsWith('Then') ? 2 : 0 }));

/** 3–4. Autocomplete: keywords at line start; existing steps after a keyword (server-ranked, snippet placeholders). */
async function gherkinCompletions(ctx: CompletionContext): Promise<CompletionResult | null> {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const m = /^(\s*)(Given|When|Then|And|But|\*)\s+(.*)$/.exec(before);
  if (!m) {
    const word = /^\s*(\w*)$/.exec(before);
    if (!word || (!word[1] && !ctx.explicit)) return null;
    return { from: ctx.pos - word[1].length, options: keywordOptions, validFor: /^\w*$/ };
  }
  const typed = m[3];
  if (typed.length < 2 && !ctx.explicit) return null;
  const doc = ctx.state.doc.toString();
  const resolved = ['Given', 'When', 'Then'].includes(m[2]) ? m[2] : (stepLines(doc.slice(0, line.from)).at(-1)?.resolved ?? 'Given');
  const q = typed.replace(/"[^"]*"?/g, ' ').trim();
  let items: Binding[] = [];
  try {
    items = (await api<{ items: Binding[] }>('/steps?' + new URLSearchParams({ q, keyword: resolved, limit: '12' }))).items;
  } catch {
    return null;
  }
  if (ctx.aborted) return null;
  return {
    from: line.from + m[1].length + m[2].length + (before.length - m[1].length - m[2].length - typed.length),
    filter: false,
    options: items.map((b, i) => {
      const tpl = bindingSnippet(b);
      return snippetCompletion(tpl, {
        label: tpl.replace(/\$\{([^}]+)\}/g, '$1'),
        detail: `${b.usages} uses`,
        info: () => {
          const el = document.createElement('div');
          el.className = 'cm-binding-info';
          el.innerHTML = '';
          const code = document.createElement('code');
          code.textContent = `[${b.keyword}(@"${b.pattern}")]`;
          const meta = document.createElement('div');
          meta.textContent = `${b.className}.${b.method.split('.').pop()?.split('(')[0]} · ${b.file}:${b.line}`;
          el.append(code, meta);
          return el;
        },
        type: 'function',
        boost: 50 - i,
      });
    }),
  };
}

/** 5. Hover a step to see the binding it resolves to. */
const stepHover = hoverTooltip(async (view, pos) => {
  const line = view.state.doc.lineAt(pos);
  if (!STEP.test(line.text)) return null;
  const all = stepLines(view.state.doc.toString());
  const step = all.find((s) => s.line === line.number);
  if (!step) return null;
  try {
    const [r] = await api<{ status: string; binding: { pattern: string; file: string; line: number } | null }[]>('/steps/match', { steps: [{ keyword: step.resolved, text: step.text }] });
    return {
      pos: step.textFrom,
      end: line.to,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-binding-info';
        const head = document.createElement('strong');
        head.textContent = r.status === 'Matched' ? 'Bound step' : r.status === 'Ambiguous' ? 'Ambiguous step' : 'No binding';
        dom.append(head);
        if (r.binding) {
          const code = document.createElement('code');
          code.textContent = `[${step.resolved}(@"${r.binding.pattern}")]`;
          const meta = document.createElement('div');
          meta.textContent = `${r.binding.file}:${r.binding.line}`;
          dom.append(code, meta);
        }
        return { dom };
      },
    };
  } catch {
    return null;
  }
});

/** 9. Formatter: canonical indentation and aligned table columns. */
export function formatGherkin(src: string) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inDoc = false, docIndent = 0;
  const indentFor = (t: string) =>
    /^Feature:/.test(t) ? 0 : /^(Rule|Background|Scenario|Scenario Outline|Scenario Template|Example):?/.test(t) ? 2 : /^Examples:/.test(t) ? 4 : /^(Given|When|Then|And|But|\*)\s/.test(t) ? 4 : /^@/.test(t) ? -1 : 6;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (t.startsWith('"""') || t.startsWith('```')) {
      if (!inDoc) { docIndent = 6; out.push(' '.repeat(docIndent) + t); inDoc = true; } else { out.push(' '.repeat(docIndent) + t); inDoc = false; }
      continue;
    }
    if (inDoc) { out.push(raw); continue; }
    if (t.startsWith('|')) {
      // gather the table block and align columns
      const block: string[][] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        block.push(lines[j].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        j++;
      }
      const widths = block.reduce<number[]>((w, row) => row.map((c, k) => Math.max(w[k] ?? 0, c.length)), []);
      const prev = out.slice().reverse().find((l) => l.trim());
      const indent = prev && /^\s*Examples:/.test(prev) ? 6 : 6;
      for (const row of block) out.push(' '.repeat(indent) + '| ' + row.map((c, k) => c.padEnd(widths[k])).join(' | ') + ' |');
      i = j - 1;
      continue;
    }
    if (!t) { out.push(''); continue; }
    if (t.startsWith('#')) { out.push((lines[i + 1] ? ' '.repeat(Math.max(0, indentFor(lines[i + 1].trim()))) : '') + t); continue; }
    let ind = indentFor(t);
    if (ind === -1) ind = indentFor((lines.slice(i + 1).find((l) => l.trim() && !l.trim().startsWith('@')) ?? '').trim());
    out.push(' '.repeat(Math.max(0, ind)) + t.replace(/^(Given|When|Then|And|But)\s+/, '$1 '));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
}

export function gherkinExtensions(opts: { onSave?: () => void; onValidate?: () => void } = {}): Extension[] {
  return [
    StreamLanguage.define(gherkin),
    EditorState.languageData.of(() => [{ commentTokens: { line: '#' } }]),
    gherkinSyntaxLinter,
    bindingLinter,
    autocompletion({ override: [gherkinCompletions], activateOnTyping: true, maxRenderedOptions: 12, icons: true }),
    stepHover,
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { opts.onSave?.(); return true; } },
      { key: 'Mod-Enter', preventDefault: true, run: () => { opts.onValidate?.(); return true; } },
      { key: 'Shift-Alt-f', preventDefault: true, run: (v: EditorView) => { const next = formatGherkin(v.state.doc.toString()); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } }); return true; } },
    ]),
  ];
}
