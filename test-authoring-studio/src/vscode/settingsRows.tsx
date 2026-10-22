import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Checkbox, Select } from '../radix';
import { SETTINGS, parseNumbers, resetSetting, setSetting, setting, settingModified, type SettingDef } from './settings';

/** What the Settings page needs for one VS Code–style setting (its own Row type has the same fields). */
export type SettingRow = { id: string; section: string; title: string; description?: string; keywords?: string; control?: ReactNode; modified?: boolean; meta?: ReactNode };

/** Top-level categories (VS Code's Text Editor, Workbench) and their sub-categories, in declaration order. */
export function settingCategories() {
  const tops: { id: string; subs: string[] }[] = [];
  for (const s of SETTINGS) {
    const [top] = s.category.split(' ▸ ');
    let t = tops.find((x) => x.id === top);
    if (!t) { t = { id: top, subs: [] }; tops.push(t); }
    if (s.category !== top && !t.subs.includes(s.category)) t.subs.push(s.category);
  }
  return tops;
}

const slug = (key: string) => key.replace(/\W/g, '-');
/** A text box that applies on Enter or when it loses focus (strings, regular expressions, column lists). */
function TextSetting({ def, value, numbers, object }: { def: SettingDef; value: string; numbers?: boolean; object?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const apply = () => { if (object) { try { setSetting(def.key, JSON.parse(text || '{}')); } catch { setText(value); } return; } setSetting(def.key, numbers ? parseNumbers(text) : text); };
  return <input id={`setting-${slug(def.key)}`} className="settings-text" aria-label={def.title} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={apply} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} />;
}
function control(d: SettingDef): ReactNode {
  const v = setting<unknown>(d.key);
  const id = `setting-${slug(d.key)}`;
  switch (d.type) {
    case 'boolean': return <Checkbox id={id} checked={!!v} onCheckedChange={(x) => setSetting(d.key, x)} label={d.description} />;
    case 'number': return <input id={id} type="number" className="settings-number" aria-label={d.title} min={d.min} max={d.max} step={d.step ?? 1} value={String(v)} onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) setSetting(d.key, Math.max(d.min ?? -Infinity, Math.min(d.max ?? Infinity, n))); }} />;
    case 'enum': {
      const o = d.options?.find((x) => x.value === v);
      return <span className="settings-enum"><Select id={id} ariaLabel={d.title} value={String(v)} onValueChange={(x) => setSetting(d.key, x)} options={(d.options ?? []).map((x) => ({ value: x.value, label: x.label ?? x.value }))} />{o?.description && <small className="meta">{o.description}</small>}</span>;
    }
    case 'string': return <TextSetting def={d} value={String(v)} />;
    case 'numbers': return <TextSetting def={d} value={(v as number[]).join(', ')} numbers />;
    case 'object': return <TextSetting def={d} value={JSON.stringify(v)} object />;
  }
}
/** Settings ▸ Text Editor / Workbench rows: a control per setting, a bar and a reset button when changed. */
export function settingRows(): SettingRow[] {
  return SETTINGS.map((d) => {
    const modified = settingModified(d.key);
    return {
      id: d.key, section: d.category, title: d.title,
      description: d.type === 'boolean' ? undefined : d.description,
      keywords: `${d.key} ${d.category} ${d.description} ${(d.options ?? []).map((o) => `${o.value} ${o.description ?? ''}`).join(' ')}${modified ? ' @modified modified' : ''}`,
      control: control(d),
      modified,
      meta: modified ? <span className="setting-meta"><button className="icon-button setting-reset" aria-label={`Reset ${d.title}`} title={`Reset to the default (${JSON.stringify(d.default)})`} onClick={() => resetSetting(d.key)}><RotateCcw size={12} aria-hidden="true" /></button></span> : undefined,
    };
  });
}
