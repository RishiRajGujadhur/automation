/**
 * Search Everywhere calculator (Rider evaluates arithmetic typed in Search Everywhere): + - * / % ^, parentheses,
 * decimals and unary minus. Returns null for anything else (no eval).
 */
export function calculate(input: string): number | null {
  const s = input.replace(/\s+/g, '').replace(/,/g, '.');
  if (!/^[\d.+\-*/%^()]+$/.test(s) || !/\d/.test(s) || !/[+\-*/%^]/.test(s.replace(/^-/, ''))) return null;
  let i = 0;
  const peek = () => s[i];
  function num(): number {
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error(')'); i++; return v; }
    if (peek() === '-') { i++; return -num(); }
    if (peek() === '+') { i++; return num(); }
    const m = /^\d*\.?\d+|^\d+\./.exec(s.slice(i));
    if (!m) throw new Error('number');
    i += m[0].length;
    return Number(m[0]);
  }
  function power(): number { const b = num(); if (peek() === '^') { i++; return b ** power(); } return b; }
  function term(): number { let v = power(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = s[i++]; const r = power(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; }
  function expr(): number { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  try { const v = expr(); return i === s.length && Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : null; } catch { return null; }
}
