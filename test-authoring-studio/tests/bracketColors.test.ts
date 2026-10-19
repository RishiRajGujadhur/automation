import { describe, expect, it } from 'vitest';
import { bracketDepths } from '../src/editor/bracketColors';

const depths = (text: string) => bracketDepths(text).map((b) => `${text[b.pos]}${b.depth}`).join(' ');

describe('bracket pair colorization (X57)', () => {
  it('colours by nesting depth', () => {
    expect(depths('f(a[b{c}])')).toBe('(0 [1 {2 }2 ]1 )0');
  });
  it('skips strings, character literals and comments; unmatched closers stay plain', () => {
    expect(depths('f("(", \'(\', @"a""(", $"{x}") // (\n/* [ */ ) g()')).toBe('(0 )0 (0 )0');
    expect(depths("  # (comment\n  Given the user's (name)")).toBe('(0 )0');
  });
});
