import { useEffect, useState } from 'react';
import { GitBranch, CircleX, TriangleAlert, ArrowUp, ArrowDown, Loader, Bell } from 'lucide-react';
import { api } from './api';
import { useBuild } from './build/store';
import { useNotices, unreadNotices } from './rider/notifications';
import { usePrefs } from './radix2';
import { SAVE_ALL_EVENT } from './editor/events';
import { unsavedFiles, UNSAVED_EVENT } from './editor/autosave';
import { useCursor } from './editor/cursor';
import { GIT_CHANGED_EVENT } from './editor/events';
import { Dropdown } from './radix';
import { requestEol } from './editor/lineSeparator';
import { setViewOptions, useViewOptions } from './editor/viewOptions';
import { runRider } from './rider/commands';
import { featureOn } from './features';
import { activeEditor } from './editor/activeEditor';
import { gotoLine } from '@codemirror/search';
import { featureStats } from './editor/gherkinTools';
import { wordCount } from './editor/docTools';

/**
 * Right side of the status bar, like Visual Studio's: Git branch (with ↑/↓), errors and warnings of the last build,
 * and for the active editor the cursor position, line endings and encoding.
 */
export default function StatusBarItems({ repository, onGit, onErrors }: { repository?: string; onGit: () => void; onErrors: () => void }) {
  const build = useBuild();
  const notes = useNotices();
  const unread = unreadNotices(notes);
  const { prefs, setPrefs } = usePrefs();
  // Unsaved files: the count, a click saves them all (QOL-50).
  const [unsaved, setUnsaved] = useState(unsavedFiles);
  useEffect(() => { const h = () => setUnsaved(unsavedFiles()); window.addEventListener(UNSAVED_EVENT, h); return () => window.removeEventListener(UNSAVED_EVENT, h); }, []);
  // Elapsed build time (QOL-50).
  const [buildStart, setBuildStart] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { if (build.status !== 'running') return; setBuildStart(Date.now()); const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [build.status]);
  const cursor = useCursor();
  const view = useViewOptions();
  const [git, setGit] = useState<{ repo: boolean; branch?: string; ahead: number; behind: number; changes: number }>();
  useEffect(() => {
    let live = true;
    const load = () => api<{ repo: boolean; branch?: string; ahead: number; behind: number; files: unknown[] }>('/git/status').then((s) => live && setGit({ repo: s.repo, branch: s.branch, ahead: s.ahead, behind: s.behind, changes: s.files.length }), () => {});
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    window.addEventListener(GIT_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    return () => { live = false; clearInterval(t); window.removeEventListener(GIT_CHANGED_EVENT, load); window.removeEventListener('focus', load); };
  }, [repository]);
  const errors = build.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = build.diagnostics.length - errors;
  return (
    <span className="status-items">
      {cursor && (
        <>
          {(() => { const text = <>Ln {cursor.line}, Col {cursor.column}{cursor.selected ? ` (${cursor.selected} selected${featureOn('selected-lines') && (cursor.lines ?? 0) > 1 ? `, ${cursor.lines} lines` : ''})` : ''}{featureOn('selection-count') && (cursor.ranges ?? 1) > 1 ? ` · ${cursor.ranges} selections` : ''}</>; return featureOn('status-goto-line') ? <button className="status-item" aria-label="Cursor position" title={`${cursor.file} — Go to Line (Ctrl+G)`} onClick={() => { const a = activeEditor(); if (a) { a.view.focus(); gotoLine(a.view); } }}>{text}</button> : <span className="status-item" aria-label="Cursor position" title={cursor.file}>{text}</span>; })()}
          <Dropdown
            label="Line separators"
            trigger={<button className="status-item" aria-label={`Line separators: ${cursor.eol}`} title="Line separators (click to change)">{cursor.eol}</button>}
            entries={[
              { label: `${cursor.eol === 'CRLF' ? '✓ ' : '\u2003'}CRLF – Windows (\\r\\n)`, onSelect: () => requestEol(cursor.file, '\r\n') },
              { label: `${cursor.eol === 'LF' ? '✓ ' : '\u2003'}LF – Unix and macOS (\\n)`, onSelect: () => requestEol(cursor.file, '\n') },
            ]}
          />
          {featureOn('status-file-props') ? <button className="status-item" aria-label="Encoding: UTF-8 (File Properties)" title="Encoding — File Properties (Alt+Enter)" onClick={() => runRider('file-props', 'menu')}>UTF-8</button> : <span className="status-item" title="Encoding">UTF-8</span>}
          {featureOn('md-word-count') && /\.(md|markdown|txt)$/i.test(cursor.file) && (() => { const a = activeEditor(); if (!a || a.file !== cursor.file) return null; const s = a.view.state.selection.main; const n = wordCount(s.empty ? a.view.state.doc.toString() : a.view.state.sliceDoc(s.from, s.to)); return <span className="status-item" aria-label="Word count">{n} word{n === 1 ? '' : 's'}{s.empty ? '' : ' selected'}</span>; })()}
          {featureOn('feature-stats') && cursor.file.endsWith('.feature') && (() => { const a = activeEditor(); if (!a || a.file !== cursor.file) return null; const s = featureStats(a.view.state.doc.toString()); return <span className="status-item" aria-label="Feature statistics" title={`${s.scenarios} scenario${s.scenarios === 1 ? '' : 's'}, ${s.examples} example row${s.examples === 1 ? '' : 's'}, ${s.steps} step${s.steps === 1 ? '' : 's'}`}>{s.scenarios} scenario{s.scenarios === 1 ? '' : 's'} · {s.steps} step{s.steps === 1 ? '' : 's'}</span>; })()}
          {featureOn('indentation') && (
            <Dropdown
              label="Indentation"
              trigger={<button className="status-item" aria-label={`Indentation: ${view.indent?.tabs ? 'tabs' : 'spaces'} ${view.indent?.size ?? 2}`} title="Indentation (click to change)">{view.indent?.tabs ? 'Tab Size' : 'Spaces'}: {view.indent?.size ?? 2}</button>}
              entries={[
                { label: `${!view.indent?.tabs ? '✓ ' : '\u2003'}Indent Using Spaces`, onSelect: () => setViewOptions({ indent: { tabs: false, size: view.indent?.size ?? 4 } }) },
                { label: `${view.indent?.tabs ? '✓ ' : '\u2003'}Indent Using Tabs`, onSelect: () => setViewOptions({ indent: { tabs: true, size: view.indent?.size ?? 4 } }) },
                'separator',
                ...[2, 4, 8].map((n) => ({ label: `${(view.indent?.size ?? 2) === n ? '✓ ' : '\u2003'}Size ${n}`, onSelect: () => setViewOptions({ indent: { tabs: !!view.indent?.tabs, size: n } }) })),
                'separator',
                { label: 'Convert Indentation to Spaces', onSelect: () => { runRider('untabify', 'menu'); } },
                { label: 'Convert Indentation to Tabs', onSelect: () => { runRider('tabify', 'menu'); } },
              ]}
            />
          )}
          {featureOn('zoom-indicator') && <button className="status-item" aria-label={`Editor zoom ${view.fontSize ? Math.round((view.fontSize / 13) * 100) : 100}%: reset`} title="Editor zoom (Ctrl+Mouse Wheel); click to reset" onClick={() => setViewOptions({ fontSize: null })}>{view.fontSize ? Math.round((view.fontSize / 13) * 100) : 100}%</button>}
          {view.overtype && <button className="status-item" aria-label="Overtype mode: on" title="Overtype: typing replaces characters (Insert)" onClick={() => setViewOptions({ overtype: false })}>OVR</button>}
        </>
      )}
      {featureOn('build-elapsed') && build.status === 'running' && <span className="status-item" aria-label="Build progress"><Loader size={12} className="spin" /> {build.action === 'clean' ? 'Cleaning' : 'Building'}… {Math.max(0, Math.round((Date.now() - (buildStart || Date.now())) / 1000))} s</span>}
      {featureOn('unsaved-count') && unsaved.length > 0 && <button className="status-item" aria-label={`${unsaved.length} unsaved file${unsaved.length === 1 ? '' : 's'}: Save All`} title={`Unsaved: ${unsaved.join(', ')} — click to save all`} onClick={() => window.dispatchEvent(new Event(SAVE_ALL_EVENT))}>● {unsaved.length} unsaved</button>}
      {featureOn('autosave-status') && <button className="status-item" aria-label={`Auto Save: ${prefs.autoSave === 'off' ? 'off' : prefs.autoSave === 'afterDelay' ? 'after a delay' : 'on focus change'} (click to change)`} title="Auto Save (click to change)" onClick={() => setPrefs({ autoSave: prefs.autoSave === 'off' ? 'afterDelay' : prefs.autoSave === 'afterDelay' ? 'onFocusChange' : 'off' })}>{prefs.autoSave === 'off' ? 'Auto Save off' : prefs.autoSave === 'afterDelay' ? 'Auto Save' : 'Save on blur'}</button>}
      {featureOn('notification-badge') && unread > 0 && <button className="status-item" aria-label={`${unread} new notification${unread === 1 ? '' : 's'}`} title="Notifications" onClick={() => runRider('tool-notifications', 'menu')}><Bell size={12} />{unread}</button>}
      {build.status !== 'idle' && (
        <button className="status-item" aria-label={`${errors} errors, ${warnings} warnings: open the Error List`} title="Error List" onClick={onErrors}>
          <CircleX size={12} />{errors} <TriangleAlert size={12} />{warnings}
        </button>
      )}
      {git?.repo && git.branch && (
        <button className="status-item" aria-label={`Branch ${git.branch}: open Git Changes`} title={`${git.changes} pending change${git.changes === 1 ? '' : 's'} — Git Changes`} onClick={() => { if (!featureOn('branches') || !runRider('branches', 'menu')) onGit(); }}>
          <GitBranch size={12} />{git.branch}{git.changes ? '*' : ''}
          {git.ahead > 0 && <><ArrowUp size={11} />{git.ahead}</>}
          {git.behind > 0 && <><ArrowDown size={11} />{git.behind}</>}
        </button>
      )}
    </span>
  );
}
