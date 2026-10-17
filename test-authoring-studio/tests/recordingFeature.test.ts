import { describe, expect, it } from 'vitest';
import { featureWithScenario, scenarioSteps, scenarioText } from '../server/recordingFeature';
import type { Action } from '../src/types';

const actions: Action[] = [
  { id: '1', action: 'goto', url: 'https://shop.test/signin' },
  { id: '2', action: 'fill', target: { role: 'textbox', name: 'Email', testId: 'email' }, value: 'ann@example.com' },
  { id: '3', action: 'fill', target: { role: 'textbox', name: 'Password' }, value: '[REDACTED]', sensitive: true },
  { id: '4', action: 'click', target: { role: 'button', name: 'Sign in' } },
  { id: '5', action: 'goto', url: 'https://shop.test/home' },
];

describe('recording → scenario', () => {
  it('drafts steps for unmatched actions, keeps accepted ones, and skips navigations caused by clicks', () => {
    const steps = scenarioSteps(actions, { '4': 'When the user signs in' });
    expect(steps.map((s) => `${s.keyword} ${s.text}`)).toEqual([
      'Given the user opens "https://shop.test/signin"',
      'When the user enters "ann@example.com" into the "Email" field',
      'When the user enters "<secret>" into the "Password" field',
      'When the user signs in',
    ]);
    expect(steps.map((s) => s.drafted)).toEqual([true, true, true, false]);
  });
  it('writes Given / When / And in sequence', () => {
    expect(scenarioText('Sign in', scenarioSteps(actions, {}))).toBe(
      '  Scenario: Sign in\n    Given the user opens "https://shop.test/signin"\n    When the user enters "ann@example.com" into the "Email" field\n    And the user enters "<secret>" into the "Password" field\n    And the user clicks "SignIn"\n',
    );
  });
  it('creates a feature file or appends to one, keeping its line endings', () => {
    const scenario = '  Scenario: S\n    Given x\n';
    expect(featureWithScenario('', 'Shop', scenario)).toBe('Feature: Shop\n\n  Scenario: S\n    Given x\n');
    expect(featureWithScenario('Feature: Old\r\n\r\n  Scenario: A\r\n    Given a\r\n\r\n', 'ignored', scenario)).toBe('Feature: Old\r\n\r\n  Scenario: A\r\n    Given a\r\n\r\n  Scenario: S\r\n    Given x\r\n');
  });
});
