import { describe, expect, it } from 'vitest';
import { bindingClassEnd, insertMethod, methodName, newStepFile, stepPattern } from '../server/stepScaffold';

describe('step scaffolding', () => {
  it('turns quoted values and numbers into placeholders', () => {
    expect(stepPattern('they enter "john@x.com" in the email field', 'regex').pattern).toBe('^they enter "(.*)" in the email field$');
    expect(stepPattern('I add 3 items costing 9.99', 'cucumber')).toEqual({ pattern: 'I add {int} items costing {float}', params: [{ name: 'number1', type: 'int' }, { name: 'number2', type: 'decimal' }] });
    expect(stepPattern('a (b) / c', 'cucumber').pattern).toBe(String.raw`a \(b\) \/ c`);
    expect(methodName('the user clicks the "Place order" button')).toBe('TheUserClicksThePlaceOrderButton');
  });
  it('appends to the binding class, matching indentation, avoiding name clashes', () => {
    const src = 'using TechTalk.SpecFlow;\nnamespace Demo;\n[Binding]\npublic class AuthSteps {\n [Given("x")] public void TheUserLogsOut() { }\n}\n';
    expect(src[bindingClassEnd(src)]).toBe('}');
    const r = insertMethod(src, 'When', 'the user logs out', 'regex');
    expect(r.method.name).toBe('TheUserLogsOut2');
    expect(r.source).toContain(' [When("^the user logs out$")]');
    expect(r.source.split('\n')[r.line - 1]).toContain('[When(');
    expect(r.source.trimEnd().endsWith('}')).toBe(true);
  });
  it('ignores braces inside strings and comments', () => {
    const src = '[Binding]\npublic class S {\n  // }\n  [Given(@"a ""}"" b")] public void A() { var s = "}"; }\n}\n';
    expect(bindingClassEnd(src)).toBe(src.lastIndexOf('}'));
  });
  it('creates a new file in the style of an existing one', () => {
    const r = newStepFile('CheckoutSteps', 'Then', 'the order is confirmed', 'regex', 'using TechTalk.SpecFlow;\nusing Microsoft.Playwright;\nnamespace Demo;\n');
    expect(r.source).toContain('namespace Demo;');
    expect(r.source).toContain('using Microsoft.Playwright;');
    expect(r.source).toContain('[Then("^the order is confirmed$")]');
    expect(r.source.split('\n')[r.line - 1]).toContain('[Then(');
  });
});

describe('Define Steps (Reqnroll)', () => {
  it('outline placeholders become named parameters; tables and doc strings a trailing argument', async () => {
    const { stepPattern, bindingMethod } = await import('../server/stepScaffold');
    expect(stepPattern('the user has <item count> items in "<cart>"', 'cucumber')).toEqual({ pattern: 'the user has {} items in {string}', params: [{ name: 'itemCount', type: 'string' }, { name: 'cart', type: 'string' }] });
    expect(stepPattern("I search for 'books'", 'regex').pattern).toBe("^I search for '(.*)'$");
    expect(bindingMethod('Given', 'these users', 'cucumber', '', [], 'table', true).code).toContain('public void TheseUsers(DataTable table)');
    expect(bindingMethod('Given', 'these users', 'cucumber', '', [], 'table', false).code).toContain('(Table table)');
    expect(bindingMethod('When', 'the body is', 'regex', '', [], 'docString').code).toContain('(string docString)');
  });
  it('defines several steps once each, in a new class or appended to an existing one', async () => {
    const { defineSteps } = await import('../server/stepScaffold');
    const steps = [
      { keyword: 'Given', text: 'a cart with 2 items' },
      { keyword: 'Given', text: 'a cart with 5 items' }, // same pattern: defined once
      { keyword: 'When', text: 'the user checks out' },
    ];
    const created = defineSteps(steps, 'cucumber', { className: 'CartSteps', reqnroll: true, sample: 'using Reqnroll;\nnamespace Shop.Steps;\n' });
    expect(created.count).toBe(2);
    expect(created.source).toMatch(/^using Reqnroll;\n\nnamespace Shop\.Steps;\n\n\[Binding\]\npublic class CartSteps\n\{\n    \[Given\("a cart with \{int\} items"\)\]/);
    expect(created.source).toContain('[When("the user checks out")]');
    const appended = defineSteps([{ keyword: 'Then', text: 'the order is placed' }], 'regex', { className: 'X', reqnroll: false, existing: created.source });
    expect(appended.source).toContain('[Given("a cart with {int} items")]');
    expect(appended.source).toContain('[Then("^the order is placed$")]');
    expect(appended.source.trimEnd().endsWith('}')).toBe(true);
  });
});
