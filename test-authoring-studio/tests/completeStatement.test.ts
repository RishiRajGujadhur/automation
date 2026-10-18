import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { completeStatement } from '../src/editor/completeStatement';

function complete(doc: string, at: string, file = 'A.cs') {
  let state = EditorState.create({ doc, selection: { anchor: doc.indexOf(at) + at.length } });
  const view = { get state() { return state; }, dispatch: (spec: Parameters<EditorState['update']>[0]) => { state = state.update(spec).state; } };
  completeStatement(file)(view as never);
  return { text: state.doc.toString(), caret: state.selection.main.head };
}

describe('Complete Current Statement (J48)', () => {
  it('closes parentheses and adds the semicolon', () => {
    const r = complete('class A\n{\n    void M()\n    {\n        Log("x", Math.Max(1, 2\n    }\n}', 'Max(1, 2');
    expect(r.text).toContain('        Log("x", Math.Max(1, 2));\n        \n');
  });
  it('opens a block after an if header, in the file\'s brace style', () => {
    const allman = complete('class A\n{\n    void M()\n    {\n        if (ok\n    }\n}', 'if (ok');
    expect(allman.text).toContain('        if (ok)\n        {\n            \n        }\n');
    const kr = complete('class A {\n    void M() {\n        while (true\n    }\n}', 'while (true');
    expect(kr.text).toContain('        while (true) {\n            \n        }\n');
  });
  it('starts a new step line in a feature file', () => {
    expect(complete('Feature: F\n  Scenario: S\n    Given a', 'Given a', 'F.feature').text).toBe('Feature: F\n  Scenario: S\n    Given a\n    ');
  });
});
