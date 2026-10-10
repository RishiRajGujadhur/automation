/**
 * Accent palette. Every accent is chosen so that:
 *  - `accent` (text, icons, active states on dark surfaces) is ≥ 4.5:1 against the darkest and
 *    lightest dark-theme surfaces used for text (#0b0e16 … #3b4252),
 *  - `strong` with `onStrong` text (filled buttons) is ≥ 4.5:1,
 *  - `strong` used as text on the Light theme (#ffffff / #f4f5f9) is ≥ 4.5:1.
 * tests/accents.test.ts verifies all three with the WCAG 2.x relative-luminance formula.
 */
export type AccentId = 'violet' | 'indigo' | 'blue' | 'cyan' | 'teal' | 'green' | 'amber' | 'orange' | 'rose' | 'pink' | 'slate';
export type Accent = { id: AccentId; label: string; accent: string; strong: string; onStrong: string };

export const accents: Accent[] = [
  { id: 'violet', label: 'Violet', accent: '#b4a0ff', strong: '#6a46d8', onStrong: '#ffffff' },
  { id: 'indigo', label: 'Indigo', accent: '#a5b4fc', strong: '#4338ca', onStrong: '#ffffff' },
  { id: 'blue', label: 'Blue', accent: '#8ab8ff', strong: '#2160c4', onStrong: '#ffffff' },
  { id: 'cyan', label: 'Cyan', accent: '#67e8f9', strong: '#0e6f86', onStrong: '#ffffff' },
  { id: 'teal', label: 'Teal', accent: '#5fd4c4', strong: '#0b7268', onStrong: '#ffffff' },
  { id: 'green', label: 'Green', accent: '#6ee7a0', strong: '#15763b', onStrong: '#ffffff' },
  { id: 'amber', label: 'Amber', accent: '#f6c86e', strong: '#8a5a00', onStrong: '#ffffff' },
  { id: 'orange', label: 'Orange', accent: '#fdb07a', strong: '#b33c0a', onStrong: '#ffffff' },
  { id: 'rose', label: 'Rose', accent: '#fda4af', strong: '#be123c', onStrong: '#ffffff' },
  { id: 'pink', label: 'Pink', accent: '#f9a8d4', strong: '#b0185a', onStrong: '#ffffff' },
  { id: 'slate', label: 'Slate', accent: '#cbd5e1', strong: '#475569', onStrong: '#ffffff' },
];

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export function luminance(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
export const accentById = (id: string) => accents.find((a) => a.id === id) ?? accents[0];
