import { describe, it, expect } from 'vitest';
import { accents, contrast } from '../src/accents';

// Surfaces that carry accent-coloured text in each theme.
const darkSurfaces = ['#0b0e16', '#121722', '#151a28', '#1b2232', '#0f1d33', '#2e3440', '#3b4252'];
const lightSurfaces = ['#ffffff', '#f4f5f9', '#f7f8fb', '#eef0f6'];

describe('accent palette meets WCAG 2.x AA (4.5:1)', () => {
  for (const a of accents) {
    it(`${a.label}`, () => {
      for (const s of darkSurfaces) expect(contrast(a.accent, s), `${a.id} text on ${s}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(a.onStrong, a.strong), `${a.id} button text`).toBeGreaterThanOrEqual(4.5);
      for (const s of lightSurfaces) expect(contrast(a.strong, s), `${a.id} text on light ${s}`).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('contrast() matches known reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });
});
