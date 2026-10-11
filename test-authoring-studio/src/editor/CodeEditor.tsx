import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { forEachDiagnostic, linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { Save, FileCode2, TriangleAlert, RotateCcw, CircleCheck, CloudOff, Loader } from 'lucide-react';
import { api, type FilePreview } from '../api';
import { Button } from '../radix';
import DiffApproval from '../DiffApproval';
import { useEditorTheme } from '../themes';
import { labelled } from './a11y';
import { readDraft, useAutoSave } from './autosave';
import { xmlExtensions } from './xml';
import type { Index } from '../types';

type CsDiagnostic = { line: number; column: number; endLine: number; endColumn: number; severity: 'error' | 'warning'; id: string; message: string };

/** Roslyn diagnostics (syntax + step-binding checks) from the scanner, as CodeMirror lint. */
const csharpLinter = (file: string) => linter(async (view) => {
  const doc = view.state.doc;
  try {
    const items = await api<CsDiagnostic[]>('/csharp/diagnostics', { source: doc.toString(), path: file });
    return items.map((d): Diagnostic => {
      const from = doc.line(Math.min(doc.lines, d.line)).from + d.column - 1;
      const toLine = doc.line(Math.min(doc.lines, d.endLine));
      const to = Math.max(from + 1, Math.min(toLine.to, toLine.from + d.endColumn - 1));
      // Errors at the very end of a file (e.g. a missing brace) still get a visible one-character range.
      const start = Math.max(0, Math.min(from, doc.length - 1));
      return { from: start, to: Math.max(start + 1, Math.min(to, doc.length)), severity: d.severity, source: d.id.startsWith('TAS') ? 'Bindings' : 'Roslyn', message: `${d.id}: ${d.message}` };
    });
  } catch {
    return [];
  }
}, { delay: 600 });

/**
 * Editor for repository source files (C# step definitions and page objects, dictionary XML): syntax colouring,
 * Roslyn diagnostics for C#, auto save / hot exit, and Ctrl+S to preview the diff and approve the write.
 */
export default function CodeEditor({ file, line, onNotice, onIndex }: { file: string; line?: number; onNotice?: (m: string) => void; onIndex?: (i: Index) => void }) {
  const theme = useEditorTheme();
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [loaded, setLoaded] = useState<{ file: string; source: string; hash: string }>();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [restorable, setRestorable] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview>();
  const [problems, setProblems] = useState({ errors: 0, warnings: 0 });
  const isCs = file.endsWith('.cs');

  useEffect(() => {
    let live = true;
    setLoaded(undefined); setPreview(undefined); setError('');
    api<{ source: string; hash: string }>(`/source?file=${encodeURIComponent(file)}`)
      .then((r) => {
        if (!live) return;
        setLoaded({ file, ...r });
        const draft = readDraft(file);
        setRestorable(draft !== null && draft !== r.source ? draft : null);
        setValue(r.source);
      })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [file]);
  const auto = useAutoSave({ file, value, loaded });

  // Jump to the requested line once the document is in place.
  useEffect(() => {
    const view = ref.current?.view;
    if (!view || !loaded || !line) return;
    const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
    view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    view.focus();
  }, [loaded, line]);

  const previewSave = async () => {
    try { setPreview(await api<FilePreview>('/file/preview', { file, source: value })); } catch (e) { onNotice?.((e as Error).message); }
  };
  // Ctrl+S reads the latest buffer through a ref so the keymap (and the linter) never need rebuilding.
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => { if (useDiffOnSave()) previewSave(); else auto.save().then((ok) => onNotice?.(ok ? `${file} saved.` : 'Not saved: see the editor status.')); };
  const extensions = useMemo(() => [
    ...(isCs ? [StreamLanguage.define(csharp), csharpLinter(file)] : xmlExtensions(false)),
    lintGutter(),
    labelled(`Source of ${file}`, false),
    keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { saveRef.current(); return true; } }]),
    // Stable per file: rebuilding extensions on every keystroke would reset the linter before it reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [file, isCs]);

  return (
    <section className="code-editor panel" aria-label={`Editing ${file}`}>
      <div className="editor-toolbar">
        <span className="editor-file"><FileCode2 size={14} aria-hidden="true" />{file}</span>
        <span className={`save-state ${auto.state}`} role="status">
          {auto.state === 'saved' && <><CircleCheck size={12} />Saved</>}
          {auto.state === 'dirty' && <>● Unsaved</>}
          {auto.state === 'saving' && <><Loader size={12} className="spin" />Saving…</>}
          {(auto.state === 'conflict' || auto.state === 'error') && <><CloudOff size={12} />{auto.error}</>}
        </span>
        <span className="toolbar-spacer" />
        {problems.errors + problems.warnings > 0 && <span className="meta">{problems.errors} errors · {problems.warnings} warnings</span>}
        <Button size="small" variant="ghost" disabled={!auto.dirty} onClick={() => loaded && setValue(loaded.source)}><RotateCcw size={13} />Revert</Button>
        <Button size="small" variant="primary" disabled={!auto.dirty} onClick={previewSave} title="Preview the diff, then approve (Ctrl+S)"><Save size={13} />Save…</Button>
      </div>
      {restorable !== null && (
        <div className="info-box restore-box" role="status">
          <TriangleAlert size={14} /> Unsaved changes from an earlier session were kept.
          <Button size="tiny" onClick={() => { setValue(restorable); setRestorable(null); }}>Restore</Button>
          <Button size="tiny" variant="ghost" onClick={() => setRestorable(null)}>Discard</Button>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      {loaded && (
        <div className="code-editor-surface" onBlur={auto.onBlur}>
          <CodeMirror
            ref={ref}
            value={value}
            theme={theme}
            height="var(--code-editor-height)"
            extensions={extensions}
            // Word completion is not C# IntelliSense: it hijacks Enter (e.g. "test" → DateTimeOffset), so it stays off.
            basicSetup={{ autocompletion: false }}
            onChange={setValue}
            onUpdate={(u) => {
              if (!u.docChanged && !u.transactions.some((t) => t.effects.length)) return;
              let errors = 0, warnings = 0;
              forEachDiagnostic(u.state, (d) => { if (d.severity === 'error') errors++; else if (d.severity === 'warning') warnings++; });
              setProblems((p) => (p.errors === errors && p.warnings === warnings ? p : { errors, warnings }));
            }}
          />
        </div>
      )}
      {preview && (
        <div className="code-editor-preview">
          <DiffApproval preview={preview} height="200px" onApplied={(i) => { auto.markSaved(value); setPreview(undefined); onIndex?.(i); onNotice?.(`${file} written.`); }} />
          <Button size="small" variant="ghost" onClick={() => setPreview(undefined)}>Close preview</Button>
        </div>
      )}
    </section>
  );
}
/** Ctrl+S previews a diff unless auto save is on (then it saves directly, like VS Code). */
function useDiffOnSave() {
  try { return (JSON.parse(localStorage.getItem('tas:prefs') ?? '{}').autoSave ?? 'afterDelay') === 'off'; } catch { return true; }
}
