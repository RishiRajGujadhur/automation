import { describe, expect, it } from 'vitest';
import { outlineProblems } from '../src/editor/gherkin';

describe('Scenario Outline checks (Reqnroll)', () => {
  it('flags placeholders missing from Examples, unused columns, and outlines without Examples', () => {
    const src = [
      'Feature: Discounts',
      '  Scenario Outline: Gold customers',
      '    Given a customer of type <type>',
      '    When they buy <qty> items',
      '      | item   | price   |',
      '      | <item> | <price> |',
      '    Then the receipt says',
      '      """',
      '      Total: <total>',
      '      """',
      '    Examples:',
      '      | type | qty | item | price | total | unused |',
      '      | gold | 2   | Pen  | 1.5   | 3     | x      |',
      '  Scenario Outline: Forgotten',
      '    Given a customer of type <type>',
      '  Scenario Outline: Typo',
      '    Given a customer of type <typ>',
      '    Examples:',
      '      | type |',
      '      | gold |',
    ].join('\n');
    const p = outlineProblems(src);
    expect(p.map((x) => [x.line, x.severity, x.message.split(':')[0].split(' (')[0]])).toEqual([
      [12, 'warning', 'Examples column "unused" is not used by any step of "Gold customers".'],
      [14, 'warning', 'Scenario Outline "Forgotten" has no Examples'],
      [17, 'error', '<typ> is not a column of the Examples'],
      [19, 'warning', 'Examples column "type" is not used by any step of "Typo".'],
    ]);
    expect(p[2].column).toBe(src.split('\n')[16].indexOf('<typ>') + 1);
  });
  it('plain scenarios and complete outlines have no problems', () => {
    expect(outlineProblems('Feature: A\n  Scenario: B\n    Given x <y>\n')).toEqual([]);
    expect(outlineProblems('Feature: A\n  Scenario Outline: B\n    Given <n>\n    Examples:\n      | n |\n      | 1 |\n')).toEqual([]);
  });
});
