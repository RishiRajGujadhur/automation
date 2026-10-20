import { describe, expect, it } from 'vitest';
import { duplicateScenarioNames, duplicateExamplesRows } from '../src/editor/gherkinLint2';

describe('Gherkin warnings (IDE-FEATURES-4)', () => {
  it('Y44 Duplicate scenario names', () => {
    expect(duplicateScenarioNames('Feature: F\n  Scenario: Sign in\n  Scenario: Other\n  Scenario Outline: sign IN')).toEqual([{ line: 4, message: 'Another scenario is also named "sign IN" (line 2).' }]);
  });
  it('Y50 Duplicate Examples rows', () => {
    expect(duplicateExamplesRows('  Examples:\n    | a |\n    | 1 |\n    |  1 |\n    | 2 |')).toEqual([{ line: 4, message: 'This Examples row repeats line 3: the same test runs twice.' }]);
  });
});
