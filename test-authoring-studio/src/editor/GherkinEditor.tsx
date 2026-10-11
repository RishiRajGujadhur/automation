import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '../radix2';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useEditorTheme } from '../themes';
import { lintGutter, forEachDiagnostic, nextDiagnostic, openLintPanel } from '@codemirror/lint';
import { startCompletion } from '@codemirror/autocomplete';
import { toggleComment, selectAll } from '@codemirror/commands';
import { Play, Save, Check, Wand2, Copy, Scissors, ClipboardPaste, MessageSquareCode, TextSelect, CircleAlert, ListChecks, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { gherkinExtensions, formatGherkin } from './gherkin';
import { RowMenu } from '../ui';
import { labelled } from './a11y';
import { breakpoints } from './breakpoints';
import { runGutter, setRunMarks, type RunMark } from './runGutter';
import { changeGutter } from './changeGutter';
import { useChangeBars } from './useChangeBars';
import { cursorTracker } from './cursor';

export type Problems = { errors: number; warnings: number };

/**
 * Feature editor: Gherkin syntax + binding linting, step autocomplete, hover previews and a Radix
 * right-click menu with Run tests / Preview changes. The menu replaces the browser menu inside the
 * editor, so clipboard actions are included.
 */
export default function GherkinEditor({ file, onSave, runMarks, onRunLine, value, onChange, onPreview, onRun, onValidate, height = '470px', onNotice, onDefinition }: { file?: string; runMarks?: RunMark[]; onRunLine?: (line: number, debug: boolean) => void; onSave?: () => void; onDefinition?: (step: { keyword: string; text: string; line: number }) => void; value: string; onChange: (v: string) => void; onPreview: () => void; onRun: () => void; onValidate: () => void; height?: string; onNotice?: (m: string) => void }) {
  const editorTheme = useEditorTheme();
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [problems, setProblems] = useState<Problems>({ errors: 0, warnings: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  // The editor becomes a full-window overlay; the *document* enters browser fullscreen when allowed.
  // (Fullscreening the editor element itself would hide Radix menus/tooltips, which portal to <body>.)
  const toggleFull = async () => {
    if (!full) {
      setFull(true);
      try { await document.documentElement.requestFullscreen?.(); } catch { /* overlay only */ }
    } else {
      setFull(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    }
  };
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement && full) setFull(false); };
    document.addEventListener('fullscreenchange', sync);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && full && !document.fullscreenElement) setFull(false); };
    // Shift+Alt+Enter (Visual Studio's full screen); Ctrl+Shift+F is Find in Files.
    const key = (e: KeyboardEvent) => { if (e.shiftKey && e.altKey && e.key === 'Enter') { e.preventDefault(); void toggleFull(); } };
    window.addEventListener('keydown', esc);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('fullscreenchange', sync); window.removeEventListener('keydown', esc); window.removeEventListener('keydown', key); };
  });
  const eolRef = useRef<'CRLF' | 'LF'>('LF');
  eolRef.current = value.includes('\r\n') ? 'CRLF' : 'LF';
  const handlers = useRef<{ onRunLine?: (line: number, debug: boolean) => void; onPreview: () => void; onSave?: () => void; onValidate: () => void; onDefinition?: (s: { keyword: string; text: string; line: number }) => void }>({ onRunLine, onPreview, onSave, onValidate, onDefinition });
  handlers.current = { onRunLine, onPreview, onSave, onValidate, onDefinition };
  const extensions = useMemo(() => [...gherkinExtensions({ onSave: () => (handlers.current.onSave ?? handlers.current.onPreview)(), onValidate: () => handlers.current.onValidate(), onDefinition: (s) => handlers.current.onDefinition?.(s) }), lintGutter(), labelled('Gherkin source'), cursorTracker(file ?? 'untitled.feature', () => eolRef.current), ...(file ? [breakpoints(file), runGutter((l, d) => handlers.current.onRunLine?.(l, d)), changeGutter()] : [])], [file]);
  useChangeBars(ref, file, true);
  // Run / debug glyphs beside scenarios (outcome of the last run).
  useEffect(() => { let tries = 0; const apply = () => { const v = ref.current?.view; if (v) v.dispatch({ effects: setRunMarks.of(runMarks ?? []) }); else if (tries++ < 30) requestAnimationFrame(apply); }; apply(); }, [runMarks, file]);
  const view = () => ref.current?.view;
  const withView = (fn: (v: NonNullable<ReturnType<typeof view>>) => void) => () => { const v = view(); if (v) { fn(v); v.focus(); } };
  const selection = () => { const v = view(); if (!v) return ''; const r = v.state.selection.main; return v.state.sliceDoc(r.from, r.to); };
  return (
    <div className={`gherkin-editor ${full ? 'is-fullscreen' : ''}`} ref={wrap} role={full ? 'dialog' : undefined} aria-label={full ? 'Feature editor (full screen)' : undefined}>
      <div className="editor-toolbar">
        <IconButton label={full ? 'Exit full screen' : 'Full screen editor'} shortcut="Shift Alt Enter" side="left" onClick={() => void toggleFull()} aria-pressed={full}>
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </IconButton>
      </div>
      <RowMenu
        label="Editor actions"
        items={[
          { label: 'Run tests…', icon: Play, onSelect: onRun },
          { label: 'Save', icon: Save, shortcut: 'Ctrl S', onSelect: onSave ?? onPreview },
          { label: 'Review changes (diff)…', icon: Save, onSelect: onPreview },
          { label: 'Validate bindings', icon: Check, shortcut: 'Ctrl ↵', onSelect: onValidate },
          'separator',
          { label: 'Suggest steps', icon: Sparkles, shortcut: 'Ctrl Space', onSelect: withView((v) => startCompletion(v)) },
          { label: 'Format document', icon: Wand2, shortcut: 'Shift Alt F', onSelect: withView((v) => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: formatGherkin(v.state.doc.toString()) } })) },
          { label: 'Toggle comment', icon: MessageSquareCode, shortcut: 'Ctrl /', onSelect: withView((v) => toggleComment(v)) },
          { label: 'Go to next problem', icon: CircleAlert, shortcut: 'F8', disabled: !problems.errors && !problems.warnings, onSelect: withView((v) => nextDiagnostic(v)) },
          { label: 'Show all problems', icon: ListChecks, shortcut: 'Ctrl Shift M', disabled: !problems.errors && !problems.warnings, onSelect: withView((v) => openLintPanel(v)) },
          'separator',
          { label: 'Cut', icon: Scissors, shortcut: 'Ctrl X', disabled: !selection(), onSelect: withView((v) => { navigator.clipboard?.writeText(selection()).then(() => v.dispatch(v.state.replaceSelection(''))).catch(() => onNotice?.('Clipboard unavailable.')); }) },
          { label: 'Copy', icon: Copy, shortcut: 'Ctrl C', disabled: !selection(), onSelect: () => { navigator.clipboard?.writeText(selection()).catch(() => onNotice?.('Clipboard unavailable.')); } },
          { label: 'Paste', icon: ClipboardPaste, shortcut: 'Ctrl V', onSelect: withView((v) => { navigator.clipboard?.readText().then((t) => v.dispatch(v.state.replaceSelection(t))).catch(() => onNotice?.('Paste with Ctrl+V; the browser blocked clipboard access.')); }) },
          { label: 'Select all', icon: TextSelect, shortcut: 'Ctrl A', onSelect: withView((v) => selectAll(v)) },
          'separator',
          { label: full ? 'Exit full screen' : 'Full screen', icon: full ? Minimize2 : Maximize2, shortcut: 'Shift Alt Enter', onSelect: () => void toggleFull() },
        ]}
      >
        <div data-menu-row className="gherkin-editor-surface">
          <CodeMirror
            ref={ref}
            value={value}
            height={full ? 'calc(100dvh - 60px)' : height}
            theme={editorTheme}
            extensions={extensions}
            onChange={onChange}
            basicSetup={{ autocompletion: false, lintKeymap: true }}
            onUpdate={(u) => {
              if (!u.docChanged && !u.transactions.some((t) => t.effects.length)) return;
              let errors = 0, warnings = 0;
              forEachDiagnostic(u.state, (d) => { if (d.severity === 'error') errors++; else if (d.severity === 'warning') warnings++; });
              setProblems((p) => (p.errors === errors && p.warnings === warnings ? p : { errors, warnings }));
            }}
          />
        </div>
      </RowMenu>
      <div className="editor-problems" aria-live="polite">
        <button className={`problem-chip ${problems.errors ? 'error' : ''}`} onClick={withView((v) => (problems.errors || problems.warnings) && nextDiagnostic(v))} title="Go to next problem (F8)">
          <CircleAlert size={13} /> {problems.errors} error{problems.errors === 1 ? '' : 's'} · {problems.warnings} warning{problems.warnings === 1 ? '' : 's'}
        </button>
        <span className="subtle">Ctrl+Space suggests existing steps · Tab moves between parameters · right-click for actions</span>
      </div>
    </div>
  );
}
