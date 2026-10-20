import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { ChevronRight, ChevronDown, Play, Pause, Square, RotateCw, ArrowDownToLine, ArrowUpFromLine, Redo2, X, CircleDot, Trash2, Bug, Loader, CircleOff, Settings2 } from 'lucide-react';
import { IconButton } from '../radix2';
import { api } from '../api';
import { RowMenu, copyText } from '../ui';
import { featureOn } from '../features';
import { useDebug, debugControl, selectFrame, setWatches, getSnapshot, setBreakpoints, clearBreakpoints, startDebugging, isLive, breakpointsOf, updateBreakpoint, enableAllBreakpoints, stepOutTo, type Variable, type DebugFrame } from './store';
import { useLocalState } from '../ui';
import { readFile } from '../files/provider';
import { formatXml } from '../editor/textTools2';

const CS_KEYWORDS = new Set('var new return if else for foreach while do in is as await async public private protected internal static readonly void int string bool double decimal long float char object true false null this base typeof sizeof nameof using namespace class struct interface enum get set value throw try catch finally switch case default break continue out ref params let'.split(' '));

const statusText: Record<string, string> = { idle: 'Not debugging', building: 'Building…', starting: 'Starting test host…', running: 'Running', paused: 'Paused', ended: 'Ended' };

/** One expandable row of the Locals / Watch trees (children load on demand, like Visual Studio). */
function VariableRow({ v, depth, frameKey }: { v: { name: string; value: string; type?: string; variablesReference: number; parentRef?: number }; depth: number; frameKey: string }) {
  const [open, setOpen] = useState(false);
  // Edit Value: double-click the value (Locals and expanded members), Enter sets it, Escape cancels.
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => { setShown(null); setEditingValue(null); }, [frameKey, v.value]);
  const editable = featureOn('edit-values') && !!v.parentRef;
  const commit = async () => { if (editingValue === null) return; try { const r = await api<{ value: string }>('/debug/set-variable', { ref: v.parentRef, name: v.name, value: editingValue }); setShown(r.value); } catch (e) { window.dispatchEvent(new CustomEvent('tas:notice', { detail: (e as Error).message })); } setEditingValue(null); };
  const [children, setChildren] = useState<Variable[]>();
  useEffect(() => { setChildren(undefined); setOpen(false); }, [frameKey]);
  const expandable = v.variablesReference > 0;
  const toggle = async () => {
    if (!expandable) return;
    if (!open && !children) setChildren(await api<Variable[]>('/debug/variables', { ref: v.variablesReference }).catch(() => []));
    setOpen(!open);
  };
  return (
    <>
      <RowMenu label={`${v.name} value`} items={[...(featureOn('table-visualizer') && v.variablesReference > 0 ? [{ label: 'View as Table', onSelect: () => window.dispatchEvent(new CustomEvent('tas:visualize-table', { detail: { name: v.name, ref: v.variablesReference } })) }] : []), ...(featureOn('visualizers') && /^".*"$/s.test(v.value) ? (['Text', 'JSON', 'XML'] as const).map((k) => ({ label: `${k} Visualizer`, onSelect: () => window.dispatchEvent(new CustomEvent('tas:visualize', { detail: { name: v.name, kind: k, value: v.value } })) })) : []), ...(featureOn('copy-value') ? [{ label: 'Copy Value', onSelect: () => void copyText(v.value) }, { label: 'Copy Expression', onSelect: () => void copyText(v.name) }, { label: 'Add Watch', onSelect: () => { const w = getSnapshot().watches; if (!w.includes(v.name)) setWatches([...w, v.name]); } }] : [])]}>
      <div className="dbg-row" data-menu-row role="row" aria-expanded={expandable ? open : undefined}>
        <span role="gridcell" className="dbg-name" style={{ paddingLeft: depth * 14 }}>
          {expandable ? <button className="se-twisty" aria-label={`${open ? 'Collapse' : 'Expand'} ${v.name}`} onClick={toggle}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="se-twisty-space" />}
          {v.name}
        </span>
        <span role="gridcell" className="dbg-value" title={editable ? `${shown ?? v.value} (double-click to edit)` : v.value} onDoubleClick={() => { if (editable) setEditingValue(shown ?? v.value); }}>{editingValue !== null ? <input className="dbg-edit" aria-label={`New value of ${v.name}`} autoFocus value={editingValue} onChange={(e) => setEditingValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void commit(); else if (e.key === 'Escape') { e.stopPropagation(); setEditingValue(null); } }} onBlur={() => setEditingValue(null)} /> : shown ?? v.value}</span>
        <span role="gridcell" className="dbg-type">{v.type ?? ''}</span>
      </div>
      </RowMenu>
      {open && children?.map((c) => <VariableRow key={c.name} v={{ ...c, parentRef: v.variablesReference }} depth={depth + 1} frameKey={frameKey} />)}
    </>
  );
}
/** The text of a C# string value as the debugger shows it ("…" with escapes), for a visualizer. */
export function visualize(kind: 'Text' | 'JSON' | 'XML', value: string) {
  let text = value;
  if (/^".*"$/s.test(value)) { try { text = JSON.parse(value) as string; } catch { text = value.slice(1, -1); } }
  if (kind === 'JSON') { try { return JSON.stringify(JSON.parse(text), null, 2); } catch (e) { return `Not valid JSON: ${(e as Error).message}\n\n${text}`; } }
  if (kind === 'XML') return formatXml(text) ?? `Not well-formed XML.\n\n${text}`;
  return text;
}
const VisualTable = ({ rows }: { rows: Record<string, string>[] }) => {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return <div className="dbg-visualizer-table"><table aria-label="Visualizer table"><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{r[c] ?? ''}</td>)}</tr>)}</tbody></table></div>;
};
const Grid = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="dbg-grid" role="treegrid" aria-label={label}>
    <div className="dbg-row dbg-head" role="row"><span role="columnheader">Name</span><span role="columnheader">Value</span><span role="columnheader">Type</span></div>
    {children}
  </div>
);

