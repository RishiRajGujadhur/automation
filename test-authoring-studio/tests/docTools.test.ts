import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { sortJsonKeys, jsonPointerAt } from '../src/editor/docTools';

const apply = (doc: string, cmd: (v: EditorView) => boolean) => {
  let state = EditorState.create({ doc });
  const view = { get state() { return state; }, dispatch: (spec: TransactionSpec) => { state = state.update(spec).state; } };
  return { ok: cmd(view as unknown as EditorView), doc: state.doc.toString() };
};

describe('document tools (X162…)', () => {
  it('X162 Sort JSON Keys', () => {
    expect(apply('{"b":1,"a":{"z":[{"y":1,"x":2}],"c":null}}\n', sortJsonKeys).doc).toBe('{\n  "a": {\n    "c": null,\n    "z": [\n      {\n        "x": 2,\n        "y": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
    expect(apply('{ nope', sortJsonKeys).ok).toBe(false);
  });
  it('X163 JSON Pointer at a position', () => {
    const text = '{\n  "users": [\n    { "name": "ada", "a/b": 1 },\n    { "name": "bob" }\n  ]\n}';
    expect(jsonPointerAt(text, text.indexOf('bob'))).toBe('/users/1/name');
    expect(jsonPointerAt(text, text.indexOf('"a/b"') + 1)).toBe('/users/0/a~1b');
    expect(jsonPointerAt(text, text.indexOf('"users"') + 2)).toBe('/users');
    expect(jsonPointerAt(text, 0)).toBe('');
  });
});
