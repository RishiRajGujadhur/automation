import { Facet } from '@codemirror/state';
import { splitRow } from './gherkinTables';

/** The feature file an editor shows (Format Document looks up its .editorconfig settings). */
export const featureFile = Facet.define<string, string>({ combine: (v) => v[0] ?? '' });
/** .editorconfig Gherkin settings per feature file (null: none apply, use the studio's own layout). */
export const formatSettings = new Map<string, GherkinFormat | null>();

/**
 * Gherkin formatting settings, as Reqnroll reads them from .editorconfig
 * (https://docs.reqnroll.net/latest/ide-integrations/visual-studio/editorconfig.html). Defaults are Reqnroll's.
 */
export type GherkinFormat = {
  indent: string; // one level: indent_style / indent_size (default 4 spaces)
  indentFeatureChildren: boolean;
  indentRuleChildren: boolean;
  indentSteps: boolean;
  indentAndSteps: boolean;
  indentDataTable: boolean;
  indentDocString: boolean;
  indentExamples: boolean;
  indentExamplesTable: boolean;
  cellPadding: number;
  rightAlignNumeric: boolean;
};
export const reqnrollDefaults: GherkinFormat = {
  indent: '    ', indentFeatureChildren: false, indentRuleChildren: false, indentSteps: true, indentAndSteps: false,
  indentDataTable: true, indentDocString: true, indentExamples: false, indentExamplesTable: true, cellPadding: 1, rightAlignNumeric: true,
};

/** Settings from .editorconfig properties (already merged for the file); undefined when none concern Gherkin. */
export function formatFromEditorConfig(props: Record<string, string>): GherkinFormat | undefined {
  const keys = Object.keys(props);
  if (!keys.some((k) => k.startsWith('gherkin_')) && !props.__feature_section) return undefined;
  const bool = (k: string, d: boolean) => (props[k] === undefined ? d : props[k].toLowerCase() === 'true');
  const size = Number(props.indent_size === 'tab' ? props.tab_width : props.indent_size) || 4;
  return {
    indent: props.indent_style === 'tab' ? '\t' : ' '.repeat(size),
    indentFeatureChildren: bool('gherkin_indent_feature_children', false),
    indentRuleChildren: bool('gherkin_indent_rule_children', false),
    indentSteps: bool('gherkin_indent_steps', true),
    indentAndSteps: bool('gherkin_indent_and_steps', false),
    indentDataTable: bool('gherkin_indent_datatable', true),
    indentDocString: bool('gherkin_indent_docstring', true),
    indentExamples: bool('gherkin_indent_examples', false),
    indentExamplesTable: bool('gherkin_indent_examples_table', true),
    cellPadding: Math.max(0, Math.min(8, Number(props.gherkin_table_cell_padding_size ?? 1) || 0)),
    rightAlignNumeric: bool('gherkin_table_cell_right_align_numeric_content', true),
  };
}

const NUMERIC = /^[-+]?(\d+([.,]\d+)?|[.,]\d+)$/;
function table(rows: string[], level: string, o: GherkinFormat) {
  const cells = rows.map(splitRow);
  const cols = Math.max(...cells.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, k) => Math.max(...cells.map((r) => (r[k] ?? '').length)));
  const pad = ' '.repeat(o.cellPadding);
  return cells.map((r) => `${level}|${widths.map((w, k) => { const c = r[k] ?? ''; return pad + (o.rightAlignNumeric && NUMERIC.test(c) ? c.padStart(w) : c.padEnd(w)) + pad; }).join('|')}|`);
}

/** Formats a feature file with Reqnroll's rules and the given settings. */
export function formatGherkinWith(src: string, o: GherkinFormat) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const at = (n: number) => o.indent.repeat(Math.max(0, n));
  const F = o.indentFeatureChildren ? 1 : 0;
  let ruleLevel = -1; // level of the current Rule (-1: none)
  let scenario = F, step = F + 1, lastStep = step, examples = -1, header = 0;
  let mode: 'feature' | 'scenario' | 'examples' = 'feature';
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // Doc strings: delimiter lines at the docstring level, content shifted by the same amount (relative indent kept).
    if (t.startsWith('"""') || t.startsWith('```')) {
      const fence = t.slice(0, 3);
      const base = lastStep + (o.indentDocString ? 1 : 0);
      const oldIndent = lines[i].length - lines[i].trimStart().length;
      out.push(at(base) + t);
      let j = i + 1;
      for (; j < lines.length && !lines[j].trim().startsWith(fence); j++) {
        const raw = lines[j];
        const rel = Math.max(0, (raw.length - raw.trimStart().length) - oldIndent);
        out.push(raw.trim() ? at(base) + ' '.repeat(rel) + raw.trimStart() : '');
      }
      if (j < lines.length) out.push(at(base) + lines[j].trim());
      i = j;
      continue;
    }
    if (t.startsWith('|')) {
      const block: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) block.push(lines[j++].trim());
      const level = (mode as string) === 'examples' ? examples + (o.indentExamplesTable ? 1 : 0) : lastStep + (o.indentDataTable ? 1 : 0);
      out.push(...table(block, at(level), o));
      i = j - 1;
      continue;
    }
    if (!t) { out.push(''); continue; }
    // Tags and comments sit at the level of the next element.
    if (t.startsWith('@') || t.startsWith('#')) {
      const next = lines.slice(i + 1).find((l) => l.trim() && !l.trim().startsWith('@') && !l.trim().startsWith('#'))?.trim() ?? '';
      out.push(at(t.startsWith('#') && /^#\s*language\s*:/.test(t) ? 0 : levelOf(next)) + t);
      continue;
    }
    const level = levelOf(t);
    out.push(at(level) + t.replace(/^(Given|When|Then|And|But|\*)\s+/, '$1 '));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');

  // Level of a line (and the mode it starts), following Feature → Rule → Scenario → Step / Examples.
  function levelOf(t: string): number {
    if (/^Feature:/.test(t)) { mode = 'feature'; ruleLevel = -1; header = 0; return 0; }
    if (/^Rule:/.test(t)) { mode = 'feature'; ruleLevel = F; header = F; return F; }
    if (/^(Background|Scenario Outline|Scenario Template|Scenario|Example):/.test(t)) {
      scenario = ruleLevel >= 0 ? ruleLevel + (o.indentRuleChildren ? 1 : 0) : F;
      step = scenario + (o.indentSteps ? 1 : 0);
      lastStep = step;
      mode = 'scenario';
      header = scenario;
      return scenario;
    }
    if (/^(Examples|Scenarios):/.test(t)) { examples = scenario + (o.indentExamples ? 1 : 0); mode = 'examples'; header = examples; return examples; }
    if (/^(Given|When|Then|And|But|\*)\s/.test(t) && mode !== 'feature') {
      if (mode === 'examples') mode = 'scenario';
      lastStep = step + (o.indentAndSteps && /^(And|But)\s/.test(t) ? 1 : 0);
      return lastStep;
    }
    return header + 1; // description text under a header
  }
}
