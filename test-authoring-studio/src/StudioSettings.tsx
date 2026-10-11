import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { gherkin } from '@codemirror/legacy-modes/mode/gherkin';
import { Download, Trash2, RotateCcw, Search, Settings2, Palette, Code2, Accessibility, PanelLeft, Network, Activity, FolderCog, HardDrive, Keyboard, X, Cpu, Info, type LucideIcon } from 'lucide-react';
import { api } from './api';
import { TextField } from './forms';
import { Switch as SwitchPrimitive, Segmented, usePrefs, useConfirm, useAlgorithms, Tip } from './radix2';
import { algorithms, categories, presetById, presets } from './algorithms/registry';
import { Button, Select } from './radix';
import { Highlight } from './ui';
import { appThemes, editorThemes, resolveEditorTheme, type AppThemeId, type EditorThemeId } from './themes';
import { labelled } from './editor/a11y';
import { accents, contrast } from './accents';
import { defaultPrefs } from './radix2';

type Settings = { webPort: number; apiPort: number; tracing: { enabled: boolean; screenshots: boolean; snapshots: boolean; sources: boolean } };
type Trace = { name: string; size: number; modified: string };
type Row = { id: string; section: string; title: string; description?: string; keywords?: string; control?: ReactNode; block?: ReactNode; tip?: string; sub?: boolean };

const port = Yup.number().typeError('Enter a number.').integer('Whole numbers only.').min(1024, 'Use 1024–65535 (lower ports need admin rights).').max(65535, 'Use 1024–65535.').required('Required.');
const portSchema = Yup.object({ webPort: port, apiPort: port.test('distinct', 'Must differ from the web port.', function (v) { return v !== this.parent.webPort; }) });
export const cachedKeys = () => {
  try { return Object.keys(localStorage).filter((k) => k.startsWith('tas:')); } catch { return []; }
};
const sections: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'General', label: 'General', icon: Settings2 },
  { id: 'Appearance', label: 'Appearance', icon: Palette },
  { id: 'Code editor', label: 'Code editor', icon: Code2 },
  { id: 'Accessibility', label: 'Accessibility', icon: Accessibility },
  { id: 'Layout', label: 'Layout', icon: PanelLeft },
  { id: 'Ports', label: 'Ports', icon: Network },
  { id: 'Playwright tracing', label: 'Playwright tracing', icon: Activity },
  { id: 'Workspace', label: 'Workspace', icon: FolderCog },
  { id: 'Algorithms', label: 'Algorithms', icon: Cpu },
  { id: 'Storage', label: 'Storage', icon: HardDrive },
  { id: 'Shortcuts', label: 'Keyboard shortcuts', icon: Keyboard },
];
const preview = `@smoke
Feature: Checkout
  # Reuse existing bindings
  Scenario: Place an order
    Given the user signs in as "buyer"
    When they enter "john.doe@example.com" in the email field
    Then the order is confirmed
`;

