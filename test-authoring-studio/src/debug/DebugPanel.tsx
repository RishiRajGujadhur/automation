import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { ChevronRight, ChevronDown, Play, Pause, Square, RotateCw, ArrowDownToLine, ArrowUpFromLine, Redo2, X, CircleDot, Trash2, Bug, Loader } from 'lucide-react';
import { IconButton } from '../radix2';
import { api } from '../api';
import { useDebug, debugControl, selectFrame, setWatches, setBreakpoints, clearBreakpoints, startDebugging, isLive, type Variable, type DebugFrame } from './store';
import { useLocalState } from '../ui';

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
export default function DebugPanel({ onOpen, onNotice, onClose }: { onOpen: (file: string, line: number) => void; onNotice: (m: string) => void; onClose: () => void }) {
  const { state, watches, frameIndex, breakpoints } = useDebug();
  const [tab, setTab] = useLocalState('debugTab', 'locals');
  const frame: DebugFrame | undefined = state.status === 'paused' ? state.frames[frameIndex] : undefined;
  const frameKey = `${state.version}:${frame?.id ?? ''}`;
  const [locals, setLocals] = useState<Variable[]>([]);
  const [values, setValues] = useState<{ result?: string; type?: string; error?: string; variablesReference?: number }[]>([]);
  const [draft, setDraft] = useState('');

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
  const bpList = Object.entries(breakpoints).flatMap(([file, lines]) => lines.map((line) => ({ file, line, verified: state.breakpoints[file]?.find((b) => b.line === line)?.verified })));
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
          <Tabs.Trigger value="locals">Locals</Tabs.Trigger>
          <Tabs.Trigger value="watch">Watch 1</Tabs.Trigger>
          <Tabs.Trigger value="stack">Call Stack</Tabs.Trigger>
          <Tabs.Trigger value="breakpoints">Breakpoints{bpList.length ? ` (${bpList.length})` : ''}</Tabs.Trigger>
          <Tabs.Trigger value="output">Output</Tabs.Trigger>
        </Tabs.List>
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
          </div>
          {bpList.length ? (
            <ul className="dbg-list" aria-label="Breakpoints">
              {bpList.map((b) => (
                <li key={`${b.file}:${b.line}`} className="dbg-bp">
                  <CircleDot size={12} className={`bp-dot ${b.verified === false && live ? 'pending' : ''}`} aria-hidden="true" />
                  <button className="dbg-frame" onClick={() => onOpen(b.file, b.line)}><span className="dbg-frame-name">{b.file.split('/').pop()}, line {b.line}</span><span className="meta">{b.file}</span></button>
                  <IconButton label={`Delete breakpoint ${b.file}:${b.line}`} onClick={() => setBreakpoints(b.file, breakpoints[b.file].filter((l) => l !== b.line))}><X size={12} /></IconButton>
                </li>
              ))}
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
