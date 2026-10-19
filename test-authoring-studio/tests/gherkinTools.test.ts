import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cycleStepKeyword, scenarioToOutline, tableInsertRow, tableAddColumn } from '../src/editor/gherkinTools';

/** Runs an editor command on `doc` with the selection between « and » (or a caret at ‸); with `caret`, the result marks the caret with ¦. */
function run(doc: string, cmd: (v: EditorView) => boolean, caret = false) {
  const a = doc.indexOf('«'), b = doc.indexOf('»'), c = doc.indexOf('‸');
  const text = doc.replace(/[«»‸]/g, '');
  const selection = a >= 0 ? { anchor: a, head: b - 1 } : { anchor: Math.max(0, c) };
  let state = EditorState.create({ doc: text, selection });
  const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
  cmd(view as unknown as EditorView);
  const out = state.doc.toString();
  const h = state.selection.main.head;
  return caret ? out.slice(0, h) + '¦' + out.slice(h) : out;
}

describe('Gherkin tools (IDE-FEATURES X49…)', () => {
  it('X49 Cycle Step Keyword: Given → When → Then → And → But → Given', () => {
    expect(run('  Given a ‸user', cycleStepKeyword)).toBe('  When a user');
    expect(run('  But x‸', cycleStepKeyword)).toBe('  Given x');
    expect(run('«  Then a\n  And b»', cycleStepKeyword)).toBe('  And a\n  But b');
    expect(run('  Feature: ‸x', cycleStepKeyword)).toBe('  Feature: x');
  });
  it('X50 Convert Scenario to Outline: quoted values become parameters with an Examples table', () => {
    const doc = 'Feature: F\n\n  @smoke\n  Scenario: Sign in\n    Given the user "ada" with "secret"\n    When "ada" signs in‸\n\n  Scenario: Other\n    Given x';
    expect(run(doc, scenarioToOutline)).toBe('Feature: F\n\n  @smoke\n  Scenario Outline: Sign in\n    Given the user "<p1>" with "<p2>"\n    When "<p1>" signs in\n\n    Examples:\n      | p1  | p2     |\n      | ada | secret |\n\n  Scenario: Other\n    Given x');
    expect(run('Feature: F\n  Scenario: S\n    Given no ‸values', scenarioToOutline)).toBe('Feature: F\n  Scenario: S\n    Given no values');
  });
  it('X51 Table Insert Row: an empty aligned row below, caret in its first cell', () => {
    expect(run('    | name | age |\n    | ada | 3‸6 |\n    | bob | 41 |', tableInsertRow, true)).toBe('    | name | age |\n    | ada  | 36  |\n    | ¦     |     |\n    | bob  | 41  |');
    expect(run('  Given ‸x', tableInsertRow)).toBe('  Given x');
  });
  it('X52 Table Add Column: an empty column after the caret\'s, caret in the header cell', () => {
    expect(run('| a | b |\n| 1‸ | 2 |', tableAddColumn, true)).toBe('| a | ¦ | b |\n| 1 |  | 2 |');
  });
});
