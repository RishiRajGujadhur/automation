import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { sortJsonKeys, jsonPointerAt, xpathAt, wordCount } from '../src/editor/docTools';

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
  it('X164 XPath at a position', () => {
    const xml = '<?xml version="1.0"?>\n<!-- c <x> -->\n<Dictionary>\n  <Page name="Login">\n    <Field id="user" />\n    <Field id="pass">#p</Field>\n  </Page>\n  <Page>\n    <Item/>\n    <Item>here</Item>\n  </Page>\n</Dictionary>';
    expect(xpathAt(xml, xml.indexOf('#p'))).toBe("/Dictionary/Page[@name='Login']/Field[@id='pass']");
    expect(xpathAt(xml, xml.indexOf('"user"'))).toBe("/Dictionary/Page[@name='Login']/Field[@id='user']");
    expect(xpathAt(xml, xml.indexOf('here'))).toBe('/Dictionary/Page[2]/Item[2]');
    expect(xpathAt(xml, 0)).toBeUndefined();
  });
  it('X165 word count', () => {
    expect(wordCount('# Title here\n\nIt\'s *two* [links](x) and `code`.\n\n```\nignored words\n```')).toBe(8);
  });
});
