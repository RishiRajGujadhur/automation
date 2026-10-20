import { describe, expect, it } from 'vitest';
import { duplicateScenarioNames } from '../src/editor/gherkinLint2';

describe('Gherkin warnings (IDE-FEATURES-4)', () => {
  it('Y44 Duplicate scenario names', () => {
    expect(duplicateScenarioNames('Feature: F\n  Scenario: Sign in\n  Scenario: Other\n  Scenario Outline: sign IN')).toEqual([{ line: 4, message: 'Another scenario is also named "sign IN" (line 2).' }]);
  });
});
