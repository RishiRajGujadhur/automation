import { describe, expect, it } from 'vitest';
import { command, scanner } from '../server/core';

type B = { id: string; keyword: string; pattern: string; expression?: string; scopes?: { tag?: string; feature?: string; scenario?: string }[] };
const match = async (bindings: B[], steps: { keyword: string; text: string; tags?: string[]; feature?: string; scenario?: string }[]) =>
  (JSON.parse(await command(...scanner(['--match']), JSON.stringify({ bindings, steps: steps.map((s) => ({ tags: [], feature: 'F', scenario: 'S', ...s })) }))) as { results: { candidates: string[]; status: string }[] }).results;

// Behaviour from https://docs.reqnroll.net/latest/automation/cucumber-expressions.html and scoped-bindings.html.
describe('Reqnroll step matching', () => {
  it('Cucumber expressions: parameter types, optional text, alternatives, escapes', async () => {
    const b: B[] = [
      { id: 'cukes', keyword: 'Given', pattern: 'I have {int} cucumber(s) in my belly/tummy' },
      { id: 'quote', keyword: 'When', pattern: 'I search for {string}' },
      { id: 'any', keyword: 'Then', pattern: 'the order is placed on {DateTime} in {CustomColor}' },
      { id: 'esc', keyword: 'Then', pattern: 'the total \\(incl. tax\\) is {decimal}' },
      { id: 'word', keyword: 'When', pattern: 'I pick {word}' },
    ];
    const r = await match(b, [
      { keyword: 'Given', text: 'I have 1 cucumber in my tummy' },
      { keyword: 'Given', text: 'I have 42 cucumbers in my belly' },
      { keyword: 'When', text: "I search for 'Reqnroll'" },
      { keyword: 'Then', text: 'the order is placed on 2026-10-17 in Red' },
      { keyword: 'Then', text: 'the total (incl. tax) is 12.50' },
      { keyword: 'When', text: 'I pick green' },
      { keyword: 'Given', text: 'I have 1 cucumber in my stomach' },
    ]);
    expect(r.map((x) => x.candidates[0] ?? null)).toEqual(['cukes', 'cukes', 'quote', 'any', 'esc', 'word', null]);
  });
  it('detects regex vs Cucumber like Reqnroll, and ExpressionType overrides it', async () => {
    const r = await match([
      { id: 'regex', keyword: 'Given', pattern: 'the user (.*) is logged in' },
      { id: 'anchored', keyword: 'Given', pattern: '^a (\\d+) items?$' },
      { id: 'plain', keyword: 'Given', pattern: 'a cart with item(s)' },
      { id: 'forcedRegex', keyword: 'Given', pattern: 'size {2}', expression: 'Regex' },
    ], [
      { keyword: 'Given', text: 'the user ann is logged in' },
      { keyword: 'Given', text: 'a 3 items' },
      { keyword: 'Given', text: 'a cart with items' },
      { keyword: 'Given', text: 'size  ' },
    ]);
    expect(r.map((x) => x.candidates)).toEqual([['regex'], ['anchored'], ['plain'], ['forcedRegex']]);
  });
  it('[StepDefinition] matches Given, When and Then', async () => {
    const r = await match([{ id: 'any', keyword: 'StepDefinition', pattern: 'something happens' }], [
      { keyword: 'Given', text: 'something happens' }, { keyword: 'When', text: 'something happens' }, { keyword: 'Then', text: 'something happens' },
    ]);
    expect(r.every((x) => x.status === 'Matched')).toBe(true);
  });
  it('scoped bindings win over unscoped ones; the most specific scope wins; equal scopes stay ambiguous', async () => {
    const b: B[] = [
      { id: 'global', keyword: 'When', pattern: 'I perform a simple search on {string}' },
      { id: 'web', keyword: 'When', pattern: 'I perform a simple search on {string}', scopes: [{ tag: 'web' }] },
      { id: 'webCheckout', keyword: 'When', pattern: 'I perform a simple search on {string}', scopes: [{ tag: 'web', feature: 'Checkout' }] },
      { id: 'api', keyword: 'When', pattern: 'I perform a simple search on {string}', scopes: [{ tag: 'api' }] },
    ];
    const r = await match(b, [
      { keyword: 'When', text: "I perform a simple search on 'x'" },
      { keyword: 'When', text: "I perform a simple search on 'x'", tags: ['@web'] },
      { keyword: 'When', text: "I perform a simple search on 'x'", tags: ['@web'], feature: 'Checkout' },
      { keyword: 'When', text: "I perform a simple search on 'x'", tags: ['@web', '@api'] },
    ]);
    expect(r.map((x) => x.candidates)).toEqual([['global'], ['web'], ['webCheckout'], ['web', 'api']]);
    expect(r[3].status).toBe('Ambiguous');
  });
});

describe('TypeScript matcher mirrors the scanner', () => {
  it('same Cucumber / regex behaviour as the scanner for the Reqnroll examples', async () => {
    const { bindingMatches } = await import('../server/core');
    const ok = (pattern: string, text: string, expression?: 'Regex' | 'Cucumber') => bindingMatches({ id: 'x', keyword: 'Given', pattern, expression, parameters: [], className: '', method: '', file: '', line: 1, usages: 0, examples: [] } as never, text);
    expect(ok('I have {int} cucumber(s) in my belly/tummy', 'I have 42 cucumbers in my belly')).toBe(true);
    expect(ok('I have {int} cucumber(s) in my belly/tummy', 'I have 1 cucumber in my stomach')).toBe(false);
    expect(ok('the total \\(incl. tax\\) is {decimal}', 'the total (incl. tax) is 12.50')).toBe(true);
    expect(ok('a cart with item(s)', 'a cart with items')).toBe(true);
    expect(ok('the user (.*) is logged in', 'the user ann is logged in')).toBe(true);
    expect(ok('size {2}', 'size  ', 'Regex')).toBe(true);
  });
});
