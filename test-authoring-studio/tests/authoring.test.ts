import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { configSchema, scan, projectRoot, expressionToRegex, bindingMatches } from '../server/core';
import { mergeDictionary, parseDictionary, proposeField, selectorRank, selectorWarnings } from '../server/dictionaries';
import { validate, msbuildGlob, outputInclusion } from '../server/validation';
import { projectModel, classifyFile } from '../server/projectModel';
import { WorkspaceSearch } from '../server/stepSearch';
import type { Binding } from '../src/types';

const config = configSchema.parse({ repositoryRoot: path.join(projectRoot, 'fixtures') });
const base = `<?xml version="1.0"?>
<Page name="Checkout">
  <!-- keep me -->
  <Section XRefCode="shipping">
    <Field XRefCode="email" Type="TextBox">
      <Selector Type="css">#email</Selector>
      <Selector Type="testid">email</Selector>
    </Field>
  </Section>
</Page>
`;

describe('dictionary merge', () => {
  it('appends new selectors without reordering existing ones', () => {
    const { xml, changes } = mergeDictionary(base, [
      { page: 'Checkout', section: 'Shipping', field: 'Email', fieldType: 'TextBox', selectors: [{ type: 'testid', value: 'email' }, { type: 'ariarole.textbox', value: 'Email' }] },
    ]);
    const [entry] = parseDictionary(xml, 'x.xml');
    expect(entry.selectors.map((s) => s.type)).toEqual(['css', 'testid', 'ariarole.textbox']);
    expect(xml).toContain('<!-- keep me -->');
    expect(changes[0]).toMatch(/appended 1/);
  });
  it('adds fields, sections and creates new files', () => {
    let { xml } = mergeDictionary(base, [
      { page: 'Checkout', section: 'shipping', field: 'Post Code', fieldType: 'TextBox', selectors: [{ type: 'testid', value: 'zip' }] },
      { page: 'Checkout', section: 'Payment', field: 'Card', fieldType: 'TextBox', selectors: [{ type: 'testid', value: 'card' }] },
    ]);
    const entries = parseDictionary(xml, 'x.xml');
    expect(entries.map((e) => `${e.section}/${e.field}`)).toEqual(['shipping/email', 'shipping/postcode', 'payment/card']);
    ({ xml } = mergeDictionary('', [{ page: 'Login', section: 'Form', field: 'User', fieldType: 'TextBox', selectors: [{ type: 'testid', value: 'u' }] }]));
    expect(parseDictionary(xml, 'n.xml')[0]).toMatchObject({ page: 'Login', section: 'form', field: 'user' });
  });
  it('proposes selectors in rule order and never invents CSS', () => {
    const p = proposeField({ id: '1', action: 'fill', value: 'a', target: { role: 'textbox', name: 'Email address', testId: 'email' } }, 'Checkout', 'Shipping')!;
    expect(p.field).toBe('EmailAddress');
    expect(p.selectors.map((s) => s.type)).toEqual(['testid', 'ariarole.textbox']);
    expect(proposeField({ id: '2', action: 'click', target: {} }, 'P', 'S')).toBeUndefined();
    expect(selectorRank('css', '#id')).toBeLessThan(selectorRank('css', 'div > a'));
    expect(selectorWarnings('css', 'ul > li:nth-child(2)')).toHaveLength(1);
  });
});

describe('binding expressions', () => {
  it('matches Cucumber expressions', () => {
    expect(expressionToRegex('the user has {int} item(s)')).not.toContain('{int}');
    const b = { pattern: 'the user enters {string} in the {word} field' } as Binding;
    expect(bindingMatches(b, 'the user enters "a b" in the email field')).toBe(true);
    expect(bindingMatches({ pattern: 'I have {int} item(s)' } as Binding, 'I have 3 items')).toBe(true);
    expect(bindingMatches({ pattern: 'I have {int} item(s)' } as Binding, 'I have 1 item')).toBe(true);
  });
});

describe('validation gate', () => {
  it('checks dictionary, stability, lifecycle and build output on fixtures', async () => {
    const index = await scan(config);
    const checks = await validate({ steps: [{ keyword: 'Given', text: 'the browser is started' }], page: 'CheckoutPage', section: 'Shipping Details', field: 'EmailInput', featureFile: 'Features/Checkout/ShoppingCart.feature' }, index, config);
    const by = Object.fromEntries(checks.map((c) => [c.id, c.status]));
    expect(by).toMatchObject({ dictionary: 'pass', selectors: 'pass', stability: 'pass', lifecycle: 'pass', output: 'pass', conventions: 'pass' });
    const brittle = await validate({ section: 'shippingdetails', field: 'placeorder' }, index, config);
    expect(brittle.find((c) => c.id === 'stability')?.status).toBe('pass');
    const missing = await validate({ section: 'shippingdetails', field: 'nope' }, index, config);
    expect(missing.find((c) => c.id === 'dictionary')?.status).toBe('fail');
    expect((await outputInclusion(config.repositoryRoot, 'Selectors/common.xml', config.ignoredDirectories)).status).toBe('fail');
  });
  it('translates MSBuild globs', () => {
    expect(msbuildGlob('Dictionaries\\**\\*.xml').test('Dictionaries/Checkout/A.xml')).toBe(true);
    expect(msbuildGlob('Dictionaries\\**\\*.xml').test('Dictionaries/A.xml')).toBe(true);
    expect(msbuildGlob('Dictionaries\\*.xml').test('Dictionaries/x/A.xml')).toBe(false);
  });
});

describe('project model and search', () => {
  it('classifies layers and indicators', async () => {
    const index = await scan(config);
    const model = await projectModel(config, index);
    expect(classifyFile('Steps/A.cs')).toBe('Step');
    expect(model.layers['Selector data']).toBeGreaterThan(0);
    expect(model.indicators.find((i) => i.label.startsWith('Playwright'))?.ok).toBe(true);
  });
  it('searches every collection in the worker with exact totals', async () => {
    const index = await scan(config);
    const search = new WorkspaceSearch({ steps: index.stepDefinitions, selectors: index.selectors, dictionaries: index.dictionaryEntries ?? [], backgrounds: [] });
    try {
      const d = await search.query('dictionaries', 'email');
      expect(d.items[0]).toMatchObject({ field: 'emailinput' });
      const s = await search.search('search', 0, 1);
      expect(s.total).toBeGreaterThan(1);
      expect(s.hasNext).toBe(true);
    } finally {
      await search.close();
    }
  });
});
