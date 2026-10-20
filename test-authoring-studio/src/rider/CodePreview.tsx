import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { EditorView, Decoration } from '@codemirror/view';
import { useEditorTheme } from '../themes';

const SETUP = { foldGutter: true, autocompletion: false, highlightActiveLine: false };
/** Read-only C# in a window (metadata as source, decompiled code), opened at `line` with that line marked. */
export default function CodePreview({ text, line, label }: { text: string; line: number; label: string }) {
  const theme = useEditorTheme();
  const extensions = useMemo(() => [
    StreamLanguage.define(csharp),
    EditorView.decorations.of((v) => { const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines)); return Decoration.set([Decoration.line({ class: 'cm-preview-target' }).range(l.from)]); }),
    EditorView.baseTheme({ '.cm-preview-target': { background: 'rgba(212, 167, 44, 0.18)' } }),
  ], [line]);
  return (
    <CodeMirror value={text} theme={theme} editable={false} basicSetup={SETUP} extensions={extensions} height="60vh" aria-label={label}
      onCreateEditor={(v) => requestAnimationFrame(() => { const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines)); v.dispatch({ effects: EditorView.scrollIntoView(l.from, { y: 'center' }) }); })} />
  );
}
