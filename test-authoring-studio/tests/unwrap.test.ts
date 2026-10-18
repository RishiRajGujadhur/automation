import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { unwrap, unwrappable } from '../src/editor/unwrap';

function run(doc: string, at: string, pick = 0) {
  let state = EditorState.create({ doc });
  const items = unwrappable(state, doc.indexOf(at));
  const view = { get state() { return state; }, dispatch: (spec: Parameters<EditorState['update']>[0]) => { state = state.update(spec).state; } };
  if (items[pick]) unwrap(view as never, items[pick]);
  return { labels: items.map((i) => i.label), text: state.doc.toString() };
}

describe('Unwrap / Remove (J49)', () => {
  const allman = ['void M()', '{', '    if (ok)', '    {', '        while (go)', '        {', '            Step();', '        }', '    }', '}'].join('\n');
  it('lists the enclosing blocks, innermost first, and stops at the method', () => {
    expect(run(allman, 'Step();').labels).toEqual(["Unwrap 'while'", "Unwrap 'if'"]);
  });
  it('unwraps the chosen block and dedents its body', () => {
    expect(run(allman, 'Step();', 1).text).toBe(['void M()', '{', '    while (go)', '    {', '        Step();', '    }', '}'].join('\n'));
    const kr = ['void M() {', '    using (var s = Open()) {', '        Read(s);', '    }', '}'].join('\n');
    expect(run(kr, 'Read(s)').text).toBe(['void M() {', '    Read(s);', '}'].join('\n'));
  });
});
