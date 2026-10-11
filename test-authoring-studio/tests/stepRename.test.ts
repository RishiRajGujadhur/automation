import { describe, it, expect } from 'vitest';
import { values, render, parameterCount, replaceAttributePattern, isCucumber } from '../server/stepRename';

describe('Rename Step', () => {
  it('carries regex capture values into the new wording', () => {
    const old = 'the user searches for "(.*)"';
    expect(values(old, 'the user searches for "Dayforce.com"')).toEqual(['Dayforce.com']);
    expect(render('the customer looks up "(.*)" on the site', ['Dayforce.com'])).toBe('the customer looks up "Dayforce.com" on the site');
    expect(values('^I have (\\d+) items? in (\\w+)$', 'I have 3 items in cart')).toEqual(['3', 'cart']);
    expect(render('^the (\\w+) holds (\\d+) items\\.$', ['cart', '3'])).toBe('the cart holds 3 items.');
    expect(values(old, 'something else')).toBeNull();
  });
  it('handles Cucumber expressions, keeping quotes of {string}', () => {
    expect(isCucumber('the first number is {int}')).toBe(true);
    expect(values('the first number is {int}', 'the first number is 50')).toEqual(['50']);
    expect(values('the user searches for {string}', 'the user searches for "x y"')).toEqual(['"x y"']);
    expect(render('the user looks up {string}', ['"x y"'])).toBe('the user looks up "x y"');
  });
  it('counts parameters (top-level groups only) and rewrites the attribute string', () => {
    expect(parameterCount('a (b(c)) (d)')).toBe(2);
    expect(parameterCount('no params')).toBe(0);
    expect(replaceAttributePattern('  [When(@"the user searches for ""(.*)""")]', 'the user searches for "(.*)"', 'the user looks up "(.*)"')).toBe('  [When(@"the user looks up ""(.*)""")]');
    expect(replaceAttributePattern('[Given("the first number is {int}")]', 'the first number is {int}', 'number one is {int}')).toBe('[Given("number one is {int}")]');
    expect(replaceAttributePattern('[Given("x")]', 'y', 'z')).toBeNull();
  });
});

describe('isCucumber is stable across calls', () => {
  it('gives the same answer every time', () => {
    expect([1, 2, 3].map(() => isCucumber('the first number is {int}'))).toEqual([true, true, true]);
  });
});
