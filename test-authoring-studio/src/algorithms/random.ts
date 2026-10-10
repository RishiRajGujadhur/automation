/** Mulberry32: tiny, fast, seedable 32-bit PRNG so every "random" algorithm is reproducible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** String → 32-bit seed (FNV-1a). */
export function seedFrom(s: string | number) {
  if (typeof s === 'number') return s >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
export const pick = <T>(xs: T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length)];
export function shuffle<T>(xs: T[], rnd: () => number) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
