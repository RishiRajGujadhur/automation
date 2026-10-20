import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import type { ViewUpdate } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { forEachDiagnostic, linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { History, Save, TriangleAlert, RotateCcw, CircleCheck, CloudOff, Loader, GitCompareArrows, Navigation, ListTree, TextCursorInput, ListOrdered, Scissors, Copy, ClipboardPaste, X, Lightbulb, Wrench, AlignLeft, Eye } from 'lucide-react';
import { RowMenu } from '../ui';
import { csharpLanguage, lineCol, offsetOf, replaceText, type CsHandlers, type CsLocation } from './csharp';
import { FILES_CHANGED_EVENT } from './events';
import { markdownQol } from './markdownQol';
import { stepLenses, setLenses, setRefLenses, type StepLens, type RefLens } from './lens';
import { runGutter, setRunMarks, type RunMark } from './runGutter';
import { changeGutter } from './changeGutter';
import { useChangeBars } from './useChangeBars';
import { blameGutter, setBlame, type BlameLine } from './blame';
import { coverageGutter, setCoverage } from './coverage';
import { useTestRun } from '../testing/store';
import { createTwoFilesPatch } from 'diff';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { vsKeys, commentTokenFor } from './vsKeys';
import { braceFolding, braceRange } from './folding';
import { stickyScroll } from './stickyScroll';
import { revealOn, cursorTracker } from './cursor';
import { bookmarks } from './bookmarks';
import { riderKeys } from './riderKeys';
import { trackActive } from './activeEditor';
import { viewOptionsExtension } from './viewOptions';
import { pushClipboard } from '../rider/clipboardRing';
import { eolOf, toLF, withEol, SET_EOL_EVENT, type Eol } from './lineSeparator';
import { xmlDocComments } from './xmlDoc';
import { powerSave } from '../rider/powerSave';
import { featureOn, useFeature } from '../features';
import { httpClient, isHttpFile, parseHttp } from './httpClient';
import { http as httpMode } from '@codemirror/legacy-modes/mode/http';
import HttpResponse, { type HttpResult } from '../rider/HttpResponse';
import MarkdownPreview from '../rider/MarkdownPreview';
import { useLocalState } from '../ui';
import { Columns2, FileText, Code as CodeIcon } from 'lucide-react';
import LocalHistory from '../LocalHistory';
import NavBar from './NavBar';
import RenameStep from './RenameStep';
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

// Constant setups: @uiw/react-codemirror reconfigures the editor whenever this prop changes identity, which would drop
// state added at runtime (snippet fields, appended extensions) on every React render.
const CODE_SETUP = { autocompletion: false };
const PEEK_SETUP = { autocompletion: false, foldGutter: false };
const DIFF_EXTENSIONS = [StreamLanguage.define(diffMode)];
type CsDiagnostic = { line: number; column: number; endLine: number; endColumn: number; severity: 'error' | 'warning'; id: string; message: string };

/** Roslyn diagnostics (syntax + step-binding checks) from the scanner, as CodeMirror lint. */
const csharpLinter = (file: string) => linter(async (view) => {
  const doc = view.state.doc;
  if (powerSave()) return [];
  try {
    // Unnecessary usings fade (Visual Studio's IDE0005) when the language server is running.
    const [items, unused] = await Promise.all([api<CsDiagnostic[]>('/csharp/diagnostics', { source: doc.toString(), path: file }), featureOn('fade-usings') && !isBrowser() ? api<Omit<CsDiagnostic, 'severity' | 'id' | 'message'>[]>('/csharp/unnecessary', { file, source: doc.toString() }).catch(() => []) : Promise.resolve([])]);
    const faded = unused.map((d): Diagnostic => { const from = doc.line(Math.min(doc.lines, d.line)).from + d.column - 1; const to = Math.min(doc.length, doc.line(Math.min(doc.lines, d.endLine)).from + d.endColumn - 1); return { from, to: Math.max(from + 1, to), severity: 'hint', markClass: 'cm-unnecessary', source: 'Roslyn', message: 'IDE0005: Using directive is unnecessary.' }; });
    return items.map((d): Diagnostic => {
      const from = doc.line(Math.min(doc.lines, d.line)).from + d.column - 1;
      const toLine = doc.line(Math.min(doc.lines, d.endLine));
      const to = Math.max(from + 1, Math.min(toLine.to, toLine.from + d.endColumn - 1));
      // Errors at the very end of a file (e.g. a missing brace) still get a visible one-character range.
      const start = Math.max(0, Math.min(from, doc.length - 1));
      return { from: start, to: Math.max(start + 1, Math.min(to, doc.length)), severity: d.severity, source: d.id.startsWith('TAS') ? 'Bindings' : 'Roslyn', message: `${d.id}: ${d.message}` };
    }).concat(faded);
  } catch {
    return [];
  }
}, { delay: 600 });

function languageOf(file: string, browser: boolean) {
  if (file.endsWith('.cs')) return [...(browser ? [] : [breakpoints(file)]), StreamLanguage.define(csharp), csharpLinter(file)];
  if (/\.(xml|csproj|props|targets|config|runsettings|resx)$/.test(file)) return xmlExtensions(false, /\.(csproj|props|targets)$/.test(file));
  if (file.endsWith('.feature')) return [...(browser ? [] : [breakpoints(file)]), ...gherkinSyntaxExtensions()];
  if (isHttpFile(file)) return [StreamLanguage.define(httpMode)];
  if (/\.(md|markdown|txt)$/i.test(file)) return markdownQol;
  return [];
}

/**
 * Editor for one open file tab (C# step definitions and page objects, dictionary XML, and any file of a browser
 * folder): syntax colouring, Roslyn diagnostics for C#, auto save / hot exit, Ctrl+S or the save icon to write it.
 * Inactive tabs stay mounted (hidden) so their undo history and scroll position survive tab switches.
 */
export default function CodeEditor({ file, reveal, active = true, onNotice, onIndex, onOpen, runMarks, onRunLine }: { runMarks?: RunMark[]; onRunLine?: (line: number, debug: boolean) => void; file: string; reveal?: { line: number; column?: number }; onOpen?: (file: string, line: number, column?: number) => void; active?: boolean; onNotice?: (m: string) => void; onIndex?: (i: Index) => void }) {
  const theme = useEditorTheme();
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [loaded, setLoaded] = useState<{ file: string; source: string; hash: string }>();
  const [value, setValue] = useState('');
  // The file's line separator: the editor works in LF, saves and previews use this.
  const [eol, setEol] = useState<Eol>('\n');
  const setText = (raw: string) => { setEol(eolOf(raw)); setValue(toLF(raw)); };
  const diskValue = useMemo(() => withEol(value, eol), [value, eol]);
  const [error, setError] = useState('');
  const [restorable, setRestorable] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview>();
  const [problems, setProblems] = useState({ errors: 0, warnings: 0 });
  const browser = isBrowser();
  const isCs = file.endsWith('.cs');
  // C# language features (Roslyn): rename box over the symbol, Find All References results.
  const [renameAt, setRenameAt] = useState<{ pos: number; name: string; top: number; left: number }>();
  const [refs, setRefs] = useState<{ name: string; locations: (CsLocation & { text?: string })[] }>();
  // Step usages (CodeLens above [Given]/[When]/[Then]): which feature lines use each binding of this file.
  const lenses = useRef<StepLens[]>([]);
  const [renameStep, setRenameStep] = useState<StepLens>();
  /** The step definition at the cursor: the lens on this line or the nearest one above it. */
  const lensAtCursor = () => { const v = ref.current?.view; if (!v) return undefined; const n = v.state.doc.lineAt(v.state.selection.main.head).number; return [...lenses.current].sort((a, b) => b.line - a.line).find((x) => x.line <= n); };
  const showUsages = (l: StepLens) => setRefs({ name: `${l.keyword} ${l.pattern}`, locations: l.usages.map((u) => ({ file: u.file, line: u.line, column: 1, text: `${u.text} — ${u.scenario}` })) });
  const runRef = useRef(onRunLine);
  runRef.current = onRunLine;
  useEffect(() => { let tries = 0; const apply = () => { const v = ref.current?.view; if (v) v.dispatch({ effects: setRunMarks.of(runMarks ?? []) }); else if (tries++ < 30) requestAnimationFrame(apply); }; if (loaded) apply(); }, [runMarks, loaded]);
  const showUsagesRef = useRef(showUsages);
  showUsagesRef.current = showUsages;
  const loadLenses = () => {
    if (!file.endsWith('.cs') || isBrowser()) return;
    api<StepLens[]>(`/steps/lenses?file=${encodeURIComponent(file)}`).then((list) => {
      lenses.current = list;
      let tries = 0;
      const apply = () => { const v = ref.current?.view; if (v) v.dispatch({ effects: setLenses.of(list) }); else if (tries++ < 30) requestAnimationFrame(apply); };
      apply();
    }, () => {});
    if (!powerSave() && featureOn('codelens')) api<RefLens[]>('/csharp/referenceCounts', { file }).then((list) => { refLenses.current = list; applyRefLenses(); }, () => {});
  };
  const refLenses = useRef<RefLens[]>([]);
  const marksRef = useRef(runMarks);
  marksRef.current = runMarks;
  /** Reference lenses with the test outcome of methods that have a run glyph. */
  const applyRefLenses = () => {
    const marks = marksRef.current ?? [];
    const list = refLenses.current.map((l) => { const m = marks.find((x) => x.line >= l.line && x.line <= l.symbolLine); return m ? { ...l, test: m.outcome } : l; });
    let tries = 0;
    const apply = () => { const v = ref.current?.view; if (v) v.dispatch({ effects: setRefLenses.of(list) }); else if (tries++ < 30) requestAnimationFrame(apply); };
    apply();
  };
  useEffect(() => { if (refLenses.current.length) applyRefLenses(); }, [runMarks]); // eslint-disable-line react-hooks/exhaustive-deps
  const openRefLens = (l: RefLens) => { const v = ref.current?.view; if (!v || l.symbolLine > v.state.doc.lines) return; csHandlers.current.references(v.state.doc.line(l.symbolLine).from + l.symbolColumn - 1); };
  const openRefLensRef = useRef(openRefLens);
  openRefLensRef.current = openRefLens;
  const [busyOp, setBusyOp] = useState('');
  // Peek Definition (Alt+F12): the definition's code in a window under the cursor.
  const [peek, setPeek] = useState<{ file: string; line: number; column: number; source: string; name: string; top: number }>();
  // Escape closes the peek window while the editor keeps focus (as in Visual Studio).
  useEffect(() => {
    if (!peek) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPeek(undefined); ref.current?.view?.focus(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [peek]);
  // Quick Actions popup (Ctrl+.): the actions Roslyn offers at the cursor, shown under it.
  const [quick, setQuick] = useState<{ items: { id: string; title: string; kind: string }[]; top: number; left: number; index: number }>();

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
        if (changed && editedThisSession(file)) { setText(draft); setRestorable(null); } else { setRestorable(changed ? draft : null); setText(r.source); }
      })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [file]);
  const auto = useAutoSave({ file, value: diskValue, loaded });
  // CRLF ⇄ LF (status bar, Edit menu): the buffer is unchanged, the file's separator changes (save to keep it).
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ file: string; eol: Eol }>).detail; if (d.file === file) setEol(d.eol); };
    window.addEventListener(SET_EOL_EVENT, h);
    return () => window.removeEventListener(SET_EOL_EVENT, h);
  }, [file]);
  useChangeBars(ref, file, !!loaded);
  // Coverage bars from the last test run with coverage (Test Explorer ▸ Analyze Code Coverage).
  const fileCoverage = useTestRun().coverage?.files[file] ?? null;
  useEffect(() => { let tries = 0; const apply = () => { const v = ref.current?.view; if (v) v.dispatch({ effects: setCoverage.of(fileCoverage) }); else if (tries++ < 30) requestAnimationFrame(apply); }; if (loaded) apply(); }, [fileCoverage, loaded]);
  /** Compare with Unmodified (Git): the editor text against the committed version, as a unified diff. */
  const [headDiff, setHeadDiff] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  // Markdown: editor, editor and preview side by side, or the preview alone (Rider's split editor).
  const mdPreviewOn = useFeature('markdown-preview');
  const isMd = /\.(md|markdown)$/i.test(file) && mdPreviewOn;
  const [mdMode, setMdMode] = useLocalState<'editor' | 'split' | 'preview'>('mdMode', 'split');
  // HTTP Client: the response of the last request sent from this .http file.
  const [httpResult, setHttpResult] = useState<HttpResult>();
  const sendHttp = async (line: number) => {
    const v = ref.current?.view;
    if (!v) return;
    if (!featureOn('http-client')) { onNotice?.('The HTTP Client is turned off in Settings ▸ Features.'); return; }
    const r = parseHttp(v.state.doc.toString()).find((x) => x.line === line);
    if (!r) return;
    const request = { method: r.method, url: r.url };
    setHttpResult({ request, loading: true });
    try { setHttpResult({ request, ...(await api<Omit<HttpResult, 'request'>>('/http/send', { method: r.method, url: r.url, headers: r.headers, body: r.body || undefined })) }); } catch (e) { setHttpResult({ request, error: (e as Error).message }); }
  };
  const sendHttpRef = useRef(sendHttp);
  sendHttpRef.current = sendHttp;
  const compareWithHead = async () => {
    const v = ref.current?.view;
    if (!v) return;
    try {
      const r = await api<{ repo: boolean; text: string | null }>(`/git/head?file=${encodeURIComponent(file)}`);
      if (!r.repo) { onNotice?.('This folder is not a Git repository.'); return; }
      const now = v.state.doc.toString();
      const base = (r.text ?? '').replace(/\r\n/g, '\n');
      if (base === now) { onNotice?.('No changes from the committed version.'); return; }
      setHeadDiff(createTwoFilesPatch(`${file} (HEAD)`, file, base, now, '', '', { context: 3 }).split('\n').slice(2).join('\n'));
    } catch (e) { onNotice?.((e as Error).message); }
  };
  /** Annotate: toggles the blame column (hidden again on the next edit). */
  const annotate = async () => {
    const v = ref.current?.view;
    if (!v) return;
    if (v.dom.querySelector('.cm-blame')) { v.dispatch({ effects: setBlame.of(null) }); return; }
    try { v.dispatch({ effects: setBlame.of(await api<BlameLine[]>(`/git/blame?file=${encodeURIComponent(file)}`)) }); } catch (e) { onNotice?.((e as Error).message); }
  };

  // Jump to the requested line once the document is in place.
  // A newly opened tab gets its text a moment after the editor exists, so wait (a few frames) for it.
  useEffect(() => {
    if (!loaded || !reveal) return;
    let tries = 0, frame = 0;
    const apply = () => {
      const view = ref.current?.view;
      if (!view || (view.state.doc.length === 0 && loaded.source.length > 0)) { if (tries++ < 30) frame = requestAnimationFrame(apply); return; }
      const l = view.state.doc.line(Math.max(1, Math.min(reveal.line, view.state.doc.lines)));
      // A column (go to definition) puts the cursor on the symbol; a line alone selects the line.
      const at = reveal.column ? Math.min(l.to, l.from + reveal.column - 1) : undefined;
      view.dispatch({ selection: at !== undefined ? { anchor: at } : { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
      view.focus();
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [loaded, reveal]);
  useEffect(() => { if (active) requestAnimationFrame(() => ref.current?.view?.requestMeasure()); }, [active]);
  useEffect(() => { if (loaded) loadLenses(); }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // After a save the server re-indexes (about 1.5 s): refresh the lenses then.
  useEffect(() => { if (auto.state !== 'saved') return; const t = setTimeout(loadLenses, 2500); return () => clearTimeout(t); }, [auto.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Another editor's rename (or a file operation) changed this file on disk: reload it unless it has unsaved edits.
  useEffect(() => {
    const h = (e: Event) => {
      if (!(e as CustomEvent<string[]>).detail.includes(file)) return;
      readFile(file).then((r) => {
        if (auto.dirty) { onNotice?.(`${file} changed on disk while it has unsaved edits; saving will ask you to reload.`); return; }
        setLoaded({ file, ...r });
        setText(r.source);
      }, () => {});
    };
    window.addEventListener(FILES_CHANGED_EVENT, h);
    return () => window.removeEventListener(FILES_CHANGED_EVENT, h);
  });

  const position = (pos: number) => { const v = ref.current!.view!; return { file, source: v.state.doc.toString(), ...lineCol(v.state.doc, pos) }; };
  const csHandlers = useRef<CsHandlers>({ definition: () => {}, references: () => {}, rename: () => {}, actions: () => {}, format: () => {}, implementations: () => {}, peek: () => {} });
  /** One location: go there; several: list them (Find All References panel). */
  const goToAny = (name: string, locations: CsLocation[], none: string) => {
    if (!locations.length) { onNotice?.(none); return; }
    if (locations.length > 1) { setRefs({ name, locations }); return; }
    const l = locations[0];
    if (l.file === file) { const v = ref.current!.view!; const at = offsetOf(v.state.doc, l.line, l.column); v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) }); v.focus(); }
    else onOpen?.(l.file, l.line, l.column);
  };
  csHandlers.current = {
    definition: async (pos) => {
      try {
        const r = await api<{ name: string; locations: CsLocation[]; external?: string }>('/csharp/definition', position(pos));
        const here = r.locations.find((l) => l.file === file);
        const target = here ?? r.locations[0];
        if (!target) { onNotice?.(`${r.name} is defined in ${r.external ?? 'a referenced assembly'} (no source in this repository).`); return; }
        if (target.file === file) { const v = ref.current!.view!; const at = offsetOf(v.state.doc, target.line, target.column); v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) }); v.focus(); }
        else onOpen?.(target.file, target.line, target.column);
      } catch (e) { onNotice?.((e as Error).message); }
    },
    references: async (pos) => {
      setBusyOp('Finding references…');
      try { setRefs(await api('/csharp/references', position(pos))); } catch (e) { onNotice?.((e as Error).message); } finally { setBusyOp(''); }
    },
    implementations: async (pos) => {
      try { const r = await api<{ name: string; locations: CsLocation[] }>('/csharp/implementations', position(pos)); goToAny(`Implementations of ${r.name}`, r.locations, `No implementations of ${r.name} in this repository.`); } catch (e) { onNotice?.((e as Error).message); }
    },
    peek: async (pos) => {
      const v = ref.current?.view;
      if (!v) return;
      try {
        const r = await api<{ name: string; locations: CsLocation[]; external?: string }>('/csharp/definition', position(pos));
        const l = r.locations[0];
        if (!l) { onNotice?.(`${r.name} is defined in ${r.external ?? 'a referenced assembly'}.`); return; }
        const src = l.file === file ? v.state.doc.toString() : (await readFile(l.file)).source;
        const box = v.coordsAtPos(pos);
        const host = v.dom.getBoundingClientRect();
        setPeek({ ...l, source: src, name: r.name, top: (box?.bottom ?? host.top) - host.top + 4 });
      } catch (e) { onNotice?.((e as Error).message); }
    },
    actions: async (from, to) => {
      const v = ref.current?.view;
      if (!v) return;
      setBusyOp('Finding quick actions…');
      try {
        const end = lineCol(v.state.doc, to);
        const items = await api<{ id: string; title: string; kind: string }[]>('/csharp/actions', { ...position(from), ...(to > from ? { endLine: end.line, endColumn: end.column } : {}) });
        if (!items.length) { onNotice?.('No quick actions here.'); return; }
        const box = v.coordsAtPos(from);
        const host = v.dom.getBoundingClientRect();
        setQuick({ items, index: 0, top: (box?.bottom ?? host.top) - host.top + 2, left: (box?.left ?? host.left) - host.left });
      } catch (e) { onNotice?.((e as Error).message); } finally { setBusyOp(''); }
    },
    format: async () => {
      const v = ref.current?.view;
      if (!v) return;
      const r = v.state.selection.main;
      try {
        const sel = r.to > r.from ? { selection: { ...lineCol(v.state.doc, r.from), endLine: lineCol(v.state.doc, r.to).line, endColumn: lineCol(v.state.doc, r.to).column } } : {};
        const out = await api<{ text: string }>('/csharp/format', { file, source: v.state.doc.toString(), ...sel });
        replaceText(v, out.text);
      } catch (e) { onNotice?.((e as Error).message); }
    },
    rename: (pos) => {
      const v = ref.current?.view;
      const word = v?.state.wordAt(pos);
      if (!v || !word) return;
      const box = v.coordsAtPos(word.from);
      const host = v.dom.getBoundingClientRect();
      if (!box) return;
      setRenameAt({ pos: word.from, name: v.state.sliceDoc(word.from, word.to), top: box.bottom - host.top + 2, left: box.left - host.left });
    },
  };
  /** Rename symbol (F2): every reference in the repository; other files are written, this one gets the new text. */
  const doRename = async (newName: string) => {
    const at = renameAt;
    setRenameAt(undefined);
    const v = ref.current?.view;
    if (!at || !v || !newName || newName === at.name) { v?.focus(); return; }
    setBusyOp(`Renaming ${at.name}…`);
    try {
      const r = await api<{ current: string | null; written: string[]; changes: { file: string; edits: number }[] }>('/csharp/rename', { ...position(at.pos), newName });
      if (r.current !== null) replaceText(v, r.current);
      if (r.written.length) window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: r.written }));
      const edits = r.changes.reduce((n, c) => n + c.edits, 0);
      onNotice?.(`Renamed ${at.name} to ${newName}: ${edits} change${edits === 1 ? '' : 's'} in ${r.changes.length} file${r.changes.length === 1 ? '' : 's'}.`);
    } catch (e) { onNotice?.((e as Error).message); } finally { setBusyOp(''); v.focus(); }
  };
  /** Applies the chosen Quick Action: this file gets its new text, other changed files are written by the server. */
  const applyQuick = async (id: string) => {
    setQuick(undefined);
    const v = ref.current?.view;
    if (!v) return;
    try {
      const r = await api<{ title: string; current: string | null; written: string[] }>('/csharp/applyAction', { file, actionId: id });
      if (r.current !== null) replaceText(v, r.current);
      if (r.written.length) { window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: r.written })); onNotice?.(`${r.title}: changed ${r.written.length + (r.current !== null ? 1 : 0)} files.`); }
    } catch (e) { onNotice?.((e as Error).message); } finally { v.focus(); }
  };
  /** Organize Usings: remove unnecessary usings and sort them (System first), like Visual Studio's Ctrl+R, Ctrl+G. */
  const organize = async () => {
    const v = ref.current?.view;
    if (!v) return;
    try {
      const r = await api<{ text: string; removed: number }>('/csharp/organize', { file, source: v.state.doc.toString() });
      replaceText(v, r.text);
      if (r.removed) onNotice?.(`Removed ${r.removed} unnecessary using${r.removed === 1 ? '' : 's'}.`);
    } catch (e) { onNotice?.((e as Error).message); }
  };
  const organizeRef = useRef(organize);
  organizeRef.current = organize;
  const clip = (action: 'cut' | 'copy' | 'paste') => {
    const v = ref.current?.view;
    if (!v) return;
    const r = v.state.selection.main;
    if (action === 'paste') { navigator.clipboard?.readText().then((t) => v.dispatch(v.state.replaceSelection(t)), () => onNotice?.('Paste with Ctrl+V; the browser blocked clipboard access.')); return; }
    void navigator.clipboard?.writeText(v.state.sliceDoc(r.from, r.to));
    pushClipboard(v.state.sliceDoc(r.from, r.to));
    if (action === 'cut') v.dispatch(v.state.replaceSelection(''));
  };


  // Quiet on success (the tab's ● disappears); only a failure is announced.
  const save = () => auto.save().then((ok) => { if (!ok) onNotice?.('Not saved: see the editor status.'); });
  const compare = async () => {
    try { setPreview(await api<FilePreview>('/file/preview', { file, source: diskValue })); } catch (e) { onNotice?.((e as Error).message); }
  };
  // Ctrl+S saves straight to disk (the latest buffer is read through a ref, so the keymap never rebuilds).
  // Cursor line for the navigation bar.
  const [caretLine, setCaretLine] = useState(1);
  const caretTracker = useMemo(() => EditorView.updateListener.of((u) => { if (u.selectionSet || u.docChanged) setCaretLine(u.state.doc.lineAt(u.state.selection.main.head).number); }), []);
  const eolRef = useRef<'CRLF' | 'LF'>('LF');
  eolRef.current = eol === '\r\n' ? 'CRLF' : 'LF';
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => { const h = () => { if (auto.dirty) void auto.save(); }; window.addEventListener(SAVE_ALL_EVENT, h); return () => window.removeEventListener(SAVE_ALL_EVENT, h); });
  const extensions = useMemo(() => [
    ...languageOf(file, browser),
    lintGutter(),
    ...(browser ? [] : [changeGutter()]),
    labelled(`Source of ${file}`, false),
    cursorTracker(file, () => eolRef.current),
    revealOn(file),
    bookmarks(file),
    trackActive(file),
    riderKeys(file), viewOptionsExtension(),
    caretTracker,
    blameGutter(),
    coverageGutter(),
    ...(commentTokenFor(file) === '//' ? [braceFolding(), stickyScroll(braceRange)] : []),
    ...(commentTokenFor(file) ? [vsKeys(commentTokenFor(file))] : []),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { void saveRef.current(); return true; } },
      ...(isCs && !browser ? [{ key: 'Mod-r Mod-g', preventDefault: true, run: () => { void organizeRef.current(); return true; } }] : []),
    ]),
    ...(isHttpFile(file) && !browser ? [httpClient((l) => void sendHttpRef.current(l))] : []),
    ...(isCs && featureOn('xml-doc') ? [xmlDocComments] : []),
    ...(isCs && !browser ? [...csharpLanguage(file, csHandlers), stepLenses((l) => showUsagesRef.current(l), (l) => openRefLensRef.current(l)), runGutter((l, d) => runRef.current?.(l, d))] : []),
    // Stable per file: rebuilding extensions on every keystroke would reset the linter before it reports.
  ], [file, browser]);

  // Stable: a new function each render would make @uiw/react-codemirror reconfigure the editor every time.
  const countProblems = useCallback((u: ViewUpdate) => {
    if (!u.docChanged && !u.transactions.some((t) => t.effects.length)) return;
    let errors = 0, warnings = 0;
    forEachDiagnostic(u.state, (d) => { if (d.severity === 'error') errors++; else if (d.severity === 'warning') warnings++; });
    setProblems((p) => (p.errors === errors && p.warnings === warnings ? p : { errors, warnings }));
  }, []);
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
        {isMd && (
          <span className="md-modes" role="radiogroup" aria-label="Markdown view">
            <IconButton label="Editor only" aria-pressed={mdMode === 'editor'} onClick={() => setMdMode('editor')}><CodeIcon size={14} /></IconButton>
            <IconButton label="Editor and preview" aria-pressed={mdMode === 'split'} onClick={() => setMdMode('split')}><Columns2 size={14} /></IconButton>
            <IconButton label="Preview only" aria-pressed={mdMode === 'preview'} onClick={() => setMdMode('preview')}><FileText size={14} /></IconButton>
          </span>
        )}
        <IconButton label="Revert file" disabled={!auto.dirty} onClick={() => loaded && setText(loaded.source)}><RotateCcw size={14} /></IconButton>
        <IconButton label="Save" shortcut="Ctrl S" disabled={!auto.dirty} onClick={save}><Save size={14} /></IconButton>
      </EditorActions>
      {restorable !== null && (
        <div className="info-box restore-box" role="status">
          <TriangleAlert size={14} /> Unsaved changes from an earlier session were kept.
          <Button size="tiny" onClick={() => { setText(restorable); setRestorable(null); }}>Restore</Button>
          <Button size="tiny" variant="ghost" onClick={() => setRestorable(null)}>Discard</Button>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      {loaded && isCs && !browser && (
        <NavBar file={file} source={value} line={caretLine} onGo={(l, c) => { const v = ref.current?.view; if (!v) return; const at = offsetOf(v.state.doc, l, c); v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) }); v.focus(); }} />
      )}
      {loaded && (
        <div className={isMd ? `md-layout md-mode-${mdMode}` : 'md-none'}>
        <RowMenu label="Editor actions" items={[
          ...(isCs && !browser ? [
            { label: 'Go To Definition', icon: Navigation, shortcut: 'F12', onSelect: () => csHandlers.current.definition(ref.current!.view!.state.selection.main.head) },
            { label: 'Peek Definition', icon: Eye, shortcut: 'Alt F12', onSelect: () => void csHandlers.current.peek(ref.current!.view!.state.selection.main.head) },
            { label: 'Go To Implementation', icon: Navigation, shortcut: 'Ctrl F12', onSelect: () => void csHandlers.current.implementations(ref.current!.view!.state.selection.main.head) },
            { label: 'Go To Base', icon: Navigation, onSelect: async () => { try { const r = await api<{ name: string; locations: CsLocation[]; external?: string }>('/csharp/base', position(ref.current!.view!.state.selection.main.head)); goToAny(`Base of ${r.name}`, r.locations, r.external ? `The base is ${r.external} (outside this repository).` : `${r.name} has no base in this repository.`); } catch (e) { onNotice?.((e as Error).message); } } },
            { label: 'Find All References', icon: ListTree, shortcut: 'Shift F12', onSelect: () => csHandlers.current.references(ref.current!.view!.state.selection.main.head) },
            { label: 'Find Step Usages', icon: ListTree, onSelect: () => {
              const v = ref.current!.view!;
              const line = v.state.doc.lineAt(v.state.selection.main.head).number;
              const l = [...lenses.current].sort((a, b) => b.line - a.line).find((x) => x.line <= line);
              if (l) showUsages(l); else onNotice?.('Put the cursor in a step definition ([Given], [When], [Then]).');
            } },
            { label: 'Rename Step…', icon: TextCursorInput, onSelect: () => { const l = lensAtCursor(); if (l) setRenameStep(l); else onNotice?.('Put the cursor in a step definition ([Given], [When], [Then]).'); } },
            { label: 'Rename…', icon: TextCursorInput, shortcut: 'F2', onSelect: () => csHandlers.current.rename(ref.current!.view!.state.selection.main.head) },
            { label: 'Quick Actions and Refactorings…', icon: Lightbulb, shortcut: 'Ctrl .', onSelect: () => { const r = ref.current!.view!.state.selection.main; void csHandlers.current.actions(r.from, r.to); } },
            'separator' as const,
            { label: 'Format Document', icon: AlignLeft, shortcut: 'Shift Alt F', onSelect: () => void csHandlers.current.format() },
            { label: 'Remove and Sort Usings', icon: ListOrdered, shortcut: 'Ctrl R, Ctrl G', onSelect: () => void organize() },
            'separator' as const,
          ] : []),
          ...(!browser ? [{ label: 'Compare with Unmodified', icon: GitCompareArrows, onSelect: () => void compareWithHead() }, ...(featureOn('local-history') ? [{ label: 'Local History…', icon: History, onSelect: () => setHistoryOpen(true) }] : []), { label: 'Annotate (Git Blame)', icon: History, onSelect: () => void annotate() }, 'separator' as const] : []),
          { label: 'Cut', icon: Scissors, shortcut: 'Ctrl X', onSelect: () => clip('cut') },
          { label: 'Copy', icon: Copy, shortcut: 'Ctrl C', onSelect: () => clip('copy') },
          { label: 'Paste', icon: ClipboardPaste, shortcut: 'Ctrl V', onSelect: () => clip('paste') },
          'separator' as const,
          { label: 'Save', icon: Save, shortcut: 'Ctrl S', onSelect: () => void save() },
        ]}>
        <div className="code-editor-surface" onBlur={auto.onBlur} data-menu-row>
          <CodeMirror
            ref={ref}
            value={value}
            theme={theme}
            height="100%"
            extensions={extensions}
            // Word completion is not C# IntelliSense: it hijacks Enter (e.g. "test" → DateTimeOffset), so it stays off.
            basicSetup={CODE_SETUP}
            onChange={setValue}
            onUpdate={countProblems}
          />
          {renameAt && (
            <input
              className="cm-rename-box"
              aria-label={`Rename ${renameAt.name}`}
              defaultValue={renameAt.name}
              autoFocus
              style={{ top: renameAt.top, left: renameAt.left }}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void doRename(e.currentTarget.value.trim()); if (e.key === 'Escape') { setRenameAt(undefined); ref.current?.view?.focus(); } }}
              onBlur={() => setRenameAt(undefined)}
            />
          )}
          {quick && (
            <ul
              className="cm-quick-actions"
              role="listbox"
              aria-label="Quick Actions"
              tabIndex={-1}
              style={{ top: quick.top, left: quick.left }}
              ref={(el) => el?.focus()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'ArrowDown') { e.preventDefault(); setQuick({ ...quick, index: (quick.index + 1) % quick.items.length }); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setQuick({ ...quick, index: (quick.index - 1 + quick.items.length) % quick.items.length }); }
                else if (e.key === 'Enter') { e.preventDefault(); void applyQuick(quick.items[quick.index].id); }
                else if (e.key === 'Escape') { setQuick(undefined); ref.current?.view?.focus(); }
              }}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setQuick(undefined); }}
            >
              {quick.items.map((a, i) => (
                <li key={a.id} role="option" aria-selected={i === quick.index} className={`${i === quick.index ? 'active' : ''} ${a.kind}`} onMouseDown={(e) => { e.preventDefault(); void applyQuick(a.id); }} onMouseEnter={() => setQuick({ ...quick, index: i })}>
                  {a.kind === 'fix' ? <Lightbulb size={13} aria-hidden="true" /> : <Wrench size={13} aria-hidden="true" />}{a.title}
                </li>
              ))}
            </ul>
          )}
          {peek && (
            <section className="cm-peek" aria-label={`Peek Definition: ${peek.name}`} style={{ top: peek.top }} onKeyDown={(e) => { if (e.key === 'Escape') { setPeek(undefined); ref.current?.view?.focus(); } }}>
              <div className="cm-peek-head">
                <strong>{peek.file.split('/').pop()}</strong><span className="meta">{peek.file}:{peek.line}</span>
                <button className="button" onClick={() => { const p = peek; setPeek(undefined); if (p.file === file) { const v = ref.current!.view!; const at = offsetOf(v.state.doc, p.line, p.column); v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) }); v.focus(); } else onOpen?.(p.file, p.line, p.column); }}>Open</button>
                <IconButton label="Close peek" onClick={() => { setPeek(undefined); ref.current?.view?.focus(); }}><X size={13} /></IconButton>
              </div>
              <CodeMirror
                value={peek.source}
                theme={theme}
                height="220px"
                editable={false}
                basicSetup={PEEK_SETUP}
                extensions={[StreamLanguage.define(csharp), EditorView.contentAttributes.of({ 'aria-label': `Definition of ${peek.name}` })]}
                onCreateEditor={(v) => { const l = v.state.doc.line(Math.min(peek.line, v.state.doc.lines)); v.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'start', yMargin: 40 }) }); }}
              />
            </section>
          )}
          {busyOp && <span className="cm-busy" role="status"><Loader size={12} className="spin" />{busyOp}</span>}
        </div>
        </RowMenu>
        {isMd && mdMode !== 'editor' && <MarkdownPreview source={value} />}
        </div>
      )}
      {renameStep && (
        <RenameStep
          key={`${renameStep.line}`}
          file={file}
          line={renameStep.line}
          pattern={renameStep.pattern}
          onNotice={(m) => onNotice?.(m)}
          beforeApply={async () => (auto.dirty ? auto.save() : true)}
          onClose={() => { setRenameStep(undefined); ref.current?.view?.focus(); }}
          onDone={(written, index) => { setRenameStep(undefined); window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: written })); onIndex?.(index); setTimeout(loadLenses, 300); }}
        />
      )}
      {httpResult && <HttpResponse result={httpResult} onClose={() => setHttpResult(undefined)} />}
      {historyOpen && (
        <section className="references-panel compare-panel" aria-label={`Local history of ${file}`}>
          <div className="references-head">
            <strong>Local History</strong> <span className="meta">{file}</span>
            <IconButton label="Close local history" onClick={() => setHistoryOpen(false)}><X size={13} /></IconButton>
          </div>
          <LocalHistory file={file} current={value} onRevert={(src) => { setText(src); setHistoryOpen(false); onNotice?.('Reverted in the editor: save to keep it.'); }} />
        </section>
      )}
      {headDiff !== undefined && (
        <section className="references-panel compare-panel" aria-label={`Changes in ${file}`}>
          <div className="references-head">
            <strong>Compare with Unmodified</strong> <span className="meta">{file}</span>
            <IconButton label="Close compare" onClick={() => setHeadDiff(undefined)}><X size={13} /></IconButton>
          </div>
          <CodeMirror value={headDiff} theme={theme} editable={false} basicSetup={PEEK_SETUP} extensions={DIFF_EXTENSIONS} height="240px" />
        </section>
      )}
      {refs && (
        <section className="references-panel" aria-label={`References to ${refs.name}`}>
          <div className="references-head">
            <strong>{refs.locations.length} reference{refs.locations.length === 1 ? '' : 's'}</strong> <span className="meta">{refs.name}</span>
            <IconButton label="Close references" onClick={() => setRefs(undefined)}><X size={13} /></IconButton>
          </div>
          <ul>
            {refs.locations.map((l, i) => (
              <li key={i}><button onClick={() => { if (l.file === file) { const v = ref.current!.view!; const at = offsetOf(v.state.doc, l.line, l.column); v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) }); v.focus(); } else onOpen?.(l.file, l.line, l.column); }}>{l.text ? <><span className="ref-text">{l.text}</span><span className="meta">{l.file}:{l.line}</span></> : <>{l.file}<span className="meta">({l.line}, {l.column})</span></>}</button></li>
            ))}
          </ul>
        </section>
      )}
      {preview && (
        <div className="code-editor-preview">
          <DiffApproval preview={preview} height="200px" onApplied={(i) => { auto.markSaved(diskValue); setPreview(undefined); onIndex?.(i); onNotice?.(`${file} written.`); }} />
          <Button size="small" variant="ghost" onClick={() => setPreview(undefined)}>Close comparison</Button>
        </div>
      )}
    </section>
  );
}
