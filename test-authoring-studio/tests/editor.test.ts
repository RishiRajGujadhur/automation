import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import { stepLines, bindingSnippet, formatGherkin } from '../src/editor/gherkin';
import { dictionaryDiagnostics } from '../src/editor/xml';
import type { Binding } from '../src/types';

const binding = (pattern: string, params: string[] = []) => ({ pattern, parameters: params.map((name) => ({ name, type: 'string' })) }) as unknown as Binding;

describe('gherkin editor helpers', () => {
  it('resolves And/But keywords and skips outline placeholders', () => {
    const lines = stepLines('Feature: x\n  Scenario: a\n    Given one\n    And two\n    When three\n    But four\n  Scenario Outline: b\n    Given <user> logs in\n    Then done\n');
    expect(lines.map((l) => [l.keyword, l.resolved, l.text])).toEqual([
      ['Given', 'Given', 'one'],
      ['And', 'Given', 'two'],
      ['When', 'When', 'three'],
      ['But', 'When', 'four'],
      ['Then', 'Then', 'done'],
    ]);
  });
  it('turns binding patterns into tab-stop snippets named after parameters', () => {
    expect(bindingSnippet(binding('^Login as "(.*)" to "(.*)"$', ['roleName', 'appName']))).toBe('Login as "${roleName}" to "${appName}"');
    expect(bindingSnippet(binding('I have {int} items in {string}', ['count', 'cart']))).toBe('I have ${count} items in "${cart}"');
    expect(bindingSnippet(binding('^the page is open$'))).toBe('the page is open');
  });
  it('formats indentation and aligns tables', () => {
    const out = formatGherkin('Feature: F\nScenario: S\nGiven a\n  When   b\nExamples:\n| a | bbb |\n| long | c |\n');
    expect(out).toContain('  Scenario: S\n    Given a\n    When b');
    expect(out).toContain('      | a    | bbb |\n      | long | c   |');
  });
});

describe('dictionary lint rules', () => {
  const run = (src: string) => dictionaryDiagnostics(src, Text.of(src.split('\n'))).map((d) => d.message);
  it('flags shape and selector problems', () => {
    const msgs = run(`<Page name="P">
  <Section XRefCode="s">
    <Field XRefCode="a" Type="TextBox">
      <Selector Type="css">div:nth-child(2)</Selector>
      <Selector Type="banana">x</Selector>
      <Selector Type="testid"></Selector>
    </Field>
    <Field XRefCode="A" Type="Button">
    </Field>
  </Section>
</Page>`);
    expect(msgs.some((m) => /nth-child/.test(m))).toBe(true);
    expect(msgs.some((m) => /Unsupported selector type "banana"/.test(m))).toBe(true);
    expect(msgs.some((m) => /value is empty/.test(m))).toBe(true);
    expect(msgs.some((m) => /First selector is CSS/.test(m))).toBe(true);
    expect(msgs.some((m) => /Duplicate field/.test(m))).toBe(true);
    expect(msgs.some((m) => /no Selector elements/.test(m))).toBe(true);
  });
  it('accepts a clean dictionary', () => {
    expect(run('<Page name="P">\n  <Section XRefCode="s">\n    <Field XRefCode="a" Type="TextBox">\n      <Selector Type="testid">a</Selector>\n    </Field>\n  </Section>\n</Page>')).toEqual([]);
  });
});
