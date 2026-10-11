import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { forEachDiagnostic, linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { Save, TriangleAlert, RotateCcw, CircleCheck, CloudOff, Loader, GitCompareArrows } from 'lucide-react';
import { api, type FilePreview } from '../api';
import { Button } from '../radix';
import { IconButton } from '../radix2';
import DiffApproval from '../DiffApproval';
import { useEditorTheme } from '../themes';
import { labelled } from './a11y';
import { readDraft, useAutoSave, editedThisSession } from './autosave';
import { xmlExtensions } from './xml';
import { breakpoints } from './breakpoints';
import { gherkinSyntaxExtensions } from './gherkin';
import { readFile, isBrowser } from '../files/provider';
import { EditorActions } from '../files/EditorTabs';
import { SAVE_ALL_EVENT } from './events';
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

function languageOf(file: string, browser: boolean) {
  if (file.endsWith('.cs')) return [...(browser ? [] : [breakpoints(file)]), StreamLanguage.define(csharp), csharpLinter(file)];
  if (/\.(xml|csproj|props|targets|config|runsettings|resx)$/.test(file)) return xmlExtensions(false);
  if (file.endsWith('.feature')) return [...(browser ? [] : [breakpoints(file)]), ...gherkinSyntaxExtensions()];
  return [];
}

/**
 * Editor for one open file tab (C# step definitions and page objects, dictionary XML, and any file of a browser
 * folder): syntax colouring, Roslyn diagnostics for C#, auto save / hot exit, Ctrl+S or the save icon to write it.
 * Inactive tabs stay mounted (hidden) so their undo history and scroll position survive tab switches.
 */
export default function CodeEditor({ file, reveal, active = true, onNotice, onIndex }: { file: string; reveal?: { line: number }; active?: boolean; onNotice?: (m: string) => void; onIndex?: (i: Index) => void }) {
  const theme = useEditorTheme();
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [loaded, setLoaded] = useState<{ file: string; source: string; hash: string }>();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [restorable, setRestorable] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview>();
  const [problems, setProblems] = useState({ errors: 0, warnings: 0 });
  const browser = isBrowser();

  useEffect(() => {
    let live = true;
    setLoaded(undefined); setPreview(undefined); setError('');
    readFile(file)
      .then((r) => {
        if (!live) return;
        setLoaded({ file, ...r });
        const draft = readDraft(file);
        const changed = draft !== null && draft !== r.source;
        // Edited earlier in this session (e.g. before switching tabs): bring the buffer straight back.
        if (changed && editedThisSession(file)) { setValue(draft); setRestorable(null); } else { setRestorable(changed ? draft : null); setValue(r.source); }
      })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [file]);
  const auto = useAutoSave({ file, value, loaded });

  // Jump to the requested line once the document is in place.
  useEffect(() => {
    const view = ref.current?.view;
    if (!view || !loaded || !reveal) return;
    const l = view.state.doc.line(Math.max(1, Math.min(reveal.line, view.state.doc.lines)));
    view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    view.focus();
  }, [loaded, reveal]);
  useEffect(() => { if (active) requestAnimationFrame(() => ref.current?.view?.requestMeasure()); }, [active]);

  const save = () => auto.save().then((ok) => onNotice?.(ok ? `${file} saved.` : 'Not saved: see the editor status.'));
  const compare = async () => {
    try { setPreview(await api<FilePreview>('/file/preview', { file, source: value })); } catch (e) { onNotice?.((e as Error).message); }
  };
  // Ctrl+S saves straight to disk (the latest buffer is read through a ref, so the keymap never rebuilds).
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => { const h = () => { if (auto.dirty) void auto.save(); }; window.addEventListener(SAVE_ALL_EVENT, h); return () => window.removeEventListener(SAVE_ALL_EVENT, h); });
  const extensions = useMemo(() => [
    ...languageOf(file, browser),
    lintGutter(),
    labelled(`Source of ${file}`, false),
    keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { void saveRef.current(); return true; } }]),
    // Stable per file: rebuilding extensions on every keystroke would reset the linter before it reports.
  ], [file, browser]);

  return (
    <section className="code-editor" aria-label={`Editing ${file}`} hidden={!active}>
      <EditorActions active={active}>
        <span className={`save-state ${auto.state}`} role="status">
          {auto.state === 'saved' && <><CircleCheck size={12} />Saved</>}
          {auto.state === 'dirty' && <>● Unsaved</>}
          {auto.state === 'saving' && <><Loader size={12} className="spin" />Saving…</>}
          {(auto.state === 'conflict' || auto.state === 'error') && <><CloudOff size={12} />{auto.error}</>}
        </span>
        {problems.errors + problems.warnings > 0 && <span className="meta">{problems.errors} errors · {problems.warnings} warnings</span>}
        {!browser && <IconButton label="Compare with saved" disabled={!auto.dirty} onClick={compare}><GitCompareArrows size={14} /></IconButton>}
        <IconButton label="Revert file" disabled={!auto.dirty} onClick={() => loaded && setValue(loaded.source)}><RotateCcw size={14} /></IconButton>
        <IconButton label="Save" shortcut="Ctrl S" disabled={!auto.dirty} onClick={save}><Save size={14} /></IconButton>
      </EditorActions>
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
            height="100%"
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
          <Button size="small" variant="ghost" onClick={() => setPreview(undefined)}>Close comparison</Button>
        </div>
      )}
    </section>
  );
}
