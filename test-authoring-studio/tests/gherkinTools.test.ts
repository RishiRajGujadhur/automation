import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cycleStepKeyword, scenarioToOutline, tableInsertRow, tableAddColumn, tableDeleteColumn, tableSortByColumn, testFilter, selectScenario, renameTag, extractExamplesParameter, outlineToScenario, duplicateScenario, moveScenario, extractBackground, addExamplesTable, toggleTag, toggleScenarioComment, pasteAsTable, tableCsv, featureStats, renameExamplesParameter, removeUnusedColumns, inlineBackground, normalizeStepKeywords, addScenario, scenarioMarkdown, tableDuplicateRow, tableDeleteRow, tableMoveColumn, tableSelectColumn, tableTranspose, tableFillDown, tableClearColumn, sortScenarios, featureOutline, tableDeleteEmptyRows, tableRemoveDuplicateRows, tableMarkdown, tagAllScenarios, removeTagEverywhere, sortTags, promoteCommonTags, insertDocString, expandOutline, wrapInRule, setLanguageHeader, scenarioName, tableInsertRowAbove, addScenarioOutline, tableColumnStats, tableColumnValues, tableFillSeries, mergeExamples, scenarioSteps, renameScenario, splitScenario, insertDataTable, tagAt, tagFilter } from '../src/editor/gherkinTools';

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
  it('X117 Paste as Gherkin Table: TSV or CSV, aligned, below a step', () => {
    expect(run('  Given the users:‸', pasteAsTable('name\tage\nAda\t36\r\nBob\t4\n'))).toBe('  Given the users:\n    | name | age |\n    | Ada  | 36  |\n    | Bob  | 4   |');
    expect(run('    ‸', pasteAsTable('a,"b, c","d""e"\n1,2,3'))).toBe('    | a | b, c | d"e |\n    | 1 | 2    | 3   |');
  });
  it('X118 Copy Table as CSV', () => {
    const state = EditorState.create({ doc: '  | name | note        |\n  | Ada  | a, "quoted" |\n  | Bob  | x \\| y      |', selection: { anchor: 5 } });
    const q = '"';
    expect(tableCsv(state)).toBe(`name,note\nAda,${q}a, ${q}${q}quoted${q}${q}${q}\nBob,x | y`);
    expect(tableCsv(EditorState.create({ doc: 'Given x' }))).toBeUndefined();
  });
  it('X129 Feature statistics', () => {
    expect(featureStats('Feature: F\n  Background:\n    Given a\n  Scenario: S\n    Given b\n    When c\n  Scenario Outline: O\n    Then <x>\n    Examples:\n      | x |\n      | 1 |\n      | 2 |\n')).toEqual({ scenarios: 2, steps: 4, examples: 2 });
  });
  it('X130 Rename Examples Parameter: steps, title and header', () => {
    const doc = 'Scenario Outline: As <role>\n  Given "<user>" is a <ro‸le>\n  Examples:\n    | user | role  |\n    | ada  | admin |';
    expect(run(doc, renameExamplesParameter('permission'))).toBe('Scenario Outline: As <permission>\n  Given "<user>" is a <permission>\n  Examples:\n    | user | permission |\n    | ada  | admin      |');
    expect(run('Scenario Outline: S\n  Given <a>\n  Examples:\n    | a‸ |\n    | 1 |', renameExamplesParameter('<b>'))).toBe('Scenario Outline: S\n  Given <b>\n  Examples:\n    | b |\n    | 1 |');
    expect(run('Scenario: S\n  Given <a‸>', renameExamplesParameter('b'))).toBe('Scenario: S\n  Given <a>');
  });
  it('X131 Remove Unused Examples Columns', () => {
    const doc = 'Scenario Outline: S‸\n  Given <user> signs in\n  Examples:\n    | user | old | note |\n    | ada  | x   | y    |';
    expect(run(doc, removeUnusedColumns)).toBe('Scenario Outline: S\n  Given <user> signs in\n  Examples:\n    | user |\n    | ada  |');
    expect(run('Scenario Outline: S‸\n  Given <a>\n  Examples:\n    | a |\n    | 1 |', removeUnusedColumns)).toBe('Scenario Outline: S\n  Given <a>\n  Examples:\n    | a |\n    | 1 |');
  });
  it('X132 Inline Background', () => {
    const doc = 'Feature: F\n  Background:\n    Given the app is open\n\n  Scenario: A\n    Given x\n    When a\n\n  Scenario: B\n    When b';
    expect(run(doc, inlineBackground)).toBe('Feature: F\n  Scenario: A\n    Given the app is open\n    And x\n    When a\n\n  Scenario: B\n    Given the app is open\n    When b');
    expect(run('Feature: F\n  Scenario: A\n    Given x', inlineBackground)).toBe('Feature: F\n  Scenario: A\n    Given x');
  });
  it('X133 Normalize Step Keywords', () => {
    const doc = 'Feature: F\n  Scenario: A\n    Given a\n    Given b\n    When c\n    When d\n    And e\n    Then f\n  Scenario: B\n    And x\n    Then y\n    Then z';
    expect(run(doc, normalizeStepKeywords)).toBe('Feature: F\n  Scenario: A\n    Given a\n    And b\n    When c\n    And d\n    And e\n    Then f\n  Scenario: B\n    Given x\n    Then y\n    And z');
    expect(run('Scenario: S\n  Given a\n  When b', normalizeStepKeywords)).toBe('Scenario: S\n  Given a\n  When b');
  });
  it('X148 Add Scenario: after the scenario at the caret, caret on the title', () => {
    expect(run('Feature: F\n  Scenario: A‸\n    Given a\n\n  Scenario: B\n    Given b', addScenario, true)).toBe('Feature: F\n  Scenario: A\n    Given a\n\n  Scenario: ¦\n    Given \n\n  Scenario: B\n    Given b');
    expect(run('Feature: F‸\n', addScenario, true)).toBe('Feature: F\n\n  Scenario: ¦\n    Given ');
  });
  it('X149 Copy Scenario as Markdown', () => {
    const state = EditorState.create({ doc: 'Feature: F\n  @smoke @login\n  Scenario Outline: Sign in\n    Given the users:\n      | name | role |\n      | ada  | <r>  |\n    When "<r>" signs in\n    Examples:\n      | r     |\n      | admin |' });
    expect(scenarioMarkdown(state, 3)).toBe('### Scenario Outline: Sign in\n\n_@smoke @login_\n\n- **Given** the users:\n\n| name | role |\n| --- | --- |\n| ada | <r> |\n\n- **When** "<r>" signs in\n\n#### Examples\n\n| r |\n| --- |\n| admin |');
    expect(scenarioMarkdown(EditorState.create({ doc: 'Feature: F' }), 1)).toBeUndefined();
  });
  it('X169 Table Duplicate Row', () => {
    expect(run('| a | b |\n| 1 | 2‸ |', tableDuplicateRow, true)).toBe('| a | b |\n| 1 | 2 |\n| 1 | ¦2 |');
  });
  it('X170 Table Delete Row', () => {
    expect(run('| a |\n| 1‸ |\n| 2 |', tableDeleteRow, true)).toBe('| a |\n| ¦2 |');
    expect(run('| a‸ |', tableDeleteRow)).toBe('| a |');
  });
  it('X171 Table Move Column', () => {
    expect(run('| a | b‸ | c |\n| 1 | 2 | 3 |', tableMoveColumn(-1), true)).toBe('| ¦b | a | c |\n| 2 | 1 | 3 |');
    expect(run('| a‸ | b |', tableMoveColumn(-1))).toBe('| a | b |');
  });
  it('X172 Table Select Column', () => {
    let state = EditorState.create({ doc: '| name | age |\n| ada  | 36  |\n| bob  |     |', selection: { anchor: 10 }, extensions: EditorState.allowMultipleSelections.of(true) });
    const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
    tableSelectColumn(view as unknown as EditorView);
    expect(state.selection.ranges.map((r) => state.sliceDoc(r.from, r.to))).toEqual(['age', '36', '']);
  });
  it('X184 Table Transpose', () => {
    expect(run('| name | ada‸ | bob |\n| age  | 36  | 4   |', tableTranspose)).toBe('| name | age |\n| ada  | 36  |\n| bob  | 4   |');
  });
  it('X185 Table Fill Down', () => {
    expect(run('| role  |\n| admin |\n| ‸     |', tableFillDown)).toBe('| role  |\n| admin |\n| admin |');
    expect(run('| r |\n| x |\n| «a |\n| b» |', tableFillDown)).toBe('| r |\n| x |\n| x |\n| x |');
  });
  it('X186 Table Clear Column', () => {
    expect(run('| a | b‸ |\n| 1 | 2 |\n| 3 | 4 |', tableClearColumn)).toBe('| a | b |\n| 1 |   |\n| 3 |   |');
  });
  it('X195 Sort Scenarios by Name', () => {
    const doc = 'Feature: F\n  Background:\n    Given x\n\n  Scenario: Zebra\n    Given z\n\n  @t\n  Scenario: apple 10\n    Given a\n  Scenario: apple 2\n    Given b\n';
    expect(run(doc, sortScenarios)).toBe('Feature: F\n  Background:\n    Given x\n\n  Scenario: apple 2\n    Given b\n\n  @t\n  Scenario: apple 10\n    Given a\n\n  Scenario: Zebra\n    Given z\n');
    expect(run('Feature: F\n  Scenario: A\n  Scenario: B', sortScenarios)).toBe('Feature: F\n  Scenario: A\n  Scenario: B');
  });
  it('X198 Copy Feature Outline', () => {
    expect(featureOutline('@auth\nFeature: Login\n  @smoke\n  Scenario: Sign in\n    Given x\n  Scenario Outline: Roles\n    Given <r>\n')).toBe('## Login _@auth_\n\n- [ ] Sign in _@smoke_\n- [ ] Roles (outline)');
  });
  it('Y31 Table: Delete Empty Rows', () => {
    expect(run('| a | b |\n|   |   |\n| 1 | 2‸ |\n|   |   |', tableDeleteEmptyRows)).toBe('| a | b |\n| 1 | 2 |');
  });
  it('Y32 Table: Remove Duplicate Rows', () => {
    expect(run('| a |\n| x‸ |\n| y |\n| x |', tableRemoveDuplicateRows)).toBe('| a |\n| x |\n| y |');
  });
  it('Y33 Table: Copy as Markdown', () => {
    const state = EditorState.create({ doc: '  | name | role |\n  | ad | admin |', selection: { anchor: 4 } });
    expect(tableMarkdown(state)).toBe('| name | role  |\n| ---- | ----- |\n| ad   | admin |');
  });
  it('Y34 Tag All Scenarios', () => {
    expect(run('Feature: F\n  @a\n  Scenario: one\n  Scenario: two\n  @smoke\n  Scenario: three‸', tagAllScenarios('smoke'))).toBe('Feature: F\n  @a @smoke\n  Scenario: one\n  @smoke\n  Scenario: two\n  @smoke\n  Scenario: three');
  });
  it('Y35 Remove Tag Everywhere', () => {
    expect(removeTagEverywhere('@wip @a\nFeature: F\n  @wip\n  Scenario: s\n    Given @wip text', 'wip')).toBe('@a\nFeature: F\n  Scenario: s\n    Given @wip text');
    expect(removeTagEverywhere('Feature: F', '@x')).toBe(null);
  });
  it('Y36 Sort Tags', () => {
    expect(run('@smoke @Auth @a10 @a9 @smoke\nFeature: F\n  @z @b # note\n  Scenario: s', sortTags)).toBe('@a9 @a10 @Auth @smoke\nFeature: F\n  @z @b # note\n  Scenario: s');
  });
  it('Y37 Promote Common Tags to Feature', () => {
    expect(promoteCommonTags('Feature: F\n  @auth @smoke\n  Scenario: a\n  @auth\n  Scenario: b')).toBe('@auth\nFeature: F\n  @smoke\n  Scenario: a\n  Scenario: b');
    expect(promoteCommonTags('@x\nFeature: F\n  @auth\n  Scenario: a')).toBe('@x @auth\nFeature: F\n  Scenario: a');
    expect(promoteCommonTags('Feature: F\n  @a\n  Scenario: a\n  Scenario: b')).toBe(null);
  });
  it('Y38 Insert Doc String', () => {
    const q = '"'.repeat(3);
    expect(run('  Given a ‸body', insertDocString, true)).toBe(`  Given a body\n    ${q}\n    ¦\n    ${q}`);
  });
  it('Y39 Expand Outline to Scenarios', () => {
    const src = 'Feature: F\n  @auth\n  Scenario Outline: Sign in as <role>‸\n    Given the user signs in as "<role>"\n    Then the <page> page opens\n\n    @fast\n    Examples:\n      | role  | page  |\n      | admin | admin |\n      | guest | home  |\n';
    expect(run(src, expandOutline)).toBe('Feature: F\n  @auth @fast\n  Scenario: Sign in as admin\n    Given the user signs in as "admin"\n    Then the admin page opens\n\n  @auth @fast\n  Scenario: Sign in as guest\n    Given the user signs in as "guest"\n    Then the home page opens\n');
  });
  it('Y40 Wrap in Rule', () => {
    expect(run('Feature: F\n\n  Scenario: a‸\n    Given x\n\n  Scenario: b\n    Given y', wrapInRule('Users sign in'))).toBe('Feature: F\n\n  Rule: Users sign in\n\n    Scenario: a\n      Given x\n\n  Scenario: b\n    Given y');
  });
  it('Y41 Language header', () => {
    expect(setLanguageHeader('Feature: F', 'en')).toBe('# language: en\nFeature: F');
    expect(setLanguageHeader('# language: en\nFeature: F', 'fr')).toBe('# language: fr\nFeature: F');
    expect(setLanguageHeader('# language: en\nFeature: F', 'en')).toBe(null);
    expect(setLanguageHeader('Feature: F', 'not a code')).toBe(null);
  });
  it('Y42 Scenario name at the caret', () => {
    expect(scenarioName(EditorState.create({ doc: 'Feature: F\n  Scenario: Sign in works\n    Given x', selection: { anchor: 40 } }))).toBe('Sign in works');
    expect(scenarioName(EditorState.create({ doc: 'Feature: F', selection: { anchor: 2 } }))).toBe(null);
  });
  it('Y43 Table: Insert Row Above', () => {
    expect(run('| a |\n| x |\n| y‸ |', tableInsertRowAbove)).toBe('| a |\n| x |\n|   |\n| y |');
    expect(run('| a‸ |\n| x |', tableInsertRowAbove)).toBe('| a |\n|   |\n| x |');
  });
  it('Y45 Add Scenario Outline', () => {
    expect(run('Feature: F\n  Scenario: a‸\n    Given x', addScenarioOutline, true)).toBe('Feature: F\n  Scenario: a\n    Given x\n\n  Scenario Outline: ¦\n    Given <value>\n\n    Examples:\n      | value |\n      |       |');
  });
  it('Y46 Table: Column Statistics', () => {
    const state = EditorState.create({ doc: '| item | price |\n| a | 2 |\n| b | 4.5 |\n| c | n/a |', selection: { anchor: 10 } });
    expect(tableColumnStats(state)).toEqual({ column: 'price', count: 2, sum: 6.5, average: 3.25, min: 2, max: 4.5 });
  });
  it('Y47 Table: Copy Column', () => {
    expect(tableColumnValues(EditorState.create({ doc: '| a | b |\n| 1 | 2 |\n| 3 | 4 |', selection: { anchor: 6 } }))).toBe('2\n4');
  });
  it('Y48 Table: Fill Series', () => {
    expect(run('| n | x |\n| 5‸ | a |\n|   | b |\n| 9 | c |', tableFillSeries)).toBe('| n | x |\n| 5 | a |\n| 6 | b |\n| 7 | c |');
  });
  it('Y49 Merge Examples Tables', () => {
    const src = 'Feature: F\n  Scenario Outline: o‸\n    Given <a>\n\n    Examples: one\n      | a |\n      | 1 |\n\n    @slow\n    Examples: two\n      | a  |\n      | 22 |';
    expect(run(src, mergeExamples)).toBe('Feature: F\n  Scenario Outline: o\n    Given <a>\n\n    Examples: one\n      | a  |\n      | 1  |\n      | 22 |');
  });
  it('Y69 Copy Scenario Steps', () => {
    expect(scenarioSteps(EditorState.create({ doc: 'Feature: F\n  Scenario: S\n    Given a\n      | x |\n    Then b\n', selection: { anchor: 25 } }))).toBe('Given a\n  | x |\nThen b');
  });
  it('Y72 Rename Scenario', () => {
    expect(run('Feature: F\n  Scenario Outline: Old name\n    Given ‸x', renameScenario(' New name '))).toBe('Feature: F\n  Scenario Outline: New name\n    Given x');
  });
  it('Y73 Split Scenario Here', () => {
    expect(run('Feature: F\n  Scenario: Long\n    Given a\n    When b\n    Then ‸c\n    And d', splitScenario)).toBe('Feature: F\n  Scenario: Long\n    Given a\n    When b\n\n  Scenario: Long (part 2)\n    Then c\n    And d');
    expect(run('Feature: F\n  Scenario: S\n    Given ‸a', splitScenario)).toBe('Feature: F\n  Scenario: S\n    Given a');
  });
  it('Y86 Insert Data Table', () => {
    expect(run('  Given the users‸', insertDataTable)).toBe('  Given the users\n    | column |\n    |        |');
  });
  it('Y87 Test filter of the tag at the caret', () => {
    const state = EditorState.create({ doc: '  @smoke @auth\n  Scenario: s', selection: { anchor: 11 } });
    expect(tagAt(state)).toBe('@auth');
    expect(tagFilter('@auth')).toBe('dotnet test --filter "Category=auth"');
  });
});
