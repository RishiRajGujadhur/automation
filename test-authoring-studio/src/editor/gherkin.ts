import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { linter, type Diagnostic } from '@codemirror/lint';
import { autocompletion, snippetCompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import { hoverTooltip, keymap, EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { gherkin } from '@codemirror/legacy-modes/mode/gherkin';
import type { Binding } from '../types';
import { requestCreateStep } from './events';
import { featureFile, formatSettings, formatGherkinWith } from './gherkinFormat';
import { Trie } from '../algorithms/search';
import { levenshteinRatio, dice } from '../algorithms/strings';
import { smellChecks, type QScenario } from '../algorithms/quality';
import { algorithmOn } from '../radix2';

const STEP = /^(\s*)(Given|When|Then|And|But|\*)(\s+)(.*)$/;
const api = async <T>(url: string, body?: unknown): Promise<T> => {
  const r = await fetch('/api' + url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('request failed');
  return r.json();
};

/** Step lines with their resolved primary keyword (And/But inherit), skipping doc strings. */
export function stepLines(doc: string) {
  const out: { line: number; from: number; keyword: string; resolved: string; text: string; textFrom: number; tags: string[]; feature: string; scenario: string }[] = [];
  let last = 'Given', offset = 0, inDoc = false, outline = false;
  // Context for scoped bindings: feature / scenario names and the tags that apply (feature + scenario tags).
  let pending: string[] = [], featureTags: string[] = [], scenarioTags: string[] = [], feature = '', scenario = '';
  for (const [i, raw] of doc.split('\n').entries()) {
    const t = raw.trim();
    if (t.startsWith('"""') || t.startsWith('```')) inDoc = !inDoc;
    else if (!inDoc) {
      if (t.startsWith('@')) pending.push(...(t.match(/@[^\s@]+/g) ?? []));
      const header = /^(Feature|Scenario Outline|Scenario Template|Scenario|Example|Background|Rule):\s*(.*)$/.exec(t);
      if (header) {
        if (header[1] === 'Feature') { feature = header[2].trim(); featureTags = pending; }
        else if (header[1] !== 'Rule') { scenario = header[1] === 'Background' ? '' : header[2].trim(); scenarioTags = header[1] === 'Background' ? [] : pending; }
        pending = [];
      }
      if (/^(Scenario|Background|Example|Rule|Feature)\b/.test(t)) { last = 'Given'; outline = /^Scenario (Outline|Template)/.test(t); }
      const m = STEP.exec(raw);
      if (m) {
        const resolved = ['Given', 'When', 'Then'].includes(m[2]) ? m[2] : last;
        last = resolved;
        if (!(outline && /<[^>]+>/.test(m[4]))) out.push({ line: i + 1, from: offset, keyword: m[2], resolved, text: m[4].trimEnd(), textFrom: offset + m[1].length + m[2].length + m[3].length, tags: [...featureTags, ...scenarioTags], feature, scenario });
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

const setStepMarks = StateEffect.define<DecorationSet>();
const UNBOUND = Decoration.mark({ class: 'cm-step-unbound' });
const BOUND = Decoration.mark({ class: 'cm-step-bound' });
const PARAM = Decoration.mark({ class: 'cm-step-param' });
/** Bound / unbound / parameter marks from the last binding check (kept in place while typing). */
export const stepMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) { for (const e of tr.effects) if (e.is(setStepMarks)) return e.value; return v.map(tr.changes); },
  provide: (f) => EditorView.decorations.from(f),
});

/** 2. Steps with no binding, or ambiguous bindings, flagged against the repository index. */
export const bindingLinter = linter(
  async (view) => {
    const doc = view.state.doc;
    const lines = stepLines(doc.toString()).slice(0, 300);
    if (!lines.length) { queueMicrotask(() => view.dispatch({ effects: setStepMarks.of(Decoration.none) })); return []; }
    try {
      const res = await api<{ status: string; params: [number, number][]; binding: { pattern: string; file: string; line: number } | null }[]>('/steps/match', { steps: lines.map((l) => ({ keyword: l.resolved, text: l.text, tags: l.tags, feature: l.feature, scenario: l.scenario })) });
      // Highlighting like Reqnroll's extension: unbound steps, bound steps, and the parameters of bound steps.
      if (view.state.doc === doc) {
        const marks = lines.flatMap((l, i) => {
          const r = res[i];
          if (!r || !l.text) return [];
          const to = l.textFrom + l.text.length;
          if (r.status === 'Unmatched') return [UNBOUND.range(l.textFrom, to)];
          if (r.status !== 'Matched') return [];
          return [BOUND.range(l.textFrom, to), ...(r.params ?? []).map(([a, b]) => PARAM.range(l.textFrom + a, l.textFrom + Math.min(b, l.text.length)))];
        });
        queueMicrotask(() => { if (view.state.doc === doc) view.dispatch({ effects: setStepMarks.of(Decoration.set(marks, true)) }); });
      }
      return lines.flatMap((l, i): Diagnostic[] => {
        const r = res[i];
        if (!r || r.status === 'Matched') return [];
        const to = l.textFrom + l.text.length;
        return [{
          from: l.textFrom,
          to,
          severity: r.status === 'Ambiguous' ? 'warning' : 'warning',
          source: 'Bindings',
          message: r.status === 'Ambiguous' ? `Ambiguous: more than one ${l.resolved} binding matches this text.` : `No ${l.resolved} binding matches this step. Use autocomplete (Ctrl+Space) to pick an existing step, or create a step definition.`,
          actions: r.status === 'Ambiguous' ? [] : [{ name: 'Create step definition', apply: () => requestCreateStep({ keyword: l.resolved, text: l.text }) }],
        }];
      });
    } catch {
      return [];
    }
  },
  { delay: 700 },
);

/* ------------------------------------------------------------------ corpus-backed helpers (Settings → Algorithms) */
type CorpusStep = { keyword: string; text: string; uses: number };
let corpusCache: { at: number; promise: Promise<{ steps: CorpusStep[]; trie: Trie }> } | undefined;
/** Distinct steps already written in the repository's feature files, with a prefix trie. Refreshed every 30 s. */
function corpusSteps() {
  if (!corpusCache || Date.now() - corpusCache.at > 30_000) {
    corpusCache = {
      at: Date.now(),
      promise: api<{ features: { scenarios: { steps: { keyword: string; text: string }[] }[]; backgrounds: { steps: { keyword: string; text: string }[] }[] }[] }>('/design/corpus').then((c) => {
        const map = new Map<string, CorpusStep>();
        for (const f of c.features) for (const block of [...f.backgrounds, ...f.scenarios]) {
          let last = 'Given';
          for (const s of block.steps) {
            const k = s.keyword.trim();
            const resolved = ['Given', 'When', 'Then'].includes(k) ? k : last;
            last = resolved;
            const key = `${resolved} ${s.text}`;
            const e = map.get(key) ?? { keyword: resolved, text: s.text, uses: 0 };
            e.uses++;
            map.set(key, e);
          }
        }
        const steps = [...map.values()];
        const trie = new Trie();
        steps.forEach((s) => trie.insert(`${s.keyword} ${s.text}`, s.uses));
        return { steps, trie };
      }),
    };
    corpusCache.promise.catch(() => { corpusCache = undefined; });
  }
  return corpusCache.promise;
}

/** Near-duplicate step lint: a step that is almost, but not exactly, an existing step (suggests reuse). */
export const duplicateStepLinter = linter(
  async (view) => {
    if (!algorithmOn('duplicate-step-lint')) return [];
    const lines = stepLines(view.state.doc.toString()).slice(0, 150);
    if (!lines.length) return [];
    let steps: CorpusStep[];
    try { steps = (await corpusSteps()).steps; } catch { return []; }
    const measure = algorithmOn('levenshtein') ? levenshteinRatio : algorithmOn('dice') ? dice : null;
    if (!measure) return [];
    return lines.flatMap((l): Diagnostic[] => {
      const same = steps.filter((s) => s.keyword === l.resolved);
      if (same.some((s) => s.text === l.text)) return [];
      let best: CorpusStep | undefined, score = 0;
      const mask = (x: string) => x.toLowerCase().replace(/"[^"]*"/g, '"_"');
      const mine = mask(l.text);
      for (const s of same) { const other = mask(s.text); if (other === mine || Math.abs(other.length - mine.length) > 12) continue; const v = measure(other, mine); if (v > score) { score = v; best = s; } }
      if (!best || score < 0.85) return [];
      const target = best;
      // Keep the author's quoted arguments, in order, when adopting the existing wording.
      const args = [...l.text.matchAll(/"[^"]*"/g)].map((x) => x[0]);
      let n = 0;
      const adopted = target.text.replace(/"[^"]*"/g, (q) => args[n++] ?? q);
      return [{
        from: l.textFrom,
        to: l.textFrom + l.text.length,
        severity: 'info',
        source: 'Reuse',
        message: `Almost identical to an existing step (${Math.round(score * 100)}%): "${target.keyword} ${target.text}" (${target.uses} use${target.uses === 1 ? '' : 's'}).`,
        actions: [{ name: 'Use existing step', apply: (v, from, to) => v.dispatch({ changes: { from, to, insert: adopted } }) }],
      }];
    });
  },
  { delay: 900 },
);

/** Scenario smells from src/algorithms/quality.ts, on the open document. */
export const smellLinter = linter(
  (view) => {
    const doc = view.state.doc.toString();
    const enabled = Object.keys(smellChecks).filter(algorithmOn);
    if (!enabled.length || !doc.trim()) return [];
    const scenarios: QScenario[] = [];
    let inDoc = false;
    doc.split('\n').forEach((raw, i) => {
      const t = raw.trim();
      if (t.startsWith('"""') || t.startsWith('```')) { inDoc = !inDoc; return; }
      if (inDoc) return;
      const head = /^(Scenario Outline|Scenario Template|Scenario|Example):\s*(.*)$/.exec(t);
      if (head) { scenarios.push({ name: head[2], keyword: head[1], line: i + 1, steps: [], examplesHeader: [] }); return; }
      if (/^(Background|Rule|Feature):/.test(t)) { scenarios.push({ name: '', keyword: 'Background', line: i + 1, steps: [] }); return; }
      const cur = scenarios[scenarios.length - 1];
      if (!cur) return;
      const m = STEP.exec(raw);
      if (m) cur.steps.push({ keyword: m[2], text: m[4].trim(), line: i + 1 });
      else if (t.startsWith('|') && cur.examplesHeader && !cur.examplesHeader.length && /^\s*Examples:/.test(doc.split('\n').slice(0, i).reverse().find((x) => x.trim() && !x.trim().startsWith('#')) ?? '')) cur.examplesHeader = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    });
    const feature = { file: '', name: '', scenarios: scenarios.filter((s) => s.keyword !== 'Background') };
    return enabled.flatMap((id) => smellChecks[id](feature, { maxSteps: 10 })).map((f): Diagnostic => {
      const line = view.state.doc.line(Math.min(view.state.doc.lines, f.line));
      return { from: line.from + (line.text.length - line.text.trimStart().length), to: line.to, severity: 'info', source: 'Smell', message: f.message };
    });
  },
  { delay: 800 },
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
export async function gherkinCompletions(ctx: CompletionContext): Promise<CompletionResult | null> {
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
  // Steps already written in feature files (prefix trie), for wording that has no dedicated binding text yet.
  let written: Completion[] = [];
  if (algorithmOn('trie')) {
    try {
      const { trie } = await corpusSteps();
      const seen = new Set(items.map((b) => bindingSnippet(b).replace(/\$\{([^}]+)\}/g, '$1').toLowerCase()));
      written = trie.complete(`${resolved} ${typed}`, 6).map((x) => x.text.slice(resolved.length + 1)).filter((t) => t !== typed && !seen.has(t.toLowerCase())).map((t, i) => ({ label: t, detail: 'used in features', type: 'text', boost: -10 - i }));
    } catch { /* corpus unavailable */ }
  }
  if (ctx.aborted) return null;
  return {
    from: line.from + m[1].length + m[2].length + (before.length - m[1].length - m[2].length - typed.length),
    filter: false,
    options: [...items.map((b, i) => {
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
    }), ...written],
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
/** Format Document: Reqnroll's .editorconfig settings when the file has them, else the studio's layout. */
export function formatFeature(src: string, file?: string) {
  const o = file ? formatSettings.get(file) : undefined;
  return o ? formatGherkinWith(src, o) : formatGherkin(src);
}
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

export function gherkinExtensions(opts: { onSave?: () => void; onValidate?: () => void; onDefinition?: (step: { keyword: string; text: string; line: number }) => void } = {}): Extension[] {
  return [
    StreamLanguage.define(gherkin),
    EditorState.languageData.of(() => [{ commentTokens: { line: '#' } }]),
    gherkinSyntaxLinter,
    bindingLinter,
    stepMarks,
    duplicateStepLinter,
    smellLinter,
    autocompletion({ override: [gherkinCompletions], activateOnTyping: true, maxRenderedOptions: 12, icons: true }),
    stepHover,
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { opts.onSave?.(); return true; } },
      { key: 'Mod-Enter', preventDefault: true, run: () => { opts.onValidate?.(); return true; } },
      // F12: go to the C# step definition of the step under the cursor (like VS Code / Visual Studio).
      { key: 'F12', preventDefault: true, run: (v: EditorView) => { const n = v.state.doc.lineAt(v.state.selection.main.head).number; const s = stepLines(v.state.doc.toString()).find((x) => x.line === n); if (s) opts.onDefinition?.({ keyword: s.resolved, text: s.text, line: n }); return true; } },
      { key: 'Shift-Alt-f', preventDefault: true, run: (v: EditorView) => { const next = formatFeature(v.state.doc.toString(), v.state.facet(featureFile)); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } }); return true; } },
    ]),
  ];
}

/** Steps-only editor (no Feature/Scenario header): highlighting, binding warnings, autocomplete. */
export function scenarioExtensions(label: string): Extension[] {
  return [
    StreamLanguage.define(gherkin),
    EditorState.languageData.of(() => [{ commentTokens: { line: '#' } }]),
    bindingLinter,
    stepMarks,
    duplicateStepLinter,
    autocompletion({ override: [gherkinCompletions], activateOnTyping: true, maxRenderedOptions: 10 }),
    stepHover,
    EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', tabindex: '0' }),
    EditorView.lineWrapping,
  ];
}

/** Gherkin highlighting and syntax checks only: for feature files outside the indexed repository (no binding checks). */
export function gherkinSyntaxExtensions(): Extension[] {
  return [StreamLanguage.define(gherkin), EditorState.languageData.of(() => [{ commentTokens: { line: '#' } }]), gherkinSyntaxLinter];
}
