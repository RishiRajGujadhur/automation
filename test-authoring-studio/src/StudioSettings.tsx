import { useEffect, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Download, Trash2, RotateCcw } from 'lucide-react';
import { api } from './api';
import { TextField } from './forms';
import { Switch, Separator, Segmented, usePrefs, useConfirm } from './radix2';
import { Button } from './radix';

type Settings = { webPort: number; apiPort: number; tracing: { enabled: boolean; screenshots: boolean; snapshots: boolean; sources: boolean } };
type Trace = { name: string; size: number; modified: string };

const port = Yup.number().typeError('Enter a number.').integer('Whole numbers only.').min(1024, 'Use 1024–65535 (lower ports need admin rights).').max(65535, 'Use 1024–65535.').required('Required.');
const schema = Yup.object({
  webPort: port,
  apiPort: port.test('distinct', 'Must differ from the web port.', function (v) { return v !== this.parent.webPort; }),
});

/** Keys this app stores in localStorage (all prefixed "tas:"). */
export const cachedKeys = () => {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith('tas:'));
  } catch {
    return [];
  }
};

export default function StudioSettings({ onNotice }: { onNotice: (m: string) => void }) {
  const { prefs, setPrefs } = usePrefs();
  const confirm = useConfirm();
  const [settings, setSettings] = useState<Settings & { running?: { webPort: number; apiPort: number } }>();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/settings').then(setSettings).catch((e) => setError(e.message));
    api<Trace[]>('/traces').then(setTraces).catch(() => {});
  }, []);
  const save = async (next: Settings) => {
    const r = await api<Settings & { restartRequired: boolean }>('/settings', next);
    setSettings((s) => ({ ...r, running: s?.running }));
    onNotice(r.restartRequired ? `Saved. Restart npm run dev to move to web port ${r.webPort} / API port ${r.apiPort}.` : 'Settings saved.');
  };
  const cacheCount = cachedKeys().length;
  return (
    <div className="prefs">
      <section aria-labelledby="pref-display">
        <h3 id="pref-display">Display</h3>
        <div className="pref-row"><span id="lbl-density">Density</span><Segmented label="Density" value={prefs.density} onValueChange={(v) => setPrefs({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></div>
        <div className="pref-row"><span>Text size</span><Segmented label="Text size" value={prefs.textSize} onValueChange={(v) => setPrefs({ textSize: v })} options={[{ value: 'small', label: 'A−' }, { value: 'medium', label: 'A' }, { value: 'large', label: 'A+' }]} /></div>
        <div className="pref-row"><span>Accent</span><Segmented label="Accent colour" value={prefs.accent} onValueChange={(v) => setPrefs({ accent: v })} options={(['violet', 'teal', 'blue', 'amber'] as const).map((a) => ({ value: a, label: <span className={`swatch ${a}`} aria-label={a} role="img" /> }))} /></div>
        <Switch id="pref-stats" label="Show dashboard statistics" description="The counts row at the top of the Dashboard." checked={prefs.showStats} onCheckedChange={(v) => setPrefs({ showStats: v })} />
      </section>
      <Separator />
      <section aria-labelledby="pref-a11y">
        <h3 id="pref-a11y">Accessibility</h3>
        <Switch id="pref-motion" label="Reduce motion" description="Turns off animations and page transitions." checked={prefs.motion === 'reduce'} onCheckedChange={(v) => setPrefs({ motion: v ? 'reduce' : 'system' })} />
        <Switch id="pref-contrast" label="High contrast" description="Stronger borders and brighter secondary text." checked={prefs.contrast === 'high'} onCheckedChange={(v) => setPrefs({ contrast: v ? 'high' : 'normal' })} />
        <Switch id="pref-haptics" label="Haptic feedback" description="Short vibrations on touch devices when you accept or remove items." checked={prefs.haptics} onCheckedChange={(v) => setPrefs({ haptics: v })} />
      </section>
      <Separator />
      <section aria-labelledby="pref-layout">
        <h3 id="pref-layout">Layout</h3>
        <Switch id="pref-sidebar" label="Show feature explorer" description="Ctrl/Cmd+B" checked={prefs.sidebar} onCheckedChange={(v) => setPrefs({ sidebar: v })} />
        <Switch id="pref-focus" label="Focus mode" description="Hides navigation chrome. Ctrl/Cmd+." checked={prefs.focus} onCheckedChange={(v) => setPrefs({ focus: v })} />
      </section>
      <Separator />
      <section aria-labelledby="pref-server">
        <h3 id="pref-server">Ports &amp; Playwright tracing</h3>
        {error && <p className="field-error" role="alert">{error}</p>}
        {settings && (
          <Formik initialValues={{ webPort: settings.webPort, apiPort: settings.apiPort, tracing: settings.tracing }} validationSchema={schema} validateOnMount onSubmit={async (v, h) => { try { await save({ ...v, webPort: Number(v.webPort), apiPort: Number(v.apiPort) }); h.setStatus(undefined); } catch (e) { h.setStatus((e as Error).message); } finally { h.setSubmitting(false); } }}>
            {({ values, setFieldValue, isValid, isSubmitting, dirty, status }) => (
              <Form className="form-stack" noValidate>
                <div className="form-grid">
                  <TextField name="webPort" label="WEB UI PORT" hint={`Running on ${settings.running?.webPort ?? '?'}. Opens at http://127.0.0.1:<port>.`} />
                  <TextField name="apiPort" label="API PORT" hint={`Running on ${settings.running?.apiPort ?? '?'}. The UI proxies /api here.`} />
                </div>
                <p className="field-hint">Ports are saved to <code>.local/settings.json</code> and take effect after restarting <code>npm run dev</code>. <code>STUDIO_WEB_PORT</code> / <code>STUDIO_API_PORT</code> override them.</p>
                <Switch id="trace-enabled" label="Record Playwright traces" description="Recordings save a trace .zip you can open with npx playwright show-trace. Test runs get STUDIO_PLAYWRIGHT_TRACING=1." checked={values.tracing.enabled} onCheckedChange={(v) => setFieldValue('tracing.enabled', v)} />
                {values.tracing.enabled && (
                  <div className="nested-switches">
                    <Switch id="trace-screens" label="Screenshots" checked={values.tracing.screenshots} onCheckedChange={(v) => setFieldValue('tracing.screenshots', v)} />
                    <Switch id="trace-snaps" label="DOM snapshots" checked={values.tracing.snapshots} onCheckedChange={(v) => setFieldValue('tracing.snapshots', v)} />
                    <Switch id="trace-sources" label="Sources" checked={values.tracing.sources} onCheckedChange={(v) => setFieldValue('tracing.sources', v)} />
                  </div>
                )}
                {status && <p className="field-error" role="alert">{status}</p>}
                <Button type="submit" variant="primary" disabled={!isValid || isSubmitting || !dirty}>Save studio settings</Button>
              </Form>
            )}
          </Formik>
        )}
        {traces.length > 0 && (
          <div className="trace-list">
            <span className="micro-label">RECENT TRACES</span>
            <ul>
              {traces.slice(0, 5).map((t) => (
                <li key={t.name}>
                  <a className="text-button" href={`/api/traces/${encodeURIComponent(t.name)}`} download>
                    <Download size={13} aria-hidden="true" />{t.name}
                  </a>
                  <span className="meta">{(t.size / 1024).toFixed(0)} KB</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <Separator />
      <section aria-labelledby="pref-storage">
        <h3 id="pref-storage">Cached UI state</h3>
        <p className="field-hint">{cacheCount} item{cacheCount === 1 ? '' : 's'} stored in this browser: collapsed cards, drafts, filters, recent files, sidebar width and preferences. Nothing in your repository is affected.</p>
        <div className="row-actions">
          <Button variant="ghost" size="small" onClick={async () => { if (await confirm({ title: 'Reset collapsed cards?', description: 'Every card returns to its default open or closed state.', confirm: 'Reset cards' })) { cachedKeys().filter((k) => k.startsWith('tas:open:') || k.startsWith('tas:card:')).forEach((k) => localStorage.removeItem(k)); location.reload(); } }}>
            <RotateCcw size={13} aria-hidden="true" />Reset card states
          </Button>
          <Button variant="danger" size="small" disabled={!cacheCount} onClick={async () => { if (await confirm({ title: 'Clear all cached UI state?', description: 'Removes drafts, preferences, layout and history stored in this browser, then reloads. Repository files are not touched.', confirm: 'Clear cache', danger: true })) { cachedKeys().forEach((k) => localStorage.removeItem(k)); location.reload(); } }}>
            <Trash2 size={13} aria-hidden="true" />Clear cache
          </Button>
        </div>
      </section>
    </div>
  );
}
