import type { Action } from '../src/types.js';
import { fieldName } from './dictionaries.js';

/**
 * Recording → SpecFlow scenario. Accepted matches keep their step text; every other action gets a drafted step that
 * names the same field as its dictionary entry (`Email`, `SignIn`…), so the feature, the dictionary and a step
 * created later from the draft all line up. Navigations caused by clicks are not steps; only the first page load is.
 */
export function draftStep(a: Action): { keyword: 'Given' | 'When'; text: string } | undefined {
  const field = fieldName(a.target?.name || a.target?.testId || a.target?.description || 'Field');
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  switch (a.action) {
    case 'goto': return a.url ? { keyword: 'Given', text: `the user opens ${q(a.url)}` } : undefined;
    case 'fill': return { keyword: 'When', text: `the user enters ${q(a.sensitive ? '<secret>' : a.value ?? '')} into the ${q(field)} field` };
    case 'click': return { keyword: 'When', text: `the user clicks ${q(field)}` };
    case 'press': return a.key ? { keyword: 'When', text: `the user presses ${q(a.key)}` } : undefined;
  }
}

export type ScenarioStep = { keyword: string; text: string; drafted: boolean; actionId: string };

/** Steps for the recorded actions in order; `accepted` maps action id → full step line ("When …"). */
export function scenarioSteps(actions: Action[], accepted: Record<string, string>): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  actions.forEach((a, i) => {
    const line = accepted[a.id]?.trim();
    if (line) {
      const m = /^(Given|When|Then|And|But|\*)\s+(.*)$/.exec(line);
      steps.push({ keyword: m?.[1] ?? 'When', text: m?.[2] ?? line, drafted: false, actionId: a.id });
      return;
    }
    if (a.action === 'goto' && i > 0) return; // follows a click or Enter: not a user step
    const d = draftStep(a);
    if (d) steps.push({ ...d, drafted: true, actionId: a.id });
  });
  return steps;
}

/** Gherkin lines with keywords in sequence: Given… then When…, repeated keywords become And. */
export function scenarioText(name: string, steps: ScenarioStep[]) {
  let last = '';
  const lines = steps.map((s) => {
    const kw = s.keyword === 'And' || s.keyword === 'But' || s.keyword === '*' ? (last || 'Given') : s.keyword;
    const shown = kw === last ? 'And' : kw;
    last = kw;
    return `    ${shown} ${s.text}`;
  });
  return `  Scenario: ${name}\n${lines.join('\n')}\n`;
}

/** A new feature file, or the existing one with the scenario appended (its line endings kept). */
export function featureWithScenario(before: string, featureName: string, scenario: string) {
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const body = before.trim() ? `${before.replace(/\s+$/, '')}\n\n${scenario}` : `Feature: ${featureName}\n\n${scenario}`;
  return body.replace(/\r?\n/g, eol);
}
