import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { extendSpan } from '../src/editor/riderKeys';

/** Repeated Extend Selection from a caret, as text. */
function ladder(doc: string, caret: string, steps: number) {
  const state = EditorState.create({ doc });
  let from = doc.indexOf(caret), to = from;
  const out: string[] = [];
  for (let i = 0; i < steps; i++) {
    const n = extendSpan(state, from, to);
    if (!n) break;
    ({ from, to } = n);
    out.push(doc.slice(from, to));
  }
  return out;
}

describe('Extend Selection (J1)', () => {
  it('grows word → string → arguments → call → line → body → method in C#', () => {
    const doc = 'class A\n{\n    void M()\n    {\n        Log("hello world", 2);\n        Other();\n    }\n}\n';
    const steps = ladder(doc, 'world', 9);
    expect(steps.slice(0, 5)).toEqual(['world', 'hello world', '"hello world"', '"hello world", 2', '("hello world", 2)']);
    expect(steps).toContain('Log("hello world", 2);');
    expect(steps).toContain('Log("hello world", 2);\n        Other();');
    expect(steps.at(-1)).toContain('void M()');
  });
  it('grows a Gherkin step to its scenario, then the feature', () => {
    const doc = 'Feature: F\n  Scenario: S\n    Given a\n    When b\n  Scenario: T\n    Then c\n';
    const steps = ladder(doc, 'When', 5);
    expect(steps[0]).toBe('When');
    expect(steps).toContain('When b');
    expect(steps).toContain('Given a\n    When b');
    expect(steps).toContain('Scenario: S\n    Given a\n    When b');
  });
});
