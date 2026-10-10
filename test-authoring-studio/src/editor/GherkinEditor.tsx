import { useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { lintGutter, forEachDiagnostic, nextDiagnostic, openLintPanel } from '@codemirror/lint';
import { startCompletion } from '@codemirror/autocomplete';
import { toggleComment, selectAll } from '@codemirror/commands';
import { Play, Save, Check, Wand2, Copy, Scissors, ClipboardPaste, MessageSquareCode, TextSelect, CircleAlert, ListChecks, Sparkles } from 'lucide-react';
import { gherkinExtensions, formatGherkin } from './gherkin';
import { RowMenu } from '../ui';

export type Problems = { errors: number; warnings: number };

/**
 * Feature editor: Gherkin syntax + binding linting, step autocomplete, hover previews and a Radix
 * right-click menu with Run tests / Preview changes. The menu replaces the browser menu inside the
 * editor, so clipboard actions are included.
 */
export default function GherkinEditor({ value, onChange, onPreview, onRun, onValidate, height = '470px', onNotice }: { value: string; onChange: (v: string) => void; onPreview: () => void; onRun: () => void; onValidate: () => void; height?: string; onNotice?: (m: string) => void }) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [problems, setProblems] = useState<Problems>({ errors: 0, warnings: 0 });
  const handlers = useRef({ onPreview, onValidate });
  handlers.current = { onPreview, onValidate };
  const extensions = useMemo(() => [...gherkinExtensions({ onSave: () => handlers.current.onPreview(), onValidate: () => handlers.current.onValidate() }), lintGutter()], []);
  const view = () => ref.current?.view;
  const withView = (fn: (v: NonNullable<ReturnType<typeof view>>) => void) => () => { const v = view(); if (v) { fn(v); v.focus(); } };
  const selection = () => { const v = view(); if (!v) return ''; const r = v.state.selection.main; return v.state.sliceDoc(r.from, r.to); };
  return (
    <div className="gherkin-editor">
      <RowMenu
        label="Editor actions"
        items={[
          { label: 'Run tests…', icon: Play, onSelect: onRun },
          { label: 'Preview changes', icon: Save, shortcut: 'Ctrl S', onSelect: onPreview },
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
        ]}
      >
        <div data-menu-row className="gherkin-editor-surface">
          <CodeMirror
            ref={ref}
            value={value}
            height={height}
            theme={oneDark}
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
