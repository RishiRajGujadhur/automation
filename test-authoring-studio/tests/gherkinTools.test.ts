import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cycleStepKeyword, scenarioToOutline, tableInsertRow, tableAddColumn, tableDeleteColumn, tableSortByColumn, testFilter, selectScenario, renameTag, extractExamplesParameter, outlineToScenario, duplicateScenario, moveScenario, extractBackground, addExamplesTable, toggleTag, toggleScenarioComment } from '../src/editor/gherkinTools';

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
  it('X86 Extract Examples Parameter: <name> in the step, a column in every Examples table', () => {
    const doc = 'Scenario Outline: S\n  Given the user «admin» signs in as <role>\n\n  Examples:\n    | role  |\n    | owner |\n    | guest |';
    expect(run(doc, extractExamplesParameter('user'))).toBe('Scenario Outline: S\n  Given the user <user> signs in as <role>\n\n  Examples:\n    | role  | user  |\n    | owner | admin |\n    | guest | admin |');
    expect(run('Scenario: S\n  Given «x»', extractExamplesParameter('p'))).toBe('Scenario: S\n  Given x');
  });
  it('X87 Convert Outline to Scenario: one Examples row filled in', () => {
    const doc = 'Feature: F\n  Scenario Outline: Sign in as <role>‸\n    Given the user "<user>" is a <role>\n\n    Examples:\n      | user | role  |\n      | ada  | admin |\n\n  Scenario: Next';
    expect(run(doc, outlineToScenario)).toBe('Feature: F\n  Scenario: Sign in as admin\n    Given the user "ada" is a admin\n\n  Scenario: Next');
    expect(run('Scenario Outline: S‸\n  Given <a>\n  Examples:\n    | a |\n    | 1 |\n    | 2 |', outlineToScenario)).toContain('Scenario Outline');
  });
  it('X88 Duplicate Scenario: tags through Examples, "(copy)" title, caret on it', () => {
    const doc = 'Feature: F\n  @a\n  Scenario: S‸\n    Given x\n\n  Scenario: T';
    expect(run(doc, duplicateScenario, true)).toBe('Feature: F\n  @a\n  Scenario: S\n    Given x\n\n  @a\n  ¦Scenario: S (copy)\n    Given x\n\n  Scenario: T');
  });
  it('X97 / X98 Move Scenario Up / Down: whole blocks with tags', () => {
    const doc = 'Feature: F\n  Background:\n    Given b\n\n  Scenario: A\n    Given a\n\n  @t\n  Scenario: B\n    Given ‸x\n';
    expect(run(doc, moveScenario(-1), true)).toBe('Feature: F\n  Background:\n    Given b\n\n  @t\n  Scenario: B\n    Given ¦x\n\n  Scenario: A\n    Given a\n');
    expect(run(doc, moveScenario(1))).toBe(doc.replace('‸', ''));
    const top = 'Feature: F\n  Scenario: A‸\n    Given a\n  @t\n  Scenario: B\n    Given x';
    expect(run(top, moveScenario(1))).toBe('Feature: F\n  @t\n  Scenario: B\n    Given x\n  Scenario: A\n    Given a');
    expect(run(top, moveScenario(-1))).toBe(top.replace('‸', ''));
  });
  it('X99 Extract Background: common leading Given steps', () => {
    const doc = 'Feature: F\n\n  Scenario: A\n    Given the app is open\n    And the user is admin\n    When a\n\n  @t\n  Scenario: B\n    Given the app is open\n    And the user is guest\n    Then b';
    expect(run(doc, extractBackground)).toBe('Feature: F\n\n  Background:\n    Given the app is open\n\n  Scenario: A\n    Given the user is admin\n    When a\n\n  @t\n  Scenario: B\n    Given the user is guest\n    Then b');
    const withBg = 'Feature: F\n  Background:\n    Given x\n  Scenario: A\n    Given y\n    When a\n  Scenario: B\n    Given y\n    When b';
    expect(run(withBg, extractBackground)).toBe('Feature: F\n  Background:\n    Given x\n    And y\n  Scenario: A\n    When a\n  Scenario: B\n    When b');
    expect(run('Feature: F\n  Scenario: A\n    When a\n  Scenario: B\n    When a', extractBackground)).toBe('Feature: F\n  Scenario: A\n    When a\n  Scenario: B\n    When a');
  });
  it('X100 Add Examples Table: a column per parameter, caret in the first cell', () => {
    expect(run('Scenario Outline: Sign in as <role>‸\n  Given "<user>" with <role>', addExamplesTable, true)).toBe('Scenario Outline: Sign in as <role>\n  Given "<user>" with <role>\n\n  Examples:\n    | role | user |\n    | ¦     |      |');
    expect(run('Scenario: S‸\n  Given <x>', addExamplesTable)).toBe('Scenario: S\n  Given <x>');
  });
  it('X101 Toggle Tag: add on the tag line or above the title; again removes it', () => {
    expect(run('  Scenario: S‸', toggleTag('wip'))).toBe('  @wip\n  Scenario: S');
    expect(run('  @a\n  Scenario: S‸', toggleTag('@b'))).toBe('  @a @b\n  Scenario: S');
    expect(run('  @a @wip\n  Scenario: S‸', toggleTag('wip'))).toBe('  @a\n  Scenario: S');
    expect(run('  @wip\n  Scenario: S‸\n    Given x', toggleTag('wip'))).toBe('  Scenario: S\n    Given x');
  });
  it('X112 Comment / Uncomment Scenario', () => {
    const doc = 'Feature: F\n  @a\n  Scenario: S‸\n    Given x\n\n    Examples:\n\n  Scenario: T';
    const once = run(doc, toggleScenarioComment);
    expect(once).toBe('Feature: F\n  # @a\n  # Scenario: S\n    # Given x\n\n    # Examples:\n\n  Scenario: T');
    expect(run(once.replace('# Given x', '# Given ‸x'), toggleScenarioComment)).toBe('Feature: F\n  @a\n  Scenario: S\n    Given x\n\n    Examples:\n\n  Scenario: T'.replace('\n\n    Examples:', '\n\n    # Examples:'));
  });
});
