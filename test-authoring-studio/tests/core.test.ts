import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  configSchema,
  scan,
  parseFeature,
  classify,
  redact,
  confined,
  projectRoot,
  matchActions,
  matchFeatureBindings,
} from '../server/core';
describe('read-only repository index', () => {
  it('indexes Gherkin, multiple binding attributes, parameters, locators and call evidence', async () => {
    const index = await scan(
      configSchema.parse({ repositoryRoot: path.join(projectRoot, 'fixtures') }),
    );
    expect(index.features).toHaveLength(2);
    expect(index.stepDefinitions).toHaveLength(8);
    expect(
      index.features.find((f) => f.name === 'Google Search')?.scenarios[1].examples,
    ).toHaveLength(1);
    const search = index.stepDefinitions.find((b) => b.pattern.startsWith('the user searches'))!;
    expect(search.parameters).toEqual([{ name: 'searchText', type: 'string' }]);
    expect(search.usages).toBe(2);
    expect(index.selectors.some((s) => s.member === 'SearchBox')).toBe(true);
    expect(
      index.callEdges.some(
        (e) => e.resolution === 'Resolved' && e.to.includes('SearchPage.Search'),
      ),
    ).toBe(true);
    expect(index.stepDefinitions.every((b) => !path.isAbsolute(b.file))).toBe(true);
    expect(
      matchActions(
        [
          {
            id: '1',
            action: 'fill',
            target: { role: 'combobox', name: 'Search' },
            value: 'Dayforce.com',
          },
        ],
        index,
      )[0].candidates[0].binding.id,
    ).toBe(search.id);
  });
  it('retains all ambiguous bindings, tables and doc strings', () => {
    const base = {
      file: 'Steps.cs',
      line: 1,
      id: '1',
      keyword: 'Given',
      pattern: 'a user',
      className: 'Steps',
      method: 'User',
      parameters: [],
      usages: 0,
      examples: [],
    };
    const f = parseFeature(
      'Feature: Example\n  Background: Base\n    Given a user\n  Scenario: Table\n    Given a user\n      | name |\n      | Sam |\n    Then a message\n      """\n      hello\n      """\n',
      'Example.feature',
      [base, { ...base, id: '2' }],
    );
    expect(f.scenarios[0].steps[0].status).toBe('Ambiguous');
    expect(f.scenarios[0].steps[0].candidates).toHaveLength(2);
    expect(f.scenarios[0].steps[0].argument).toBeTruthy();
    expect(f.scenarios[0].steps[1].argument).toBeTruthy();
  });
  it('inherits And and But keywords', () => {
    expect(
      classify(
        [
          { keyword: 'When', text: 'x', file: 'x', line: 1, status: '', candidates: [] },
          { keyword: 'And', text: 'x', file: 'x', line: 2, status: '', candidates: [] },
        ],
        [{ id: '1', keyword: 'When', pattern: 'x' } as any],
      ).map((s) => s.status),
    ).toEqual(['Matched', 'Matched']);
  });
  it('redacts passwords and credentials in URLs', () => {
    expect(
      redact({ id: '1', action: 'fill', value: 'secret', target: { name: 'password' } }).value,
    ).toBe('[REDACTED]');
    expect(
      redact({
        id: '2',
        action: 'goto',
        url: 'https://user:secret@example.com/?token=secret#secret',
      }).url,
    ).toBe('https://example.com/');
  });
  it('rejects paths outside the selected workspace', async () => {
    await expect(
      confined(path.join(projectRoot, 'fixtures'), '../../package.json'),
    ).rejects.toThrow('outside');
  });
  it('uses native .NET regex options for repository validation and reports malformed regexes', async () => {
    const f = parseFeature(
      'Feature: Native regex\n  Scenario: Options\n    Given HELLO\n',
      'Native.feature',
      [],
    );
    const b = {
      id: 'native',
      keyword: 'Given',
      pattern: '(?i)hello',
      className: 'Steps',
      method: 'Hello',
      parameters: [],
      usages: 0,
      examples: [],
      file: 'Steps.cs',
      line: 1,
    };
    const diagnostics = await matchFeatureBindings([f], [b, { ...b, id: 'invalid', pattern: '[' }]);
    expect(f.scenarios[0].steps[0].candidates).toEqual(['native']);
    expect(diagnostics[0]).toContain('invalid');
  });
});