/** Claude-Code-style settings: searchable sidebar of categories, rows of title/description + control. */
export default function StudioSettings({ onNotice, onWorkspace, shortcuts, onClose }: { onNotice: (m: string) => void; onWorkspace: () => void; shortcuts: [string, string][]; onClose: () => void }) {
  const { prefs, setPrefs } = usePrefs();
  const algo = useAlgorithms();
  const confirm = useConfirm();
  const [section, setSection] = useState('General');
  const [query, setQuery] = useState('');
  const [settings, setSettings] = useState<Settings & { running?: { webPort: number; apiPort: number } }>();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api('/settings').then(setSettings).catch((e) => setError(e.message));
    api<Trace[]>('/traces').then(setTraces).catch(() => {});
  }, []);
  const save = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { webPort: settings.webPort, apiPort: settings.apiPort, tracing: settings.tracing, ...patch };
    const r = await api<Settings & { restartRequired: boolean }>('/settings', next);
    setSettings((s) => ({ ...r, running: s?.running }));
    onNotice(r.restartRequired ? `Saved. Restart npm run dev to move to web port ${r.webPort} / API port ${r.apiPort}.` : 'Settings saved.');
  };
  const editor = resolveEditorTheme(prefs.editorTheme, prefs.theme);
  const cacheCount = cachedKeys().length;
  const sw = (id: string, checked: boolean, onChange: (v: boolean) => void, label: string, disabled = false) => <SwitchPrimitive id={id} label={<span className="sr-only">{label}</span>} checked={checked} onCheckedChange={onChange} disabled={disabled} />;
  const custom = algo.preset === 'custom';

  const rows: Row[] = useMemo(() => [
    // General
    {
      id: 'mode', section: 'General', title: 'Interface mode (Basic / Advanced)', description: 'Basic shows Dashboard, Test Generator and Playwright Recorder. Advanced adds Features, Dictionary Inspector and the ⋯ menu (Step Catalog, Backgrounds, Selectors, Project Explorer, Config). Ctrl/Cmd+Shift+A switches.', keywords: 'basic advanced simple navigation menu hide pages',
      control: <Segmented label="Interface mode" value={prefs.mode} onValueChange={(v) => setPrefs({ mode: v })} options={[{ value: 'basic', label: 'Basic' }, { value: 'advanced', label: 'Advanced' }]} />,
    },
    { id: 'stats', section: 'General', title: 'Show dashboard statistics', description: 'The counts row at the top of the Dashboard.', keywords: 'stats counts dashboard', control: sw('pref-stats', prefs.showStats, (v) => setPrefs({ showStats: v }), 'Show dashboard statistics') },
    { id: 'haptics', section: 'General', title: 'Haptic feedback', description: 'Short vibrations on touch devices when you accept, remove or validate.', keywords: 'vibrate mobile touch', control: sw('pref-haptics', prefs.haptics, (v) => setPrefs({ haptics: v }), 'Haptic feedback') },
    // Appearance
    {
      id: 'theme', section: 'Appearance', title: 'Theme', description: 'Colours for the whole studio. Editor theme "Automatic" follows this.', keywords: 'dark light matrix nord midnight colour color scheme',
      block: (
        <div className="theme-grid" role="radiogroup" aria-label="App theme">
          {appThemes.map((t) => (
            <button key={t.id} role="radio" aria-checked={prefs.theme === t.id} className={`theme-card ${prefs.theme === t.id ? 'selected' : ''}`} onClick={() => setPrefs({ theme: t.id as AppThemeId })}>
              <span className="theme-preview" style={{ background: t.swatch[0] }} aria-hidden="true">
                <span style={{ background: t.swatch[1] }} />
                <span style={{ background: t.swatch[2] }} />
              </span>
              <strong>{t.label}</strong>
              <small>{t.description}</small>
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'accent', section: 'Appearance', title: 'Accent colour', description: 'Primary buttons, active states, focus rings, scrollbars and the wordmark. Every accent meets WCAG 2.2 AA (4.5:1) for text and for button labels.', keywords: 'accent color colour logo scrollbar wcag contrast violet indigo blue cyan teal green amber orange rose pink slate',
      block: (
        <div className="accent-grid" role="radiogroup" aria-label="Accent colour">
          {accents.map((a) => {
            const text = prefs.theme === 'light' ? a.strong : a.accent;
            const bg = prefs.theme === 'light' ? '#ffffff' : '#121722';
            return (
              <button key={a.id} role="radio" aria-checked={prefs.accent === a.id} aria-label={a.id} className={`accent-option ${prefs.accent === a.id ? 'selected' : ''}`} onClick={() => setPrefs({ accent: a.id })} title={`${a.label}: text ${contrast(text, bg).toFixed(1)}:1, button ${contrast(a.onStrong, a.strong).toFixed(1)}:1`}>
                <span className="accent-dot" style={{ background: `linear-gradient(135deg, ${a.accent} 50%, ${a.strong} 50%)` }} aria-hidden="true" />
                <span>{a.label}</span>
                <small>{contrast(text, bg).toFixed(1)}:1</small>
              </button>
            );
          })}
        </div>
      ),
    },
    { id: 'layout', section: 'Appearance', title: 'Layout', description: 'VS Code: activity bar on the left, slim title bar, full-height editor and an accent status bar. Classic: tabs across the top.', keywords: 'vscode visual studio code activity bar classic tabs layout', control: <Segmented label="Layout" value={prefs.layout} onValueChange={(v) => setPrefs({ layout: v })} options={[{ value: 'vscode', label: 'VS Code' }, { value: 'classic', label: 'Classic' }]} /> },
    { id: 'density', section: 'Appearance', title: 'Density', description: 'Spacing inside cards and forms.', keywords: 'compact comfortable spacing', control: <Segmented label="Density" value={prefs.density} onValueChange={(v) => setPrefs({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /> },
    { id: 'text', section: 'Appearance', title: 'Text size', description: 'Base font size for the interface.', keywords: 'font size zoom', control: <Segmented label="Text size" value={prefs.textSize} onValueChange={(v) => setPrefs({ textSize: v })} options={[{ value: 'small', label: 'A−' }, { value: 'medium', label: 'A' }, { value: 'large', label: 'A+' }]} /> },
    { id: 'appearance-reset', section: 'Appearance', title: 'Reset appearance', description: 'Theme, accent, density and text size back to their defaults.', keywords: 'default reset theme accent', control: <Button variant="ghost" size="small" onClick={() => { setPrefs({ theme: defaultPrefs.theme, accent: defaultPrefs.accent, density: defaultPrefs.density, textSize: defaultPrefs.textSize, editorTheme: defaultPrefs.editorTheme }); onNotice('Appearance reset to defaults.'); }}><RotateCcw size={13} aria-hidden="true" />Reset</Button> },
    // Code editor
    {
      id: 'editor-theme', section: 'Code editor', title: 'Editor theme', description: 'Syntax colours for Gherkin, C#, XML and diffs. Themes from CodeMirror and ThemeMirror.', keywords: 'codemirror thememirror syntax highlighting dracula cobalt matrix',
      control: (
        <Select
          ariaLabel="Editor theme"
          value={prefs.editorTheme}
          onValueChange={(v) => setPrefs({ editorTheme: v as EditorThemeId })}
          options={[{ value: 'auto', label: `Automatic (${resolveEditorTheme('auto', prefs.theme).label})` }, ...editorThemes.map((e) => ({ value: e.id, label: `${e.label}${e.dark ? '' : ' · light'}` }))]}
        />
      ),
      block: (
        <div className="editor-preview">
          <CodeMirror value={preview} theme={editor.ext} editable={false} basicSetup={{ foldGutter: false, highlightActiveLine: false }} extensions={[StreamLanguage.define(gherkin), labelled(`Preview of ${editor.label}`, true)]} />
          <span className="meta">{editor.label} · {editor.source}</span>
        </div>
      ),
    },
    // Accessibility
    { id: 'motion', section: 'Accessibility', title: 'Reduce motion', description: 'Turns off animations and page transitions.', keywords: 'animation transitions vestibular', control: sw('pref-motion', prefs.motion === 'reduce', (v) => setPrefs({ motion: v ? 'reduce' : 'system' }), 'Reduce motion') },
    { id: 'contrast', section: 'Accessibility', title: 'High contrast', description: 'Stronger borders and brighter secondary text.', keywords: 'contrast wcag vision', control: sw('pref-contrast', prefs.contrast === 'high', (v) => setPrefs({ contrast: v ? 'high' : 'normal' }), 'High contrast') },
    // Layout
    { id: 'sidebar', section: 'Layout', title: 'Show feature explorer', description: 'Ctrl/Cmd+B. Drag its edge to resize; double-click to reset.', keywords: 'sidebar explorer width', control: sw('pref-sidebar', prefs.sidebar, (v) => setPrefs({ sidebar: v }), 'Show feature explorer') },
    { id: 'focus', section: 'Layout', title: 'Focus mode', description: 'Hides navigation chrome. Ctrl/Cmd+.', keywords: 'zen distraction', control: sw('pref-focus', prefs.focus, (v) => setPrefs({ focus: v }), 'Focus mode') },
    // Ports
    {
      id: 'ports', section: 'Ports', title: 'Web UI and API ports', description: 'Saved to .local/settings.json; applies after restarting npm run dev. STUDIO_WEB_PORT / STUDIO_API_PORT override.', keywords: 'port server proxy vite express 5173 4310',
      block: settings ? (
        <Formik initialValues={{ webPort: settings.webPort, apiPort: settings.apiPort }} validationSchema={portSchema} validateOnMount enableReinitialize onSubmit={async (v, h) => { try { await save({ webPort: Number(v.webPort), apiPort: Number(v.apiPort) }); h.setStatus(undefined); } catch (e) { h.setStatus((e as Error).message); } finally { h.setSubmitting(false); } }}>
          {({ isValid, isSubmitting, dirty, status }) => (
            <Form className="form-stack" noValidate>
              <div className="form-grid">
                <TextField name="webPort" label="WEB UI PORT" hint={`Running on ${settings.running?.webPort ?? '?'}.`} />
                <TextField name="apiPort" label="API PORT" hint={`Running on ${settings.running?.apiPort ?? '?'}. The UI proxies /api here.`} />
              </div>
              {status && <p className="field-error" role="alert">{status}</p>}
              <Button type="submit" variant="primary" disabled={!isValid || isSubmitting || !dirty}>Save studio settings</Button>
            </Form>
          )}
        </Formik>
      ) : <p className="subtle">{error || 'Loading…'}</p>,
    },
    // Tracing
    { id: 'trace', section: 'Playwright tracing', title: 'Record Playwright traces', description: 'Recordings save a trace .zip (open with npx playwright show-trace). Test runs get STUDIO_PLAYWRIGHT_TRACING=1.', keywords: 'trace tracing debug zip show-trace', control: settings && sw('trace-enabled', settings.tracing.enabled, (v) => save({ tracing: { ...settings.tracing, enabled: v } }), 'Record Playwright traces') },
    ...(settings?.tracing.enabled
      ? ([
          { id: 'trace-shots', section: 'Playwright tracing', title: 'Screenshots', description: 'Capture a screenshot after each action.', keywords: 'trace', control: sw('trace-screens', settings.tracing.screenshots, (v) => save({ tracing: { ...settings.tracing, screenshots: v } }), 'Screenshots') },
          { id: 'trace-snaps', section: 'Playwright tracing', title: 'DOM snapshots', description: 'Snapshot the DOM so the trace viewer can inspect elements.', keywords: 'trace', control: sw('trace-snaps', settings.tracing.snapshots, (v) => save({ tracing: { ...settings.tracing, snapshots: v } }), 'DOM snapshots') },
          { id: 'trace-src', section: 'Playwright tracing', title: 'Sources', description: 'Include source files in the trace.', keywords: 'trace', control: sw('trace-sources', settings.tracing.sources, (v) => save({ tracing: { ...settings.tracing, sources: v } }), 'Sources') },
        ] as Row[])
      : []),
    {
      id: 'traces', section: 'Playwright tracing', title: 'Recent traces', keywords: 'download zip',
      block: traces.length ? (
        <ul className="trace-list">
          {traces.slice(0, 6).map((t) => (
            <li key={t.name}>
              <a className="text-button" href={`/api/traces/${encodeURIComponent(t.name)}`} download><Download size={13} aria-hidden="true" />{t.name}</a>
              <span className="meta">{(t.size / 1024).toFixed(0)} KB</span>
            </li>
          ))}
        </ul>
      ) : <p className="subtle">No traces yet. Enable tracing, then record and stop a workflow.</p>,
    },
    // Workspace
    { id: 'workspace', section: 'Workspace', title: 'Repository and scan patterns', description: 'Repository root, target project, feature/source/dictionary globs and ignored folders.', keywords: 'repository root csproj glob scan', control: <Button size="small" onClick={onWorkspace}>Open workspace settings</Button> },
    // Algorithms
    {
      id: 'algo-preset', section: 'Algorithms', title: 'Algorithm preset', description: `${presetById.get(algo.preset)?.description ?? ''} ${algorithms.filter((x) => algo.on(x.id)).length} of ${algorithms.length} on.`, keywords: 'algorithm preset essentials custom everything minimal regression model combinatorial bdd enable disable',
      control: (
        <div className="button-row">
          <Select ariaLabel="Algorithm preset" value={algo.preset} onValueChange={(v) => { algo.setPreset(v); onNotice(`Preset: ${presetById.get(v)?.label}.`); }} options={presets.map((p) => ({ value: p.id, label: p.label }))} />
          <Button size="small" variant="ghost" onClick={() => { algo.reset(); onNotice('Algorithms reset to the Essentials preset.'); }}><RotateCcw size={13} aria-hidden="true" />Reset</Button>
        </div>
      ),
    },
    ...(custom
      ? [{
          id: 'algo-all', section: 'Algorithms', title: 'Custom selection', description: 'Turn individual algorithms on or off. Hover ⓘ for what each one does.', keywords: 'enable all disable all',
          control: (
            <div className="button-row">
              <Button size="small" onClick={() => algo.set(Object.fromEntries(algorithms.map((x) => [x.id, true])))}>Enable all</Button>
              <Button size="small" variant="ghost" onClick={() => algo.set(Object.fromEntries(algorithms.map((x) => [x.id, false])))}>Disable all</Button>
            </div>
          ),
        } as Row]
      : [{ id: 'algo-locked', section: 'Algorithms', title: 'Switches follow the preset', description: 'Choose Custom to turn individual algorithms on or off. Custom starts from the current preset.', keywords: 'custom locked', control: <Button size="small" onClick={() => algo.setPreset('custom')}>Customize</Button> } as Row]),
    ...categories.flatMap((c): Row[] => {
      const list = algorithms.filter((x) => x.category === c);
      const onCount = list.filter((x) => algo.on(x.id)).length;
      return [
        { id: `algo-cat-${c}`, section: 'Algorithms', title: c, description: `${onCount} of ${list.length} on · used in ${list[0].usedIn}.`, keywords: list.map((x) => x.name).join(' '), control: sw(`algo-cat-${c.replace(/\W/g, '')}`, onCount === list.length, (v) => algo.set(Object.fromEntries(list.map((x) => [x.id, v]))), `All ${c} algorithms`, !custom) },
        ...list.map((x): Row => ({ id: `algo-${x.id}`, sub: true, section: 'Algorithms', title: x.name, tip: x.tooltip, description: x.tooltip.split('. ')[0].replace(/\.$/, '') + '.', keywords: `${x.id} ${x.tooltip} ${c}`, control: sw(`algo-${x.id}`, algo.on(x.id), (v) => algo.set({ [x.id]: v }), x.name, !custom) })),
      ];
    }),    // Storage    { id: 'cards', section: 'Storage', title: 'Reset card states', description: 'Every collapsible card returns to its default open or closed state.', keywords: 'collapse cards reset', control: <Button variant="ghost" size="small" onClick={async () => { if (await confirm({ title: 'Reset collapsed cards?', description: 'Every card returns to its default open or closed state.', confirm: 'Reset cards' })) { cachedKeys().filter((k) => k.startsWith('tas:open:') || k.startsWith('tas:card:')).forEach((k) => localStorage.removeItem(k)); location.reload(); } }}><RotateCcw size={13} aria-hidden="true" />Reset card states</Button> },
    { id: 'cache', section: 'Storage', title: 'Clear cached UI state', description: `${cacheCount} item${cacheCount === 1 ? '' : 's'} stored in this browser: drafts, preferences, layout and history. Repository files are not affected.`, keywords: 'cache localstorage clear reset delete', control: <Button variant="danger" size="small" disabled={!cacheCount} onClick={async () => { if (await confirm({ title: 'Clear all cached UI state?', description: 'Removes drafts, preferences, layout and history stored in this browser, then reloads. Repository files are not touched.', confirm: 'Clear cache', danger: true })) { cachedKeys().forEach((k) => localStorage.removeItem(k)); location.reload(); } }}><Trash2 size={13} aria-hidden="true" />Clear cache</Button> },
    // Shortcuts
    { id: 'shortcuts', section: 'Shortcuts', title: 'All shortcuts', keywords: shortcuts.map((s) => s.join(' ')).join(' '), block: <dl className="shortcut-list">{shortcuts.map(([k, d]) => <div key={k} className="shortcut-row"><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [prefs, settings, traces, error, cacheCount, editor, algo]);

  const q = query.trim().toLowerCase();
  const matches = q ? rows.filter((r) => `${r.section} ${r.title} ${r.description ?? ''} ${r.keywords ?? ''}`.toLowerCase().includes(q)) : rows.filter((r) => r.section === section);
  const grouped = q ? sections.map((s) => ({ s, items: matches.filter((r) => r.section === s.id) })).filter((g) => g.items.length) : [{ s: sections.find((s) => s.id === section)!, items: matches }];
  const counts = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, rows.filter((r) => r.section === s.id && (!q || `${r.section} ${r.title} ${r.description ?? ''} ${r.keywords ?? ''}`.toLowerCase().includes(q))).length])), [rows, q]);
  // Braces matter: Chromium's scrollTo() now returns a Promise, which must not be returned from an effect.
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [section, q]);

  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Settings categories">
        <label className="settings-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search settings</span>
          <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); } }} autoFocus />
        </label>
        <span className="settings-nav-label">Settings</span>
        <ul>
          {sections.map((s) => (
            <li key={s.id}>
              <button
                className={`settings-nav-item ${!q && section === s.id ? 'active' : ''} ${q && !counts[s.id] ? 'dim' : ''}`}
                aria-current={!q && section === s.id ? 'page' : undefined}
                onClick={() => { setQuery(''); setSection(s.id); }}
              >
                <s.icon size={17} aria-hidden="true" />
                <span>{s.label}</span>
                {q && counts[s.id] > 0 && <span className="nav-count">{counts[s.id]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="settings-content" ref={contentRef}>
        <button className="icon-button settings-close" aria-label="Close settings" onClick={onClose}><X size={18} /></button>
        {grouped.map(({ s, items }) => (
          <section key={s.id} className="settings-section" aria-labelledby={`settings-${s.id.replace(/\W/g, '')}`}>
            <h2 id={`settings-${s.id.replace(/\W/g, '')}`}>{s.label}</h2>
            {items.map((r) => (
              <div key={r.id} className={`settings-row ${r.block && !r.control ? 'stacked' : ''} ${r.sub ? 'sub' : ''}`}>
                <div className="settings-row-text">
                  <h3>
                    <Highlight text={r.title} query={q} />
                    {r.tip && <Tip content={<span className="tooltip-wide">{r.tip}</span>} side="top"><button type="button" className="info-tip" aria-label={`About ${r.title}`}><Info size={13} aria-hidden="true" /></button></Tip>}
                  </h3>
                  {r.description && <p><Highlight text={r.description} query={q} /></p>}
                </div>
                {r.control && <div className="settings-row-control">{r.control}</div>}
                {r.block && <div className="settings-row-block">{r.block}</div>}
              </div>
            ))}
          </section>
        ))}
        {q && !grouped.length && <p className="settings-empty">No settings match “{query}”.</p>}
      </div>
    </div>
  );
}
