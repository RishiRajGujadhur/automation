import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { moveStatement } from '../src/editor/moveStatement';

/** Runs Move Statement with the caret on the first line containing `at`; returns the new text. */
function move(doc: string, at: string, dir: 1 | -1) {
  let state = EditorState.create({ doc, selection: { anchor: doc.indexOf(at) } });
  const view = { get state() { return state; }, dispatch: (spec: Parameters<EditorState['update']>[0]) => { state = state.update(spec).state; } };
  moveStatement(dir)(view as never);
  return state.doc.toString();
}

describe('Move Statement (J38)', () => {
  const cs = ['void M()', '{', '    A();', '    if (x)', '    {', '        B();', '    }', '    C();', '}'].join('\n');
  it('moves a statement past a whole if block (Allman braces)', () => {
    expect(move(cs, 'A();', 1)).toBe(['void M()', '{', '    if (x)', '    {', '        B();', '    }', '    A();', '    C();', '}'].join('\n'));
  });
  it('moves a whole block up, and never out of its parent', () => {
    expect(move(cs, 'if (x)', -1)).toBe(['void M()', '{', '    if (x)', '    {', '        B();', '    }', '    A();', '    C();', '}'].join('\n'));
    expect(move(cs, 'C();', 1)).toBe(cs);
    expect(move(cs, 'B();', -1)).toBe(cs);
  });
  it('moves Gherkin scenarios with their steps, and steps within a scenario', () => {
    const g = ['Feature: F', '  Background:', '    Given a', '  Scenario: S', '    Given b', '    When c'].join('\n');
    expect(move(g, 'Scenario: S', -1)).toBe(['Feature: F', '  Scenario: S', '    Given b', '    When c', '  Background:', '    Given a'].join('\n'));
    expect(move(g, 'Given b', 1)).toBe(['Feature: F', '  Background:', '    Given a', '  Scenario: S', '    When c', '    Given b'].join('\n'));
  });
});
