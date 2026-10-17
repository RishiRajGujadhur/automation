import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { formatGherkinWith, formatFromEditorConfig, reqnrollDefaults } from '../src/editor/gherkinFormat';
import { editorConfigFor, globToRegex } from '../server/editorconfig';

const messy = [
  '@shop',
  'Feature: Cart',
  'Rule: Totals',
  '# the happy path',
  '      Scenario Outline: Add',
  ' Given a cart with <n> items',
  '        And these prices',
  '| item | price |',
  '| Pen | 1.5 |',
  '| Notebook | 12 |',
  'Then the receipt says',
  '"""',
  '  Total: 13.5',
  '"""',
  'Examples:',
  '| n |',
  '| 2 |',
].join('\n');

describe('Gherkin formatting with Reqnroll .editorconfig settings', () => {
  it('Reqnroll defaults: no indent under Feature / Rule, steps indented, numbers right-aligned', () => {
    expect(formatGherkinWith(messy, reqnrollDefaults)).toBe([
      '@shop',
      'Feature: Cart',
      'Rule: Totals',
      '# the happy path',
      'Scenario Outline: Add',
      '    Given a cart with <n> items',
      '    And these prices',
      '        | item     | price |',
      '        | Pen      |   1.5 |',
      '        | Notebook |    12 |',
      '    Then the receipt says',
      '        """',
      '          Total: 13.5',
      '        """',
      'Examples:',
      '    | n |',
      '    | 2 |',
      '',
    ].join('\n'));
  });
  it('every setting changes the layout', () => {
    const o = formatFromEditorConfig({ indent_style: 'space', indent_size: '2', gherkin_indent_feature_children: 'true', gherkin_indent_rule_children: 'true', gherkin_indent_and_steps: 'true', gherkin_indent_examples: 'true', gherkin_table_cell_padding_size: '0', gherkin_table_cell_right_align_numeric_content: 'false' })!;
    const out = formatGherkinWith(messy, o).split('\n');
    expect(out[2]).toBe('  Rule: Totals');
    expect(out[4]).toBe('    Scenario Outline: Add');
    expect(out[5]).toBe('      Given a cart with <n> items');
    expect(out[6]).toBe('        And these prices');
    expect(out[7]).toBe('          |item    |price|');
    expect(out[8]).toBe('          |Pen     |1.5  |');
    expect(out[14]).toBe('      Examples:');
    expect(out[15]).toBe('        |n|');
  });
  it('no Gherkin settings in .editorconfig → none (the studio keeps its own layout)', () => {
    expect(formatFromEditorConfig({ indent_size: '4' })).toBeUndefined();
    expect(formatFromEditorConfig({ indent_size: '4', __feature_section: 'true' })).toEqual(reqnrollDefaults);
  });
  it('reads .editorconfig files up the folder tree, nearer files and later sections win', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-ec-'));
    try {
      await fs.mkdir(path.join(root, 'Features/Cart'), { recursive: true });
      await fs.writeFile(path.join(root, '.editorconfig'), 'root = true\n[*]\nindent_size = 2\n[*.feature]\ngherkin_indent_feature_children = true\n[*.cs]\nindent_size = 8\n');
      await fs.writeFile(path.join(root, 'Features/.editorconfig'), '[Cart/*.{feature,md}]\ngherkin_table_cell_padding_size = 3\n');
      const props = await editorConfigFor(root, 'Features/Cart/A.feature');
      expect(props).toMatchObject({ indent_size: '2', gherkin_indent_feature_children: 'true', gherkin_table_cell_padding_size: '3' });
      expect(globToRegex('**/*.{feature,cs}').test('a/b/c.cs')).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
