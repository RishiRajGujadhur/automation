import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Play, Square, RefreshCw, ChevronDown, ChevronRight, Camera, Copy, Braces, Search, Plus, ScanSearch, Save, FileJson } from 'lucide-react';
import { api, type FilePreview } from './api';
import DiffApproval from './DiffApproval';
import { Button } from './radix';
import { copyText, useLocalState } from './ui';
import type { Index } from './types';

type Candidate = { type: string; value: string; count: number; status: 'unique' | 'multiple' | 'none' | 'error' | 'offline'; note?: string };
type El = {
  id: number; tag: string; role: string; name: string; text: string; testId: string; idAttr: string; classes: string[];
  attributes: { name: string; value: string }[]; visible: boolean; enabled: boolean; rect: { x: number; y: number; width: number; height: number };
  cssPath: string; xpath: string; path: { tag: string; role: string; name: string; id: number }[];
};
type Node = { id: number; tag: string; role: string; name: string; testId: string; idAttr: string; children: Node[] };
type Snapshot = { name: string; url: string; takenAt: string; title: string; tree: Node[]; details: Record<string, El>; screenshot?: string };
const ROLES = ['textbox', 'combobox', 'button', 'link', 'checkbox', 'radio', 'option', 'tab', 'menuitem', 'heading'];
/** Candidates for a snapshot element: same order as the live Spy, but not verified (no page to count on). */
const offlineCandidates = (d: El): Candidate[] => {
  const out: Candidate[] = [];
  const add = (type: string, value: string) => out.push({ type, value, count: 0, status: 'offline' });
  if (d.testId) add('testid', d.testId);
  if (d.role && d.name && ROLES.includes(d.role)) add(`ariarole.${d.role}`, d.name);
  const text = d.text || d.name;
  if (text && text.length <= 60 && !['input', 'textarea', 'select'].includes(d.tag)) add('text', text);
  if (d.cssPath) add('css', d.cssPath);
  if (d.xpath) add('xpath', d.xpath);
  return out;
};
type State = { status: 'idle' | 'running'; tracking: boolean; url: string | null; selected: { element: El; candidates: Candidate[] } | null; version: number };

const TYPES = ['testid', 'ariarole.textbox', 'ariarole.button', 'ariarole.link', 'ariarole.combobox', 'ariarole.checkbox', 'ariarole.radio', 'ariarole.option', 'ariarole.tab', 'ariarole.menuitem', 'ariarole.heading', 'text', 'css', 'xpath'];
const FIELD_TYPES: Record<string, string> = { textbox: 'TextBox', searchbox: 'TextBox', combobox: 'ComboBox', listbox: 'ListBox', button: 'Button', link: 'Link', checkbox: 'CheckBox', radio: 'RadioButton', heading: 'Label', img: 'Image', option: 'Option', tab: 'Tab', menuitem: 'MenuItem' };
const pascal = (s: string) => s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 6).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Field';
const csharp = (c: { type: string; value: string }) => {
  const v = JSON.stringify(c.value);
  const t = c.type.toLowerCase();
  if (t === 'testid') return `Page.GetByTestId(${v})`;
  if (t === 'text') return `Page.GetByText(${v}, new() { Exact = true })`;
  if (t === 'css') return `Page.Locator(${v})`;
  if (t === 'xpath') return `Page.Locator(${JSON.stringify('xpath=' + c.value)})`;
  const role = t.slice(9);
  return `Page.GetByRole(AriaRole.${role[0].toUpperCase()}${role.slice(1)}, new() { Name = ${v}, Exact = true })`;
};
const status = (c: Candidate) => (c.status === 'offline' ? 'not verified' : c.status === 'unique' ? 'unique' : c.status === 'multiple' ? `${c.count} matches` : c.status === 'none' ? 'no match' : 'error');

/**
 * Spy — GUI object recognition (after Ranorex Spy): open a page, Track (hover highlights, click selects), browse the
 * element tree, read the element's properties, and pick a verified selector to store in an XML dictionary.
 */
