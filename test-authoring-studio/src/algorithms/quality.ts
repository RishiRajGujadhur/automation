import { fnv1a } from './strings';
import { isPassive, vagueTerms } from './text';

/* Gherkin quality checks ("scenario smells"). Each check works on a light scenario model. */
export type QStep = { keyword: string; text: string; line: number };
export type QScenario = { name: string; keyword: string; line: number; steps: QStep[]; examplesHeader?: string[]; tags?: string[] };
export type QFeature = { file: string; name: string; scenarios: QScenario[] };
export type Finding = { check: string; file: string; line: number; message: string; severity: 'info' | 'warning' };

const resolved = (steps: QStep[]) => { let last = 'Given'; return steps.map((s) => { const k = ['Given', 'When', 'Then'].includes(s.keyword.trim()) ? s.keyword.trim() : last; last = k; return k; }); };

export const smellChecks: Record<string, (f: QFeature, opts: { maxSteps: number }) => Finding[]> = {
  /* H1 */ 'smell-missing-then': (f) => f.scenarios.filter((s) => s.steps.length && !resolved(s.steps).includes('Then')).map((s) => ({ check: 'smell-missing-then', file: f.file, line: s.line, severity: 'warning', message: `"${s.name}" has no Then step, so it verifies nothing.` })),
  /* H2 */ 'smell-long': (f, o) => f.scenarios.filter((s) => s.steps.length > o.maxSteps).map((s) => ({ check: 'smell-long', file: f.file, line: s.line, severity: 'info', message: `"${s.name}" has ${s.steps.length} steps (more than ${o.maxSteps}). Consider splitting it or moving setup into a Background.` })),
  /* H3 */ 'smell-conjunction': (f) => f.scenarios.flatMap((s) => s.steps.filter((st) => /\b(and|then)\b/i.test(st.text.replace(/"[^"]*"/g, ''))).map((st) => ({ check: 'smell-conjunction', file: f.file, line: st.line, severity: 'info' as const, message: `Conjunction step: "${st.text}" does two things. Split it into separate steps.` }))),
  /* H4 */ 'smell-imperative': (f) => f.scenarios.flatMap((s) => s.steps.filter((st) => /\b(click|clicks|press|presses|type|types|tap|button|textbox|field|xpath|css|selector|scroll)\b/i.test(st.text.replace(/"[^"]*"/g, ''))).map((st) => ({ check: 'smell-imperative', file: f.file, line: st.line, severity: 'info' as const, message: `UI detail in "${st.text}". Declarative steps describe behaviour, not clicks and fields.` }))),
  /* H5 */ 'smell-order': (f) => f.scenarios.flatMap((s) => {
    const k = resolved(s.steps), rank: Record<string, number> = { Given: 0, When: 1, Then: 2 };
    const out: Finding[] = [];
    for (let i = 1; i < k.length; i++) if (rank[k[i]] < rank[k[i - 1]] && !(k[i - 1] === 'Then' && k[i] === 'When')) out.push({ check: 'smell-order', file: f.file, line: s.steps[i].line, severity: 'warning', message: `${k[i]} after ${k[i - 1]} in "${s.name}". Keep Given → When → Then.` });
    return out;
  }),
  /* H6 */ 'smell-outline': (f) => f.scenarios.filter((s) => /Outline|Template/.test(s.keyword)).flatMap((s) => {
    const used = new Set(s.steps.flatMap((st) => [...st.text.matchAll(/<([^>]+)>/g)].map((m) => m[1])));
    const head = new Set(s.examplesHeader ?? []);
    return [
      ...[...used].filter((u) => !head.has(u)).map((u) => ({ check: 'smell-outline', file: f.file, line: s.line, severity: 'warning' as const, message: `<${u}> is used in "${s.name}" but no Examples column has that name.` })),
      ...[...head].filter((h) => !used.has(h)).map((h) => ({ check: 'smell-outline', file: f.file, line: s.line, severity: 'info' as const, message: `Examples column "${h}" in "${s.name}" is never used by a step.` })),
    ];
  }),
  /* N3 */ 'passive-voice': (f) => f.scenarios.flatMap((s) => s.steps.filter((st) => isPassive(st.text)).map((st) => ({ check: 'passive-voice', file: f.file, line: st.line, severity: 'info' as const, message: `Passive voice in "${st.text}". Say who does it: "the user places the order".` }))),
  /* N4 */ 'vague-words': (f) => f.scenarios.flatMap((s) => s.steps.flatMap((st) => { const v = vagueTerms(st.text); return v.length ? [{ check: 'vague-words', file: f.file, line: st.line, severity: 'info' as const, message: `Vague wording (${v.join(', ')}) in "${st.text}": state the observable result.` }] : []; })),
  /* H8 */ 'smell-dup-names': (f) => {
    const seen = new Map<string, number>();
    return f.scenarios.flatMap((s) => { const k = s.name.trim().toLowerCase(); if (seen.has(k)) return [{ check: 'smell-dup-names', file: f.file, line: s.line, severity: 'warning' as const, message: `Scenario name "${s.name}" is also used on line ${seen.get(k)}.` }]; seen.set(k, s.line); return []; });
  },
};

/* ------------------------------------------------------------------ H7 scenario fingerprints */
/** Hash of the normalized step sequence (keywords resolved, quoted values and numbers masked). */
export function fingerprint(s: QScenario) {
  const k = resolved(s.steps);
  return fnv1a(s.steps.map((st, i) => `${k[i]} ${st.text.toLowerCase().replace(/"[^"]*"/g, '"_"').replace(/\b\d+(\.\d+)?\b/g, '#').replace(/\s+/g, ' ').trim()}`).join('\n'));
}
export function duplicateScenarios(features: QFeature[]) {
  const map = new Map<number, { file: string; line: number; name: string }[]>();
  features.forEach((f) => f.scenarios.forEach((s) => { if (!s.steps.length) return; const h = fingerprint(s); (map.get(h) ?? map.set(h, []).get(h)!).push({ file: f.file, line: s.line, name: s.name }); }));
  return [...map.values()].filter((g) => g.length > 1);
}

/* ------------------------------------------------------------------ H9 Flesch reading ease */
export function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}
/** 206.835 − 1.015 × words/sentence − 84.6 × syllables/word. Each step counts as a sentence. */
export function flesch(sentences: string[]) {
  const words = sentences.flatMap((s) => s.replace(/"[^"]*"/g, 'value').match(/[A-Za-z]+/g) ?? []);
  if (!words.length || !sentences.length) return 100;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syl / words.length);
}
export const fleschLabel = (s: number) => (s >= 70 ? 'easy' : s >= 50 ? 'fairly difficult' : s >= 30 ? 'difficult' : 'very difficult');
