import { describe, expect, it } from 'vitest';
import { actionToStep } from '../src/GeneratorRecorder';
import type { Binding, Match } from '../src/types';

const binding = { keyword: 'When', pattern: 'the user searches for {string}' } as Binding;
describe('recorded action → Gherkin line', () => {
  it('reuses an existing step when the match is confident', () => {
    const m: Match = { action: { id: '1', action: 'fill', target: { role: 'combobox', name: 'Search' }, value: 'x' }, candidates: [{ binding, score: 0.8, reasons: [], text: 'the user searches for "x"' }] };
    expect(actionToStep(m, false)).toBe('When the user searches for "x"');
  });
  it('proposes wording for unmatched actions (flagged later as needing a binding)', () => {
    const none = (a: Match['action']): Match => ({ action: a, candidates: [] });
    expect(actionToStep(none({ id: '1', action: 'goto', url: 'https://shop.test/' }), true)).toBe('Given the user opens "https://shop.test/"');
    expect(actionToStep(none({ id: '2', action: 'click', target: { role: 'button', name: 'Place order' } }), false)).toBe('When the user clicks the "Place order" button');
    expect(actionToStep(none({ id: '3', action: 'fill', target: { name: 'Email' }, value: 'a@b.co' }), false)).toBe('When the user enters "a@b.co" in the "Email" field');
    expect(actionToStep(none({ id: '4', action: 'fill', target: { name: 'Password' }, value: 'x', sensitive: true }), false)).toBe('When the user enters "<secret>" in the "Password" field');
  });
});
