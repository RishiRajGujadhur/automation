import { describe, it, expect } from 'vitest';
import { workspaceSchema, recordSchema, featureFileSchema, runSchema, parametersSchema, dictionaryEntrySchema, generatorSchema, recordingDictionarySchema, validateSync } from '../src/validators';

const ws = { repositoryRoot: 'C:/Source/Tests', targetProject: '.', referenceScope: 'DirectReferences', featurePatterns: ['**/*.feature'], sourcePatterns: ['**/*.cs'], selectorPatterns: ['**/*.xml'], ignoredDirectories: ['bin'] };

describe('form validation', () => {
  it('workspace', () => {
    expect(validateSync(workspaceSchema, ws)).toEqual({});
    expect(validateSync(workspaceSchema, { ...ws, repositoryRoot: 'relative/path' }).repositoryRoot).toMatch(/absolute/);
    expect(validateSync(workspaceSchema, { ...ws, targetProject: 'Tests.txt' }).targetProject).toBeDefined();
    expect(validateSync(workspaceSchema, { ...ws, featurePatterns: [] }).featurePatterns).toMatch(/at least one/);
  });
  it('record URL', () => {
    expect(validateSync(recordSchema, { url: 'https://example.com' })).toEqual({});
    expect(validateSync(recordSchema, { url: 'example.com' }).url).toMatch(/http/);
    expect(validateSync(recordSchema, { url: '' }).url).toMatch(/Enter/);
  });
  it('feature files', () => {
    const schema = featureFileSchema(['Features/Auth/Login.feature']);
    expect(validateSync(schema, { file: 'Features/Checkout/PlaceOrder.feature', name: 'Place order' })).toEqual({});
    expect(validateSync(schema, { file: 'Features/Auth/login.feature', name: 'x' }).file).toMatch(/PascalCase|exists/);
    expect(validateSync(schema, { file: 'Features/Auth/Login.feature', name: 'x' }).file).toMatch(/exists/);
    expect(validateSync(schema, { file: '../Evil.feature', name: 'x' }).file).toMatch(/\.\./);
    expect(validateSync(schema, { file: 'C:/Abs.feature', name: 'x' }).file).toMatch(/relative/);
    expect(validateSync(schema, { file: 'Features/A.txt', name: 'x' }).file).toMatch(/\.feature/);
    expect(validateSync(schema, { file: 'Features\\A.feature', name: 'x' }).file).toMatch(/forward slashes/);
  });
  it('run filters', () => {
    expect(validateSync(runSchema, { project: 'Tests/Tests.csproj', filter: 'FullyQualifiedName~Login' })).toEqual({});
    expect(validateSync(runSchema, { project: 'Tests/Tests.csproj', filter: '' }).filter).toMatch(/whole suite/);
    expect(validateSync(runSchema, { project: 'Tests/Tests.csproj', filter: 'Login' }).filter).toBeDefined();
    expect(validateSync(runSchema, { project: 'Tests/Tests.sln', filter: 'Category=Smoke' }).project).toMatch(/csproj/);
  });
  it('step parameters by type', () => {
    const schema = parametersSchema([{ name: 'count', type: 'int' }, { name: 'name', type: 'string' }, { name: 'rows', type: 'Table' }]);
    expect(validateSync(schema, { count: '3', name: 'Bob', rows: '| a |\n| 1 |' })).toEqual({});
    const e = validateSync(schema, { count: 'three', name: 'say "hi"', rows: 'a,b' });
    expect(e.count).toMatch(/number/);
    expect(e.name).toMatch(/quotes/);
    expect(e.rows).toMatch(/\|/);
  });
  it('dictionary entries', () => {
    expect(validateSync(dictionaryEntrySchema, { dictionaryFile: 'Dictionaries/A.xml', selectors: [{ type: 'testid', value: 'a' }] })).toEqual({});
    expect(validateSync(dictionaryEntrySchema, { dictionaryFile: 'Dictionaries/A.json', selectors: [{ type: 'testid', value: 'a' }] }).dictionaryFile).toMatch(/xml/);
    expect(validateSync(dictionaryEntrySchema, { dictionaryFile: 'D/A.xml', selectors: [{ type: 'testid', value: '' }] })['selectors[0].value']).toMatch(/Enter/);
    expect(validateSync(dictionaryEntrySchema, { dictionaryFile: 'D/A.xml', selectors: [{ type: 'css', value: '#a' }, { type: 'testid', value: 'a' }] }).selectors).toMatch(/first/);
    expect(validateSync(dictionaryEntrySchema, { dictionaryFile: 'D/A.xml', selectors: [{ type: 'testid', value: 'a' }, { type: 'testid', value: 'a' }] }).selectors).toMatch(/same/);
  });
  it('generator draft and recording dictionary', () => {
    const ok = { area: 'Features/Checkout', featureFile: 'Cart.feature', scenarioName: 'x', scenarioText: 'Given a\nAnd b', page: 'P', section: 's', field: 'f', value: 'v', action: 'fill' };
    expect(validateSync(generatorSchema, ok)).toEqual({});
    expect(validateSync(generatorSchema, { ...ok, scenarioText: 'click the button' }).scenarioText).toMatch(/Given/);
    expect(validateSync(generatorSchema, { ...ok, scenarioText: 'And a' }).scenarioText).toMatch(/first/);
    expect(validateSync(generatorSchema, { ...ok, value: '' }).value).toMatch(/test data/);
    expect(validateSync(generatorSchema, { ...ok, value: '', action: 'click' })).toEqual({});
    expect(validateSync(generatorSchema, { ...ok, featureFile: 'Sub/Cart.feature' }).featureFile).toBeDefined();
    expect(validateSync(recordingDictionarySchema, { page: 'Checkout Page', section: 'Main', file: 'D/A.xml', pageObjectFile: 'P/A.cs' }).page).toMatch(/letters/);
  });
});
