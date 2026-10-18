import { api } from '../api';
import { isBrowser } from '../files/provider';
import type { Outline } from '../editor/NavBar';

/** One entry of a file's structure (File Structure popup, Structure tool window). */
export type OutlineItem = { label: string; kind: string; line: number; column: number; depth: number; start: number; end: number };

const GHERKIN = /^(\s*)(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):\s*(.*)$/;
const DEPTH: Record<string, number> = { Feature: 0, Rule: 1, Background: 1, Scenario: 1, Example: 1, 'Scenario Outline': 1, 'Scenario Template': 1, Examples: 2, Scenarios: 2 };

/** Feature / Rule / Background / Scenario / Examples lines, each spanning to the next entry of the same or a higher level. */
export function gherkinOutline(source: string): OutlineItem[] {
  const lines = source.split(/\r?\n/);
  const out: OutlineItem[] = [];
  let inRule = false;
  lines.forEach((l, i) => {
    const m = GHERKIN.exec(l);
    if (!m) return;
    const kind = m[2];
    if (kind === 'Rule') inRule = true;
    if (kind === 'Feature') inRule = false;
    const depth = DEPTH[kind] + (inRule && kind !== 'Rule' && kind !== 'Feature' ? 1 : 0);
    out.push({ label: m[3] ? `${kind}: ${m[3]}` : kind, kind: kind.toLowerCase().replace(' ', '-'), line: i + 1, column: m[1].length + 1, depth, start: i + 1, end: lines.length });
  });
  // Each entry ends before the next one at its depth or above.
  out.forEach((it, i) => { const next = out.slice(i + 1).find((o) => o.depth <= it.depth); if (next) it.end = next.line - 1; });
  return out;
}

/** Markdown headings. */
export function markdownOutline(source: string): OutlineItem[] {
  const lines = source.split(/\r?\n/);
  const out: OutlineItem[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.*)$/.exec(l);
    if (m) out.push({ label: m[2].trim(), kind: 'heading', line: i + 1, column: 1, depth: m[1].length - 1, start: i + 1, end: lines.length });
  });
  out.forEach((it, i) => { const next = out.slice(i + 1).find((o) => o.depth <= it.depth); if (next) it.end = next.line - 1; });
  return out;
}

/** The structure of a file: C# from Roslyn (types and their members), Gherkin and Markdown parsed here. */
export async function fileOutline(file: string, source: string): Promise<OutlineItem[]> {
  if (file.endsWith('.feature')) return gherkinOutline(source);
  if (/\.(md|markdown)$/i.test(file)) return markdownOutline(source);
  if (file.endsWith('.cs') && !isBrowser()) {
    const o = await api<Outline>('/csharp/outline', { file, source });
    const items: OutlineItem[] = [];
    for (const t of o.types) {
      const depth = t.name.split('.').length - 1;
      items.push({ label: t.name.split('.').pop()!, kind: t.kind, line: t.range.line, column: t.range.column, depth, start: t.range.start, end: t.range.end });
      for (const m of t.members) items.push({ label: m.name, kind: m.kind, line: m.range.line, column: m.range.column, depth: depth + 1, start: m.range.start, end: m.range.end });
    }
    return items.sort((a, b) => a.line - b.line || a.depth - b.depth);
  }
  return [];
}

/** The innermost entry containing a line. */
export const itemAt = (items: OutlineItem[], line: number) => items.reduce<OutlineItem | undefined>((best, it) => (it.start <= line && line <= it.end && (!best || it.depth >= best.depth) ? it : best), undefined);
