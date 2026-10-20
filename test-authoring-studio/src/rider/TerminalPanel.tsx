import { useEffect, useRef, useState } from 'react';
import { Plus, X, SquareTerminal, Eraser } from 'lucide-react';
import { featureOn } from '../features';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api';

/** Run a command in the Terminal tool window (Run Anything): detail is the command line. */
export const TERMINAL_RUN_EVENT = 'tas:terminal-run';
export const runInTerminal = (command: string) => window.dispatchEvent(new CustomEvent(TERMINAL_RUN_EVENT, { detail: command }));
// A command asked for before the window existed (it opens the window, then runs it).
let queued: string | null = null;
export const queueTerminalCommand = (command: string) => { queued = command; };
// Clears the active terminal (its toolbar button) (QOL-50).
const TERMINAL_CLEAR_EVENT = 'tas:terminal-clear';

type Tab = { key: number; title: string; named?: boolean };
type TermEvent = { kind: 'output'; text: string } | { kind: 'done'; cwd: string } | { kind: 'exit'; code: number | null };

const termFont = () => { try { return Number(localStorage.getItem('tas:terminalFont')) || 13; } catch { return 13; } };
const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** One shell: xterm.js with a line editor (history, cursor keys, paste); Ctrl+C stops the command, Ctrl+L clears. */
function Shell({ active, onTitle, onExit, takeCommand }: { active: boolean; onTitle: (t: string) => void; onExit: () => void; takeCommand: () => string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const runRef = useRef<(cmd: string) => void>(() => {});
  const fitRef = useRef<FitAddon | undefined>(undefined);
  const clearRef = useRef<() => void>(() => {});
  useEffect(() => {
    const term = new Terminal({ convertEol: true, cursorBlink: true, fontSize: featureOn('terminal-zoom') ? termFont() : 13, fontFamily: css('--font-mono', 'Consolas, monospace'), theme: { background: css('--panel', '#1e1e1e'), foreground: css('--text', '#ddd'), cursor: css('--accent', '#9270dd') }, scrollback: 5000 });
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(host.current!);
    requestAnimationFrame(() => { try { fit.fit(); } catch { /* hidden */ } });
    let id = '';
    let cwd = '';
    let line = '', pos = 0, busy = true;
    const history: string[] = [];
    let hIndex = 0;
    const prompt = () => `PS ${cwd}> `;
    const redraw = () => { term.write(`\r\x1b[K${prompt()}${line}`); const back = line.length - pos; if (back) term.write(`\x1b[${back}D`); };
    const submit = (cmd: string) => {
      busy = true;
      term.write('\r\n');
      if (cmd.trim()) { history.push(cmd); hIndex = history.length; }
      if (cmd.trim().toLowerCase() === 'cls' || cmd.trim().toLowerCase() === 'clear') { term.clear(); }
      api('/terminal/input', { id, line: cmd }).catch((e) => { term.write(`\r\n${(e as Error).message}\r\n`); busy = false; redraw(); });
    };
    runRef.current = (cmd: string) => { if (busy) { term.write(`\r\n(busy: ${cmd} was not run)\r\n`); return; } line = cmd; pos = cmd.length; redraw(); line = ''; pos = 0; submit(cmd); };
    let source: EventSource | undefined;
    let live = true;
    api<{ id: string; cwd: string; shell: string }>('/terminal/start', {}).then((s) => {
      if (!live) { void api('/terminal/stop', { id: s.id }); return; }
      id = s.id; cwd = s.cwd;
      onTitle(s.shell);
      source = new EventSource(`/api/terminal/events?id=${encodeURIComponent(id)}`);
      source.onmessage = (m) => {
        const e = JSON.parse(m.data) as TermEvent;
        if (e.kind === 'output') term.write(e.text);
        else if (e.kind === 'done') {
          cwd = e.cwd; busy = false; redraw();
          const next = takeCommand();
          if (next) runRef.current(next);
        } else if (e.kind === 'exit') { term.write(`\r\n[process exited with code ${e.code}]\r\n`); onExit(); }
      };
    }, (e) => term.write(`${(e as Error).message}\r\n`));
    term.onData((data) => {
      if (data === '\x03') { if (busy) void api('/terminal/interrupt', { id }); else { term.write('^C\r\n'); line = ''; pos = 0; redraw(); } return; }
      if (busy) return;
      if (data === '\r') { const cmd = line; line = ''; pos = 0; submit(cmd); return; }
      if (data === '\x7f') { if (pos > 0) { line = line.slice(0, pos - 1) + line.slice(pos); pos--; redraw(); } return; }
      if (data === '\x1b[3~') { line = line.slice(0, pos) + line.slice(pos + 1); redraw(); return; }
      if (data === '\x1b[D') { if (pos > 0) { pos--; term.write(data); } return; }
      if (data === '\x1b[C') { if (pos < line.length) { pos++; term.write(data); } return; }
      if (data === '\x1b[H' || data === '\x01') { pos = 0; redraw(); return; }
      if (data === '\x1b[F' || data === '\x05') { pos = line.length; redraw(); return; }
      if (data === '\x1b[A') { if (hIndex > 0) { hIndex--; line = history[hIndex]; pos = line.length; redraw(); } return; }
      if (data === '\x1b[B') { if (hIndex < history.length) { hIndex++; line = history[hIndex] ?? ''; pos = line.length; redraw(); } return; }
      if (data === '\x0c') { term.clear(); redraw(); return; }
      if (data.startsWith('\x1b')) return;
      // Typing or a paste: a pasted newline runs the line.
      const parts = data.replace(/\r\n/g, '\r').split('\r');
      line = line.slice(0, pos) + parts[0] + line.slice(pos); pos += parts[0].length; redraw();
      if (parts.length > 1) { const cmd = line; line = ''; pos = 0; submit(cmd); }
    });
    // Right-click copies the selection, or pastes (Windows Terminal) (QOL-50).
    const rightClick = (e: MouseEvent) => {
      if (!featureOn('terminal-right-click')) return;
      e.preventDefault();
      if (term.hasSelection()) { void navigator.clipboard.writeText(term.getSelection()).catch(() => {}); term.clearSelection(); }
      else void navigator.clipboard.readText().then((t) => { if (t) term.paste(t); }, () => {});
    };
    host.current!.addEventListener('contextmenu', rightClick);
    clearRef.current = () => { term.clear(); redraw(); term.focus(); };
    // Ctrl+wheel changes the font size of every terminal (kept) (QOL-50).
    const zoom = (e: WheelEvent) => {
      if (!e.ctrlKey || !featureOn('terminal-zoom')) return;
      e.preventDefault();
      const size = Math.min(32, Math.max(8, termFont() + (e.deltaY < 0 ? 1 : -1)));
      try { localStorage.setItem('tas:terminalFont', String(size)); } catch { /* storage blocked */ }
      window.dispatchEvent(new Event('tas:terminal-font'));
    };
    const applyFont = () => { term.options.fontSize = termFont(); try { fit.fit(); } catch { /* hidden */ } };
    const wheelHost = host.current!;
    wheelHost.addEventListener('wheel', zoom, { passive: false });
    window.addEventListener('tas:terminal-font', applyFont);
    const resize = new ResizeObserver(() => { try { fit.fit(); } catch { /* hidden */ } });
    resize.observe(host.current!);
    return () => { live = false; window.removeEventListener('tas:terminal-font', applyFont); wheelHost.removeEventListener('wheel', zoom); wheelHost.removeEventListener('contextmenu', rightClick); resize.disconnect(); source?.close(); if (id) void api('/terminal/stop', { id }); term.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) requestAnimationFrame(() => { try { fitRef.current?.fit(); } catch { /* hidden */ } }); }, [active]);
  useEffect(() => {
    if (!active) return;
    const h = (e: Event) => runRef.current((e as CustomEvent<string>).detail);
    const c = () => clearRef.current();
    window.addEventListener(TERMINAL_RUN_EVENT, h);
    window.addEventListener(TERMINAL_CLEAR_EVENT, c);
    return () => { window.removeEventListener(TERMINAL_RUN_EVENT, h); window.removeEventListener(TERMINAL_CLEAR_EVENT, c); };
  }, [active]);
  return <div className="terminal-host" ref={host} hidden={!active} aria-label="Terminal output" />;
}

/** Terminal tool window (Rider, Alt+F12): shells in the repository folder, in tabs. */
export default function TerminalPanel({ onClose }: { onClose: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([{ key: 1, title: 'Local' }]);
  const [active, setActive] = useState(1);
  const next = useRef(2);
  const add = () => { const key = next.current++; setTabs((t) => [...t, { key, title: 'Local' }]); setActive(key); };
  const close = (key: number) => setTabs((t) => { const rest = t.filter((x) => x.key !== key); if (!rest.length) onClose(); if (active === key && rest.length) setActive(rest.at(-1)!.key); return rest; });
  const take = () => { const q = queued; queued = null; return q; };
  return (
    <section className="debug-panel terminal-panel" aria-label="Terminal">
      <div className="debug-toolbar" role="toolbar" aria-label="Terminal">
        <div className="terminal-tabs" role="tablist" aria-label="Terminals">
          {tabs.map((t, i) => (
            <span key={t.key} className={`terminal-tab ${t.key === active ? 'on' : ''}`}>
              <button role="tab" aria-selected={t.key === active} onClick={() => setActive(t.key)} title={featureOn('terminal-rename') ? 'Double-click to rename' : undefined} onDoubleClick={() => { if (!featureOn('terminal-rename')) return; const name = window.prompt('Rename terminal', t.title)?.trim(); if (name !== undefined) setTabs((l) => l.map((x) => (x.key === t.key ? { ...x, title: name || 'Local', named: !!name } : x))); }}><SquareTerminal size={12} /> {t.title}{tabs.length > 1 ? ` ${i + 1}` : ''}</button>
              <button className="icon-button" aria-label={`Close terminal ${i + 1}`} onClick={() => close(t.key)}><X size={11} /></button>
            </span>
          ))}
        </div>
        <button className="icon-button" aria-label="New terminal" title="New terminal" onClick={add}><Plus size={14} /></button>
        {featureOn('terminal-clear') && <button className="icon-button" aria-label="Clear terminal" title="Clear (Ctrl+L)" onClick={() => window.dispatchEvent(new Event(TERMINAL_CLEAR_EVENT))}><Eraser size={14} /></button>}
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Terminal" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      {tabs.map((t) => (
        <Shell key={t.key} active={t.key === active} takeCommand={take} onTitle={(title) => setTabs((l) => l.map((x) => (x.key === t.key && !x.named ? { ...x, title } : x)))} onExit={() => {}} />
      ))}
    </section>
  );
}
