import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cycleStepKeyword, scenarioToOutline, tableInsertRow, tableAddColumn, tableDeleteColumn, tableSortByColumn, testFilter, selectScenario, renameTag } from '../src/editor/gherkinTools';

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
  it('X53 Table Delete Column: the caret\'s column goes from every row', () => {
    expect(run('| name | age | city |\n| ada  | 3‸6  | Oslo |', tableDeleteColumn, true)).toBe('| name | city |\n| ada  | ¦Oslo |');
    expect(run('| a |\n| ‸1 |', tableDeleteColumn)).toBe('| a |\n| 1 |');
  });
  it('X54 Table Sort by Column: rows under the header, natural order; again reverses', () => {
    const doc = '| name  | n  |\n| bob   | 10 |\n| ada   | 9  |\n| Cy    | 2  |';
    expect(run(doc.replace('| n ', '| ‸n '), tableSortByColumn)).toBe('| name | n  |\n| Cy   | 2  |\n| ada  | 9  |\n| bob  | 10 |');
    expect(run('| name | n  |\n| Cy   | 2  |\n| ada  | 9  |\n| bob  | 10 |'.replace('| n ', '| ‸n '), tableSortByColumn)).toBe('| name | n  |\n| bob  | 10 |\n| ada  | 9  |\n| Cy   | 2  |');
  });
  it('X55 Copy Test Filter: the generated class / method names', () => {
    const state = EditorState.create({ doc: 'Feature: User login\n\n  Scenario: Sign in with valid credentials (happy path)\n    Given x' });
    expect(testFilter(state, 4)).toBe('dotnet test --filter "FullyQualifiedName~UserLoginFeature.SignInWithValidCredentialsHappyPath"');
    expect(testFilter(state, 1)).toBe('dotnet test --filter "FullyQualifiedName~UserLoginFeature"');
  });
  it('X56 Select Scenario: tags through Examples', () => {
    const doc = 'Feature: F\n  @a\n  Scenario Outline: S\n    Given "<x>"‸\n    Examples:\n      | x |\n      | 1 |\n\n  Scenario: T\n    Given y';
    let state = EditorState.create({ doc: doc.replace('‸', ''), selection: { anchor: doc.indexOf('‸') } });
    const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
    selectScenario(view as unknown as EditorView);
    expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe('  @a\n  Scenario Outline: S\n    Given "<x>"\n    Examples:\n      | x |\n      | 1 |');
  });
  it('X77 Rename Tag: on tag lines only', () => {
    expect(renameTag('@smoke @slow\r\nFeature: F\r\n  The @smoke text stays\r\n  @smoke-test @smoke\r\n  Scenario: S', '@smoke', '@quick')).toBe('@quick @slow\r\nFeature: F\r\n  The @smoke text stays\r\n  @smoke-test @quick\r\n  Scenario: S');
  });
});