export default function SpyView({ onIndex, onNotice }: { onIndex: (i: Index) => void; onNotice: (m: string) => void }) {
  const [url, setUrl] = useLocalState('spyUrl', 'https://');
  const [state, setState] = useState<State>({ status: 'idle', tracking: false, url: null, selected: null, version: 0 });
  const [tree, setTree] = useState<Node[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState('');
  const [shot, setShot] = useState<string>();
  const [extra, setExtra] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [edit, setEdit] = useState({ type: 'css', value: '' });
  const [checked, setChecked] = useState<Candidate>();
  const [dict, setDict] = useState({ page: 'Page', section: 'Main', field: '', file: '' });
  const [files, setFiles] = useState<string[]>([]);
  const [preview, setPreview] = useState<FilePreview>();
  const version = useRef(-1);
  // Snapshot mode: browse a saved page offline (tree + properties); selectors are suggested but not verified.
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [offlineSel, setOfflineSel] = useState<{ element: El; candidates: Candidate[] } | null>(null);
  const [snapshots, setSnapshots] = useState<{ name: string }[]>([]);
  const loadSnapshots = () => api<{ name: string }[]>('/spy/snapshots').then(setSnapshots, () => {});
  useEffect(() => { void loadSnapshots(); }, []);
  const selected = snapshot ? offlineSel : state.selected;
  const el = selected?.element;
  const candidates = useMemo(() => [...(selected?.candidates ?? []), ...extra.filter((x) => !(selected?.candidates ?? []).some((c) => c.type === x.type && c.value === x.value))], [selected, extra]);
  const key = (c: { type: string; value: string }) => `${c.type}|${c.value}`;

  const run = async (label: string, fn: () => Promise<unknown>) => { setBusy(label); try { await fn(); } catch (e) { onNotice((e as Error).message); } finally { setBusy(''); } };
  // Small pages open fully; large ones show their first three levels (the selection's path always opens).
  const refreshTree = () => api<Node[]>('/spy/tree').then((t) => {
    setTree(t);
    const all = flat(t);
    const depthOf = (n: Node[], d: number): [number, number][] => n.flatMap((x) => [[x.id, d] as [number, number], ...depthOf(x.children, d + 1)]);
    setOpen((o) => new Set([...o, ...(all.length <= 400 ? all.map((n) => n.id) : depthOf(t, 0).filter(([, d]) => d < 3).map(([id]) => id))]));
  }, () => {});
  useEffect(() => { api<State>('/spy').then(setState, () => {}); api<string[]>('/dictionary/files').then((f) => { setFiles(f); setDict((d) => ({ ...d, file: f[0] ?? 'Dictionaries/Page.xml' })); }, () => {}); }, []);
  // Poll while the Spy browser is open: a click in the page (Track) selects an element there.
  useEffect(() => {
    if (state.status !== 'running') return;
    const t = setInterval(() => { api<State>('/spy').then(setState, () => {}); }, 600);
    return () => clearInterval(t);
  }, [state.status]);
  // A new selection: reveal it in the tree, default the dictionary field, preselect the best unique selector.
  useEffect(() => {
    if (snapshot || state.version === version.current) return;
    version.current = state.version;
    revealSelection();
  }, [state.version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (snapshot) revealSelection(); }, [offlineSel]); // eslint-disable-line react-hooks/exhaustive-deps
  function revealSelection() {
    if (!el) return;
    setOpen((o) => new Set([...o, ...el.path.map((p) => p.id)]));
    if (!snapshot && !flat(tree).some((n) => n.id === el.id)) void refreshTree();
    setExtra([]); setShot(undefined); setChecked(undefined); setPreview(undefined);
    const best = selected!.candidates.find((c) => c.status === 'unique');
    setChosen(best ? [key(best)] : []);
    setDict((d) => ({ ...d, field: pascal(el.name || el.testId || el.idAttr || el.tag) }));
    requestAnimationFrame(() => document.querySelector(`[data-spy-node="${el.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

  const start = () => run('start', async () => { setState(await api<State>('/spy/start', { url: url.trim() })); setTree([]); await refreshTree(); });
  const stop = () => run('stop', async () => setState(await api<State>('/spy/stop', {})));
  const track = (on: boolean) => run('track', async () => setState(await api<State>('/spy/track', { on })));
  const saveSnapshot = () => run('snapshot', async () => { const r = await api<{ name: string; elements: number }>('/spy/snapshot', {}); onNotice(`Snapshot saved: ${r.name} (${r.elements} elements).`); await loadSnapshots(); });
  const openSnapshot = (name: string) => run('open', async () => {
    const s = await api<Omit<Snapshot, 'name'>>(`/spy/snapshots/${encodeURIComponent(name)}`);
    setSnapshot({ ...s, name }); setTree(s.tree); setOfflineSel(null); setOpen(new Set(flat(s.tree).length <= 400 ? flat(s.tree).map((n) => n.id) : []));
  });
  const closeSnapshot = () => { setSnapshot(undefined); setOfflineSel(null); setTree([]); if (state.status === 'running') void refreshTree(); };
  const pick = (id: number) => (snapshot ? setOfflineSel(snapshot.details[id] ? { element: snapshot.details[id], candidates: offlineCandidates(snapshot.details[id]) } : null) : pickLive(id));
  const pickLive = (id: number) => run('select', async () => { const s = await api<State['selected']>('/spy/select', { id }); setState((p) => ({ ...p, selected: s, version: p.version + 1 })); });
  const check = () => run('verify', async () => setChecked(await api<Candidate>('/spy/verify', edit)));
  const highlight = (c: Candidate) => run('verify', async () => { await api('/spy/verify', { type: c.type, value: c.value }); });
  const toDictionary = () => run('dict', async () => {
    const selectors = candidates.filter((c) => chosen.includes(key(c))).map(({ type, value }) => ({ type, value }));
    setPreview(await api<FilePreview>('/dictionary/preview', { file: dict.file.trim(), proposals: [{ page: dict.page.trim(), section: dict.section.trim(), field: dict.field.trim(), fieldType: FIELD_TYPES[el?.role ?? ''] ?? 'Element', selectors }] }));
  });

  const toggle = (id: number) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nodeRow = (n: Node, depth: number): React.ReactNode => {
    const isOpen = open.has(n.id) || depth === 0;
    return (
      <li key={n.id}>
        <div className={`spy-node ${el?.id === n.id ? 'selected' : ''}`} style={{ paddingLeft: depth * 12 }} data-spy-node={n.id}>
          {n.children.length ? <button className="se-twisty" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${n.tag}`} onClick={() => toggle(n.id)}>{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : <span className="se-twisty-space" />}
          <button className="spy-node-label" onClick={() => pick(n.id)} title={`${n.tag}${n.idAttr ? `#${n.idAttr}` : ''}`}>
            <span className="spy-role">{n.role || n.tag}</span>
            {n.name && <span className="spy-name">{n.name}</span>}
            {n.testId && <small className="spy-badge">testid={n.testId}</small>}
            {n.idAttr && <small>#{n.idAttr}</small>}
          </button>
        </div>
        {isOpen && n.children.length > 0 && <ul>{n.children.map((c) => nodeRow(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <section className="spy-view" aria-label="Spy">
      <form className="spy-bar" onSubmit={(e) => { e.preventDefault(); void start(); }}>
        <ScanSearch size={16} aria-hidden="true" />
        <input aria-label="Page URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app/login" spellCheck={false} />
        <Button type="submit" variant="primary" disabled={!!busy || !/^https?:\/\/.+/.test(url.trim())}><Play size={14} /> {state.status === 'running' ? 'Open' : 'Start Spy'}</Button>
        {state.status === 'running' && (
          <>
            <Button variant={state.tracking ? 'primary' : 'ghost'} aria-pressed={state.tracking} onClick={() => void track(!state.tracking)} title="Track: hover highlights an element in the Spy browser, click selects it"><Crosshair size={14} /> Track</Button>
            <Button variant="ghost" onClick={() => void refreshTree()} title="Refresh the element tree"><RefreshCw size={14} /></Button>
            <Button variant="ghost" onClick={() => void saveSnapshot()} title="Save the element tree, properties and a screenshot to browse offline"><Save size={14} /> Snapshot</Button>
            <Button variant="ghost" onClick={() => void stop()}><Square size={13} /> Stop</Button>
          </>
        )}
        <span className="spy-url" title={state.url ?? ''}>{state.status === 'running' ? state.url : 'Not running'}</span>
        {snapshots.length > 0 && (
          <select className="spy-snapshots" aria-label="Open snapshot" value="" onChange={(e) => { if (e.target.value) void openSnapshot(e.target.value); }}>
            <option value="">Snapshots ({snapshots.length})…</option>
            {snapshots.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
        )}
      </form>
      {snapshot && (
        <div className="spy-offline" role="status">
          <FileJson size={14} /> Snapshot of <strong>{snapshot.title || snapshot.url}</strong> · {new Date(snapshot.takenAt).toLocaleString()} · {Object.keys(snapshot.details).length} elements — selectors are not verified offline.
          <a href={`/api/spy/snapshots/${encodeURIComponent(snapshot.name)}?download=1`} download>Download</a>
          <button className="text-button" onClick={closeSnapshot}>Close snapshot</button>
        </div>
      )}
      <div className="spy-grid">
        <section className="spy-pane" aria-label="Element browser">
          <h3 className="micro-label">ELEMENT BROWSER</h3>
          {tree.length ? <ul className="spy-tree">{tree.map((n) => nodeRow(n, 0))}</ul> : <p className="subtle">{state.status === 'running' ? 'Loading…' : 'Start Spy on a page, then click Track and pick an element in the Spy browser — or select one here.'}</p>}
        </section>
        <section className="spy-pane" aria-label="Element properties">
          <h3 className="micro-label">PROPERTIES</h3>
          {el ? (
            <>
              <nav className="spy-path" aria-label="Element path">{el.path.map((p, i) => <button key={p.id} onClick={() => pick(p.id)} aria-current={i === el.path.length - 1 ? 'true' : undefined}>{p.role || p.tag}</button>)}</nav>
              <dl className="spy-props">
                {([['Tag', el.tag], ['Role', el.role || '—'], ['Accessible name', el.name || '—'], ['Test id', el.testId || '—'], ['Id', el.idAttr || '—'], ['Classes', el.classes.join(' ') || '—'], ['Text', el.text || '—'], ['Visible', el.visible ? 'yes' : 'no'], ['Enabled', el.enabled ? 'yes' : 'no'], ['Bounds', `${el.rect.x}, ${el.rect.y} · ${el.rect.width} × ${el.rect.height}`], ['CSS path', el.cssPath], ['XPath', el.xpath]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd title={v}>{v}</dd></div>)}
              </dl>
              <details className="spy-attrs"><summary>Attributes ({el.attributes.length})</summary><dl className="spy-props">{el.attributes.map((a) => <div key={a.name}><dt>{a.name}</dt><dd>{a.value}</dd></div>)}</dl></details>
              {snapshot?.screenshot && <details className="spy-attrs"><summary>Page screenshot</summary><img className="spy-shot" alt={`Snapshot of ${snapshot.title}`} src={`data:image/jpeg;base64,${snapshot.screenshot}`} /></details>}
              <Button variant="ghost" size="small" disabled={!!snapshot} onClick={() => void run('shot', async () => setShot((await api<{ png: string }>('/spy/screenshot', { id: el.id })).png))}><Camera size={14} /> Screenshot</Button>
              {shot && <img className="spy-shot" alt={`Screenshot of ${el.role || el.tag} ${el.name}`} src={`data:image/png;base64,${shot}`} />}
            </>
          ) : <p className="subtle">No element selected.</p>}
        </section>
        <section className="spy-pane" aria-label="Selectors">
          <h3 className="micro-label">SELECTORS</h3>
          {el ? (
            <>
              <ul className="spy-candidates" aria-label="Selector candidates">
                {candidates.map((c) => (
                  <li key={key(c)} className={c.status}>
                    <label><input type="checkbox" checked={chosen.includes(key(c))} onChange={(e) => setChosen(e.target.checked ? [...chosen, key(c)] : chosen.filter((k) => k !== key(c)))} aria-label={`Use ${c.type} ${c.value}`} /><code className="spy-type">{c.type}</code><span className="spy-value" title={c.value}>{c.value}</span></label>
                    <small className={`spy-status ${c.status}`}>{status(c)}</small>
                    <button className="icon-button" disabled={!!snapshot} aria-label={`Highlight ${c.type} ${c.value}`} title="Highlight the matches in the page" onClick={() => void highlight(c)}><Search size={13} /></button>
                    <button className="icon-button" aria-label={`Copy ${c.type} as Playwright C#`} title="Copy as Playwright C#" onClick={() => void copyText(csharp(c)).then((ok) => onNotice(ok ? 'Copied.' : 'Clipboard unavailable.'))}><Copy size={13} /></button>
                  </li>
                ))}
              </ul>
              <form className="spy-editor" onSubmit={(e) => { e.preventDefault(); void check(); }} aria-label="Selector editor">
                <select aria-label="Selector type" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                <input aria-label="Selector value" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} placeholder="value" spellCheck={false} />
                <Button type="submit" size="small" disabled={!edit.value.trim() || !!snapshot}>Check</Button>
                {checked && <small className={`spy-status ${checked.status}`} role="status">{status(checked)}{checked.note ? `: ${checked.note}` : ''}</small>}
                {checked && checked.status !== 'error' && <button type="button" className="icon-button" aria-label="Add to candidates" title="Add to the candidates" onClick={() => { setExtra([...extra, checked]); setChosen([...chosen, key(checked)]); }}><Plus size={13} /></button>}
              </form>
              <fieldset className="spy-dict">
                <legend><Braces size={13} /> Add to dictionary</legend>
                <div className="form-grid">
                  <label className="field">PAGE<input aria-label="Dictionary page" value={dict.page} onChange={(e) => setDict({ ...dict, page: e.target.value })} /></label>
                  <label className="field">SECTION<input aria-label="Dictionary section" value={dict.section} onChange={(e) => setDict({ ...dict, section: e.target.value })} /></label>
                  <label className="field">FIELD<input aria-label="Dictionary field" value={dict.field} onChange={(e) => setDict({ ...dict, field: e.target.value })} /></label>
                  <label className="field">FILE<input aria-label="Dictionary file" value={dict.file} onChange={(e) => setDict({ ...dict, file: e.target.value })} list="spy-dict-files" spellCheck={false} /></label>
                  <datalist id="spy-dict-files">{files.map((f) => <option key={f} value={f} />)}</datalist>
                </div>
                {!preview
                  ? <Button variant="primary" size="small" disabled={!chosen.length || !dict.field.trim() || !/\.xml$/i.test(dict.file)} onClick={() => void toDictionary()}><Braces size={14} /> Preview dictionary change</Button>
                  : <DiffApproval preview={preview} height="200px" onApplied={(i) => { onIndex(i); setPreview(undefined); onNotice(`Added ${dict.field} to ${dict.file}.`); }} />}
              </fieldset>
            </>
          ) : <p className="subtle">Select an element to see verified selectors.</p>}
        </section>
      </div>
    </section>
  );
}
function flat(n: Node[]): Node[] { return n.flatMap((x) => [x, ...flat(x.children)]); }
