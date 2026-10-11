import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { ChevronRight, ChevronDown, Play, Pause, Square, RotateCw, ArrowDownToLine, ArrowUpFromLine, Redo2, X, CircleDot, Trash2, Bug, Loader, CircleOff, Settings2 } from 'lucide-react';
import { IconButton } from '../radix2';
import { api } from '../api';
import { useDebug, debugControl, selectFrame, setWatches, setBreakpoints, clearBreakpoints, startDebugging, isLive, breakpointsOf, updateBreakpoint, enableAllBreakpoints, type Variable, type DebugFrame } from './store';
import { useLocalState } from '../ui';
import { readFile } from '../files/provider';

const CS_KEYWORDS = new Set('var new return if else for foreach while do in is as await async public private protected internal static readonly void int string bool double decimal long float char object true false null this base typeof sizeof nameof using namespace class struct interface enum get set value throw try catch finally switch case default break continue out ref params let'.split(' '));

const statusText: Record<string, string> = { idle: 'Not debugging', building: 'Building…', starting: 'Starting test host…', running: 'Running', paused: 'Paused', ended: 'Ended' };

/** One expandable row of the Locals / Watch trees (children load on demand, like Visual Studio). */
function VariableRow({ v, depth, frameKey }: { v: { name: string; value: string; type?: string; variablesReference: number }; depth: number; frameKey: string }) {
  const [open, setOpen] = useState(false);
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
      <div className="dbg-row" role="row" aria-expanded={expandable ? open : undefined}>
        <span role="gridcell" className="dbg-name" style={{ paddingLeft: depth * 14 }}>
          {expandable ? <button className="se-twisty" aria-label={`${open ? 'Collapse' : 'Expand'} ${v.name}`} onClick={toggle}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="se-twisty-space" />}
          {v.name}
        </span>
        <span role="gridcell" className="dbg-value" title={v.value}>{v.value}</span>
        <span role="gridcell" className="dbg-type">{v.type ?? ''}</span>
      </div>
      {open && children?.map((c) => <VariableRow key={c.name} v={c} depth={depth + 1} frameKey={frameKey} />)}
    </>
  );
}
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
  const [values, setValues] = useState<{ result?: string; type?: string; error?: string; variablesReference?: number }[]>([]);
  const [draft, setDraft] = useState('');
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
      const all = (await Promise.all(scopes.map((s) => api<Variable[]>('/debug/variables', { ref: s.variablesReference }).catch(() => [])))).flat();
      if (live) setLocals(all);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);
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
  const bpList = Object.entries(breakpoints).flatMap(([file, specs]) => specs.map((b) => ({ ...b, file, verified: state.breakpoints[file]?.find((x) => x.line === b.line)?.verified })));
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
        <span className="toolbar-spacer" />
        {state.target && <span className="meta debug-target" title={state.target.filter}>{state.target.label}</span>}
        <IconButton label="Close debug windows" onClick={onClose}><X size={14} /></IconButton>
      </div>
      {state.error && <p className="field-error debug-error" role="alert">{state.error.slice(0, 600)}</p>}
      {state.exception && <p className="field-error debug-error" role="alert">Exception thrown: {state.exception}</p>}
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
          {frame ? <Grid label="Locals">{locals.map((v) => <VariableRow key={v.name} v={v} depth={0} frameKey={frameKey} />)}</Grid> : <p className="subtle debug-empty">Locals appear when the debugger is paused.</p>}
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
                  <button className={`dbg-frame ${i === frameIndex ? 'current' : ''} ${f.external ? 'external' : ''}`} aria-current={i === frameIndex ? 'true' : undefined} disabled={f.external && !f.file} onClick={() => { selectFrame(i); if (f.file) onOpen(f.file, f.line); }}>
                    <span className="dbg-frame-mark">{i === 0 ? '➜' : i === frameIndex ? '▸' : ''}</span>
                    <span className="dbg-frame-name">{f.name}</span>
                    {f.file && <span className="meta">{f.file}:{f.line}</span>}
                  </button>
                </li>
              )))}
            </ul>
          ) : <p className="subtle debug-empty">The call stack appears when the debugger is paused.</p>}
        </Tabs.Content>
        <Tabs.Content value="breakpoints" className="debug-body">
          <div className="dbg-list-tools">
            <IconButton label="Delete all breakpoints" disabled={!bpList.length} onClick={clearBreakpoints}><Trash2 size={13} /></IconButton>
            <IconButton label="Disable all breakpoints" disabled={!bpList.some((b) => b.enabled !== false)} onClick={() => enableAllBreakpoints(false)}><CircleOff size={13} /></IconButton>
            <IconButton label="Enable all breakpoints" disabled={!bpList.some((b) => b.enabled === false)} onClick={() => enableAllBreakpoints(true)}><CircleDot size={13} /></IconButton>
          </div>
          {bpList.length ? (
            <ul className="dbg-list" aria-label="Breakpoints">
              {bpList.map((b) => {
                const key = `${b.file}:${b.line}`;
                const detail = [b.condition?.trim() && `when ${b.condition.trim()}`, b.hitCondition?.trim() && `hit count ${b.hitCondition.trim()}`, b.logMessage?.trim() && `log "${b.logMessage.trim()}"`].filter(Boolean).join(' · ');
                return (
                  <li key={key} className={`dbg-bp ${b.enabled === false ? 'disabled' : ''}`}>
                    <div className="dbg-bp-row">
                      <input type="checkbox" aria-label={`Enable breakpoint ${key}`} checked={b.enabled !== false} onChange={(e) => updateBreakpoint(b.file, b.line, { enabled: e.target.checked })} />
                      <CircleDot size={12} className={`bp-dot ${b.verified === false && live ? 'pending' : ''} ${b.logMessage?.trim() ? 'tracepoint' : ''}`} aria-hidden="true" />
                      <button className="dbg-frame" onClick={() => onOpen(b.file, b.line)}><span className="dbg-frame-name">{b.file.split('/').pop()}, line {b.line}</span>{detail && <span className="bp-detail">{detail}</span>}<span className="meta">{b.file}</span></button>
                      <IconButton label={`Breakpoint settings ${key}`} onClick={() => setEditing(editing === key ? null : key)}><Settings2 size={12} /></IconButton>
                      <IconButton label={`Delete breakpoint ${key}`} onClick={() => setBreakpoints(b.file, breakpointsOf(b.file).filter((l) => l !== b.line))}><X size={12} /></IconButton>
                    </div>
                    {editing === key && (
                      <form className="bp-settings" aria-label={`Breakpoint settings for ${key}`} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); updateBreakpoint(b.file, b.line, { condition: String(f.get('condition') ?? ''), hitCondition: String(f.get('hit') ?? ''), logMessage: String(f.get('log') ?? '') }); setEditing(null); }}>
                        <label>Condition <input name="condition" defaultValue={b.condition ?? ''} placeholder="C# expression, e.g. number > 50" autoFocus /></label>
                        <label>Hit count <input name="hit" defaultValue={b.hitCondition ?? ''} placeholder="5, >= 5 or % 5" /></label>
                        <label>Log message <input name="log" defaultValue={b.logMessage ?? ''} placeholder="Value is {number} (continues without breaking)" /></label>
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