/**
 * The debug windows docked under the editor: toolbar (Continue F5, Break All, Stop Shift+F5, Restart,
 * Step Into F11, Step Over F10, Step Out Shift+F11), Locals, Watch, Call Stack, Breakpoints and Output.
 */
export default function DebugPanel({ onOpen, onNotice, onClose, editingRequest = null, editingNonce = null }: { onOpen: (file: string, line: number) => void; onNotice: (m: string) => void; onClose: () => void; editingRequest?: string | null; editingNonce?: string | null }) {
  const { state, watches, frameIndex, breakpoints } = useDebug();
  const [tab, setTab] = useLocalState('debugTab', 'locals');
  const frame: DebugFrame | undefined = state.status === 'paused' ? state.frames[frameIndex] : undefined;
  const frameKey = `${state.version}:${frame?.id ?? ''}`;
  const [locals, setLocals] = useState<Variable[]>([]);
  const [localsQuery, setLocalsQuery] = useState('');
  // Visualizers (Visual Studio's magnifier): a string as text, formatted JSON or XML; a collection as a table.
  const [visual, setVisual] = useState<{ kind: string; name: string; text?: string; rows?: Record<string, string>[] } | null>(null);
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ name: string; kind: 'Text' | 'JSON' | 'XML'; value: string }>).detail; setVisual({ kind: d.kind, name: d.name, text: visualize(d.kind, d.value) }); };
    window.addEventListener('tas:visualize', h);
    return () => window.removeEventListener('tas:visualize', h);
  }, []);
  // IEnumerable visualizer (Visual Studio 2022+): a collection's items as rows, their members as columns.
  useEffect(() => {
    const h = (e: Event) => {
      const { name, ref } = (e as CustomEvent<{ name: string; ref: number }>).detail;
      void (async () => {
        // Arrays show [0], [1]…; a List<T> keeps them in _items (under Non-Public members), its Count says how many are used.
        const itemsOf = async (r: number, depth = 0): Promise<Variable[]> => {
          const kids = await api<Variable[]>('/debug/variables', { ref: r });
          const idx = kids.filter((k) => /^\[\d+\]$/.test(k.name));
          if (idx.length || depth > 2) return idx;
          const count = Number(kids.find((k) => k.name === 'Count')?.value);
          for (const k of kids) if (k.variablesReference > 0 && /^(_items|Non-Public members|Raw View|Results View)$/.test(k.name)) { const found = await itemsOf(k.variablesReference, depth + 1); if (found.length) return Number.isFinite(count) ? found.slice(0, count) : found; }
          return [];
        };
        const items = (await itemsOf(ref)).slice(0, 200);
        const rows = await Promise.all(items.map(async (it): Promise<Record<string, string>> => {
          if (it.variablesReference <= 0) return { '#': it.name, Value: it.value };
          const members = (await api<Variable[]>('/debug/variables', { ref: it.variablesReference }).catch(() => [])).filter((m) => !/(Raw View|Static members|Non-Public members)/.test(m.name));
          return { '#': it.name, ...Object.fromEntries(members.map((m) => [m.name, m.value])) };
        }));
        setVisual({ kind: 'Table', name: `${name} (${items.length} item${items.length === 1 ? '' : 's'})`, rows: rows.length ? rows : [{ Value: 'No items.' }] });
      })().catch((err) => onNotice((err as Error).message));
    };
    window.addEventListener('tas:visualize-table', h);
    return () => window.removeEventListener('tas:visualize-table', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<{ result?: string; type?: string; error?: string; variablesReference?: number }[]>([]);
  const [draft, setDraft] = useState('');
  // Exception Settings (kept per browser, sent to the server so the next session uses them too).
  const [breakOn, setBreakOn] = useLocalState<'unhandled' | 'all' | 'never'>('breakOn', 'unhandled');
  useEffect(() => { void api('/debug/exceptions', { breakOn }).catch(() => {}); }, [breakOn]);
  const [justMyCode, setJustMyCode] = useLocalState('justMyCode', true);
  useEffect(() => { if (featureOn('just-my-code')) void api('/debug/options', { justMyCode }).catch(() => {}); }, [justMyCode]);
  // Autos: variables used on the current and previous line (Visual Studio's Autos window).
  const [autos, setAutos] = useState<{ name: string; value: string; type?: string; variablesReference: number }[]>([]);
  useEffect(() => {
    if (!frame?.file) { setAutos([]); return; }
    let live = true;
    (async () => {
      const source = await readFile(frame.file!).then((r) => r.source, () => '');
      const lines = source.split(/\r?\n/);
      const text = `${lines[frame.line - 2] ?? ''}\n${lines[frame.line - 1] ?? ''}`;
      // Whole member chains; a chain that is called ("page.Add(") contributes its object ("page"), not the method.
      const found = [...text.matchAll(/(?<![\w."])[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g)].map((m) => {
        const called = /^\s*\(/.test(text.slice((m.index ?? 0) + m[0].length));
        return called ? (m[0].includes('.') ? m[0].slice(0, m[0].lastIndexOf('.')) : '') : m[0];
      });
      const names = [...new Set(found.filter((n) => n && !CS_KEYWORDS.has(n.split('.')[0])))].slice(0, 20);
      if (!names.length) { if (live) setAutos([]); return; }
      const results = await api<{ result?: string; type?: string; error?: string; variablesReference?: number }[]>('/debug/evaluate', { expressions: names, frameId: frame.id }).catch(() => []);
      if (live) setAutos(names.map((name, i) => ({ name, value: results[i]?.result ?? '', type: results[i]?.type, variablesReference: results[i]?.variablesReference ?? 0, ok: !results[i]?.error && results[i]?.result !== undefined })).filter((a) => a.ok));
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);
  // Immediate window: evaluate expressions while paused; ↑ recalls earlier ones.
  const [immediate, setImmediate] = useState<{ expr: string; out: string; error?: boolean }[]>([]);
  const [immDraft, setImmDraft] = useState('');
  const [immIndex, setImmIndex] = useState(-1);
  const runImmediate = async () => {
    const expr = immDraft.trim();
    if (!expr) return;
    setImmDraft('');
    setImmIndex(-1);
    const r = await api<{ result?: string; type?: string; error?: string }>('/debug/immediate', { expression: expr, frameId: frame?.id }).catch((e): { result?: string; type?: string; error?: string } => ({ error: (e as Error).message }));
    setImmediate((list) => [...list, { expr, out: r.error ?? `${r.result}${r.type ? `  (${r.type})` : ''}`, error: !!r.error }]);
  };

  useEffect(() => {
    if (!frame) { setLocals([]); return; }
    let live = true;
    (async () => {
      const scopes = await api<{ name: string; variablesReference: number }[]>('/debug/scopes', { frameId: frame.id }).catch(() => []);
      const all = (await Promise.all(scopes.map((s) => api<Variable[]>('/debug/variables', { ref: s.variablesReference }).then((vs) => vs.map((v) => ({ ...v, parentRef: s.variablesReference })), () => [])))).flat();
      if (live) setLocals(all);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);
  // Inline values (Visual Studio 2026 / Rider): the editor shows the locals next to the lines that use them.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('tas:inline-values', { detail: frame?.file && locals.length ? { file: frame.file, line: frame.line, values: locals.map((v) => ({ name: v.name, value: v.value })) } : null }));
  }, [locals, frame?.file, frame?.line]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent('tas:inline-values', { detail: null })); }, []);
  useEffect(() => {
    if (!frame || !watches.length) { setValues([]); return; }
    let live = true;
    api<typeof values>('/debug/evaluate', { expressions: watches, frameId: frame.id }).then((r) => live && setValues(r), () => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, watches.join('\n')]);

  const act = (a: Parameters<typeof debugControl>[0]) => debugControl(a).catch((e) => onNotice((e as Error).message));
  const paused = state.status === 'paused';
  const live = isLive(state.status);
  const restart = async () => {
    const target = state.target;
    if (live) await debugControl('stop').catch(() => {});
    if (target) startDebugging({ project: target.project, filter: target.filter }).catch((e) => onNotice((e as Error).message));
  };
  const [bpQuery, setBpQuery] = useState('');
  // Function breakpoints (kept per browser, sent to the server for this and the next sessions).
  const [fnBps, setFnBps] = useLocalState<string[]>('functionBreakpoints', []);
  useEffect(() => { if (featureOn('function-breakpoints')) void api('/debug/function-breakpoints', { names: fnBps }).catch(() => {}); }, [fnBps.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const bpList = Object.entries(breakpoints).flatMap(([file, specs]) => specs.map((b) => ({ ...b, file, verified: state.breakpoints[file]?.find((x) => x.line === b.line)?.verified })));
  // Search in the Breakpoints window (Visual Studio): file, line, condition, log message, labels.
  const bpText = (b: (typeof bpList)[number]) => `${b.file}:${b.line} ${b.condition ?? ''} ${b.hitCondition ?? ''} ${b.logMessage ?? ''} ${(b as { labels?: string[] }).labels?.join(' ') ?? ''}`.toLowerCase();
  const shownBps = featureOn('bp-search') && bpQuery.trim() ? bpList.filter((b) => bpQuery.toLowerCase().split(/\s+/).filter(Boolean).every((t) => bpText(b).includes(t))) : bpList;
  // Breakpoint Settings being edited (Visual Studio's peek under the breakpoint): file:line.
  const [editing, setEditing] = useState<string | null>(editingRequest);
  useEffect(() => { if (editingRequest) { setTab('breakpoints'); setEditing(editingRequest); } }, [editingNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const addWatch = () => { const e = draft.trim(); if (e) setWatches([...watches, e]); setDraft(''); };

  return (
    <section className="debug-panel" aria-label="Debugger">
      <div className="debug-toolbar" role="toolbar" aria-label="Debug">
        <Bug size={14} aria-hidden="true" />
        <span className={`debug-status ${state.status}`} role="status">
          {(state.status === 'building' || state.status === 'starting') && <Loader size={12} className="spin" />}
          {statusText[state.status]}{state.reason && state.status !== 'running' ? ` · ${state.reason}` : ''}
        </span>
        <IconButton label="Continue" shortcut="F5" disabled={!paused} onClick={() => act('continue')}><Play size={14} /></IconButton>
        <IconButton label="Break All" shortcut="Ctrl Alt Break" disabled={state.status !== 'running'} onClick={() => act('pause')}><Pause size={14} /></IconButton>
        <IconButton label="Stop Debugging" shortcut="Shift F5" disabled={!live} onClick={() => act('stop')}><Square size={13} /></IconButton>
        <IconButton label="Restart" shortcut="Ctrl Shift F5" disabled={!state.target} onClick={restart}><RotateCw size={14} /></IconButton>
        <span className="debug-sep" />
        <IconButton label="Step Into" shortcut="F11" disabled={!paused} onClick={() => act('stepIn')}><ArrowDownToLine size={14} /></IconButton>
        <IconButton label="Step Over" shortcut="F10" disabled={!paused} onClick={() => act('next')}><Redo2 size={14} /></IconButton>
        <IconButton label="Step Out" shortcut="Shift F11" disabled={!paused} onClick={() => act('stepOut')}><ArrowUpFromLine size={14} /></IconButton>
        <span className="debug-sep" />
        <label className="debug-breakon" title="Exception Settings: when to break on .NET exceptions">
          Break on
          <select aria-label="Break on exceptions" value={breakOn} onChange={(e) => setBreakOn(e.target.value as typeof breakOn)}>
            <option value="unhandled">Unhandled exceptions</option>
            <option value="all">All thrown exceptions</option>
            <option value="never">Never</option>
          </select>
        </label>
        {featureOn('just-my-code') && <label className="debug-breakon" title="Just My Code: step and stop only in the solution's code (applies to the next session)"><input type="checkbox" aria-label="Just My Code" checked={justMyCode} onChange={(e) => setJustMyCode(e.target.checked)} /> Just My Code</label>}
        <span className="toolbar-spacer" />
        {state.target && <span className="meta debug-target" title={state.target.filter}>{state.target.label}</span>}
        <IconButton label="Close debug windows" onClick={onClose}><X size={14} /></IconButton>
      </div>
      {state.error && <p className="field-error debug-error" role="alert">{state.error.slice(0, 600)}</p>}
      {state.exception && <p className="field-error debug-error" role="alert">Exception thrown: {state.exception}</p>}
      {visual && (
        <div className="dbg-visualizer" role="dialog" aria-label={`${visual.kind} Visualizer`}>
          <div className="dbg-visualizer-head"><strong>{visual.kind} Visualizer</strong> <span className="meta">{visual.name}</span><span className="toolbar-spacer" />{visual.text && <button className="link-button" onClick={() => void copyText(visual.text!)}>Copy</button>}<IconButton label="Close visualizer" onClick={() => setVisual(null)}><X size={13} /></IconButton></div>
          {visual.rows ? <VisualTable rows={visual.rows} /> : <pre className="dbg-visualizer-text" aria-label="Visualizer text">{visual.text}</pre>}
        </div>
      )}
      <Tabs.Root className="debug-tabs" value={tab} onValueChange={setTab}>
        <Tabs.List className="debug-tablist" aria-label="Debug windows">
          <Tabs.Trigger value="autos">Autos</Tabs.Trigger>
          <Tabs.Trigger value="locals">Locals</Tabs.Trigger>
          <Tabs.Trigger value="watch">Watch 1</Tabs.Trigger>
          <Tabs.Trigger value="stack">Call Stack</Tabs.Trigger>
          <Tabs.Trigger value="breakpoints">Breakpoints{bpList.length ? ` (${bpList.length})` : ''}</Tabs.Trigger>
          <Tabs.Trigger value="immediate">Immediate</Tabs.Trigger>
          <Tabs.Trigger value="output">Output</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="autos" className="debug-body">
          {frame ? <Grid label="Autos">{autos.map((v) => <VariableRow key={v.name} v={v} depth={0} frameKey={frameKey} />)}</Grid> : <p className="subtle debug-empty">Autos appear when the debugger is paused.</p>}
        </Tabs.Content>
        <Tabs.Content value="immediate" className="debug-body immediate">
          <div className="immediate-log" aria-label="Immediate results" role="log">
            {immediate.map((r, i) => <div key={i}><code>&gt; {r.expr}</code><pre className={r.error ? 'error' : ''}>{r.out}</pre></div>)}
          </div>
          <input
            aria-label="Immediate expression"
            placeholder={frame ? 'Expression (Enter to evaluate, ↑ for history)' : 'Pause the debugger to evaluate expressions'}
            disabled={!frame}
            value={immDraft}
            onChange={(e) => setImmDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void runImmediate(); }
              else if (e.key === 'ArrowUp' && immediate.length) { e.preventDefault(); const i = immIndex < 0 ? immediate.length - 1 : Math.max(0, immIndex - 1); setImmIndex(i); setImmDraft(immediate[i].expr); }
              else if (e.key === 'ArrowDown' && immIndex >= 0) { e.preventDefault(); const i = immIndex + 1; if (i >= immediate.length) { setImmIndex(-1); setImmDraft(''); } else { setImmIndex(i); setImmDraft(immediate[i].expr); } }
            }}
          />
        </Tabs.Content>
        <Tabs.Content value="locals" className="debug-body">
          {frame ? <>{featureOn('copy-locals') && locals.length > 0 && <div className="debug-locals-tools"><button className="link-button" onClick={() => void copyText(JSON.stringify(Object.fromEntries(locals.map((v) => [v.name, v.value])), null, 2))}>Copy All as JSON</button></div>}<>{featureOn('locals-search') && <input className="dbg-bp-search dbg-locals-search" type="search" aria-label="Search Locals" placeholder="Search Locals" value={localsQuery} onChange={(e) => setLocalsQuery(e.target.value)} />}<Grid label="Locals">{locals.filter((v) => !featureOn('locals-search') || !localsQuery.trim() || `${v.name} ${v.value} ${v.type ?? ''}`.toLowerCase().includes(localsQuery.trim().toLowerCase())).map((v) => <VariableRow key={v.name} v={v} depth={0} frameKey={frameKey} />)}</Grid></></> : <p className="subtle debug-empty">Locals appear when the debugger is paused.</p>}
        </Tabs.Content>
        <Tabs.Content value="watch" className="debug-body">
          <Grid label="Watch 1">
            {watches.map((w, i) => {
              const r = values[i];
              return (
                <div key={`${w}-${i}`} className="dbg-watch">
                  <VariableRow v={{ name: w, value: !frame ? '' : r?.error ? r.error : r?.result ?? '…', type: r?.type, variablesReference: r?.variablesReference ?? 0 }} depth={0} frameKey={frameKey} />
                  <IconButton label={`Remove watch ${w}`} className="dbg-remove" onClick={() => setWatches(watches.filter((_, j) => j !== i))}><X size={12} /></IconButton>
                </div>
              );
            })}
            <div className="dbg-row dbg-add" role="row">
              <span role="gridcell" className="dbg-name">
                <input aria-label="Add item to watch" placeholder="Add item to watch" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addWatch(); }} onBlur={addWatch} />
              </span>
            </div>
          </Grid>
        </Tabs.Content>
        <Tabs.Content value="stack" className="debug-body">
          {state.frames.length ? (
            <ul className="dbg-list" aria-label="Call Stack">
              {state.frames.map((f, i) => (i > 0 && f.external && state.frames[i - 1].external ? null : f.external && !f.file ? (
                <li key={f.id}><span className="dbg-frame external"><span className="dbg-frame-mark" />[External Code]</span></li>
              ) : (
                <li key={f.id}>
                  <RowMenu label={`${f.name} frame`} items={featureOn('step-out-to') && i > 0 && f.file ? [{ label: 'Step Out to Here', onSelect: () => void stepOutTo(state.frames.slice(0, i).filter((x, k) => !x.external || k === 0).length).catch((e) => onNotice((e as Error).message)) }] : []}>
                  <button className={`dbg-frame ${i === frameIndex ? 'current' : ''} ${f.external ? 'external' : ''}`} aria-current={i === frameIndex ? 'true' : undefined} disabled={f.external && !f.file} onClick={() => { selectFrame(i); if (f.file) onOpen(f.file, f.line); }}>
                    <span className="dbg-frame-mark">{i === 0 ? '➜' : i === frameIndex ? '▸' : ''}</span>
                    <span className="dbg-frame-name">{f.name}</span>
                    {f.file && <span className="meta">{f.file}:{f.line}</span>}
                  </button>
                  </RowMenu>
                </li>
              )))}
            </ul>
          ) : <p className="subtle debug-empty">The call stack appears when the debugger is paused.</p>}
        </Tabs.Content>
        <Tabs.Content value="breakpoints" className="debug-body">
          <div className="dbg-list-tools">
            {featureOn('function-breakpoints') && <button className="link-button" onClick={() => { const n = window.prompt('Function name (e.g. Calculator.Add or Add):', '')?.trim(); if (!n) return; if (!/^[\w.`<>,]{1,200}$/.test(n)) { onNotice('A function name has letters, digits, dots and underscores.'); return; } if (!fnBps.includes(n)) setFnBps([...fnBps, n]); }}>New Function Breakpoint…</button>}
            <IconButton label="Delete all breakpoints" disabled={!bpList.length} onClick={clearBreakpoints}><Trash2 size={13} /></IconButton>
            <IconButton label="Disable all breakpoints" disabled={!bpList.some((b) => b.enabled !== false)} onClick={() => enableAllBreakpoints(false)}><CircleOff size={13} /></IconButton>
            {featureOn('bp-search') && <input className="dbg-bp-search" type="search" aria-label="Search breakpoints" placeholder="Search" value={bpQuery} onChange={(e) => setBpQuery(e.target.value)} />}
            <IconButton label="Enable all breakpoints" disabled={!bpList.some((b) => b.enabled === false)} onClick={() => enableAllBreakpoints(true)}><CircleDot size={13} /></IconButton>
          </div>
          {featureOn('function-breakpoints') && fnBps.length > 0 && <ul className="dbg-list" aria-label="Function breakpoints">{fnBps.map((n) => <li key={n} className="dbg-bp"><div className="dbg-bp-row"><CircleDot size={12} className="bp-dot" aria-hidden="true" /><span className="dbg-frame-name">{n}()</span><span className="bp-detail">function</span><IconButton label={`Delete function breakpoint ${n}`} onClick={() => setFnBps(fnBps.filter((x) => x !== n))}><X size={12} /></IconButton></div></li>)}</ul>}
          {bpList.length ? (
            <ul className="dbg-list" aria-label="Breakpoints">
              {shownBps.map((b) => {
                const key = `${b.file}:${b.line}`;
                const detail = [b.dependsOn && `after ${b.dependsOn.split('/').pop()} is hit`, b.condition?.trim() && (b.whenChanged ? `when ${b.condition.trim()} changes` : `when ${b.condition.trim()}`), b.hitCondition?.trim() && `hit count ${b.hitCondition.trim()}`, b.logMessage?.trim() && `log "${b.logMessage.trim()}"`].filter(Boolean).join(' · ');
                return (
                  <li key={key} className={`dbg-bp ${b.enabled === false ? 'disabled' : ''}`}>
                    <div className="dbg-bp-row">
                      <input type="checkbox" aria-label={`Enable breakpoint ${key}`} checked={b.enabled !== false} onChange={(e) => updateBreakpoint(b.file, b.line, { enabled: e.target.checked })} />
                      <CircleDot size={12} className={`bp-dot ${b.verified === false && live ? 'pending' : ''} ${b.logMessage?.trim() ? 'tracepoint' : ''}`} aria-hidden="true" />
                      <button className="dbg-frame" onClick={() => onOpen(b.file, b.line)}><span className="dbg-frame-name">{b.file.split('/').pop()}, line {b.line}</span>{detail && <span className="bp-detail">{detail}</span>}<span className="meta">{b.file}</span></button>
                      {featureOn('bp-labels') && b.labels?.length ? <span className="bp-labels">{b.labels.map((l) => <span key={l} className="bp-label">{l}</span>)}</span> : null}
                      {featureOn('bp-hit-counts') && state.hits?.[key] ? <span className="bp-hits" title="Times hit in this session">hit {state.hits[key]}×</span> : null}
                      <IconButton label={`Breakpoint settings ${key}`} onClick={() => setEditing(editing === key ? null : key)}><Settings2 size={12} /></IconButton>
                      <IconButton label={`Delete breakpoint ${key}`} onClick={() => setBreakpoints(b.file, breakpointsOf(b.file).filter((l) => l !== b.line))}><X size={12} /></IconButton>
                    </div>
                    {editing === key && (
                      <form className="bp-settings" aria-label={`Breakpoint settings for ${key}`} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); updateBreakpoint(b.file, b.line, { condition: String(f.get('condition') ?? ''), hitCondition: String(f.get('hit') ?? ''), logMessage: String(f.get('log') ?? ''), ...(featureOn('bp-when-changed') ? { whenChanged: f.get('mode') === 'changed' } : {}), ...(featureOn('bp-dependent') ? (() => { const d = String(f.get('dependsOn') ?? ''); return { dependsOn: d || undefined, ...(d ? { enabled: false } : {}) }; })() : {}), ...(featureOn('bp-disable-once') ? { disableOnceHit: f.get('disableOnce') === 'on' } : {}), ...(featureOn('bp-labels') ? { labels: String(f.get('labels') ?? '').split(',').map((s) => s.trim()).filter(Boolean) } : {}) }); setEditing(null); }}>
                        {featureOn('bp-when-changed') && <label>Condition is <select name="mode" aria-label="Condition mode" defaultValue={b.whenChanged ? 'changed' : 'true'}><option value="true">true</option><option value="changed">when changed</option></select></label>}
                        <label>Condition <input name="condition" defaultValue={b.condition ?? ''} placeholder="C# expression, e.g. number > 50" autoFocus /></label>
                        <label>Hit count <input name="hit" defaultValue={b.hitCondition ?? ''} placeholder="5, >= 5 or % 5" /></label>
                        <label>Log message <input name="log" defaultValue={b.logMessage ?? ''} placeholder="Value is {number} (continues without breaking)" /></label>
                        {featureOn('bp-labels') && <label>Labels <input name="labels" defaultValue={(b.labels ?? []).join(', ')} placeholder="login, slow (comma separated)" /></label>}
                        {featureOn('bp-disable-once') && <label className="bp-check"><input type="checkbox" name="disableOnce" defaultChecked={!!b.disableOnceHit} /> Disable breakpoint once hit</label>}
                        {featureOn('bp-dependent') && <label>Only enable after <select name="dependsOn" aria-label="Only enable after breakpoint" defaultValue={b.dependsOn ?? ''}><option value="">(always enabled)</option>{bpList.filter((o) => `${o.file}:${o.line}` !== key).map((o) => <option key={`${o.file}:${o.line}`} value={`${o.file}:${o.line}`}>{o.file.split('/').pop()}, line {o.line}</option>)}</select></label>}
                        <div><button className="button primary" type="submit">Close</button></div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <p className="subtle debug-empty">Click the margin left of a line number, or press F9, to set a breakpoint in a .feature or .cs file.</p>}
        </Tabs.Content>
        <Tabs.Content value="output" className="debug-body">
          <pre className="debug-output" aria-label="Debug output">{state.output || 'No output yet.'}</pre>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
