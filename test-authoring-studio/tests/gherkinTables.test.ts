import { describe, expect, it } from 'vitest';
import { alignTable, splitRow } from '../src/editor/gherkinTables';

describe('Gherkin table editing', () => {
  it('splits cells, keeping escaped pipes', () => {
    expect(splitRow('  | a | b\\|c |  d |')).toEqual(['a', 'b\\|c', 'd']);
    expect(splitRow('| a |')).toEqual(['a']);
  });
  it('aligns columns with the first row indentation, filling short rows', () => {
    expect(alignTable(['      | name | age |', '| Ann | 3 |', '  | Bartholomew |'])).toEqual([
      '      | name        | age |',
      '      | Ann         | 3   |',
      '      | Bartholomew |     |',
    ]);
  });
});
