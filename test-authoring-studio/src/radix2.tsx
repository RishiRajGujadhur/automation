import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Progress from '@radix-ui/react-progress';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as Accordion from '@radix-ui/react-accordion';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { ChevronDown } from 'lucide-react';
import type { AppThemeId, EditorThemeId } from './themes';
import { accentById, type AccentId } from './accents';

/* ------------------------------------------------------------------ Tooltip + IconButton */
export function Tip({ content, shortcut, children, side = 'bottom' }: { content: ReactNode; shortcut?: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {content}
          {shortcut && <kbd>{shortcut}</kbd>}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
/** Icon-only button: the label is both the accessible name and a Radix tooltip (with optional shortcut). */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right' }>(function IconButton({ label, shortcut, side, className = '', children, ...props }, ref) {
  return (
    <Tip content={label} shortcut={shortcut} side={side}>
      <button ref={ref} type="button" className={`icon-button ${className}`} aria-label={label} {...props}>
        {children}
      </button>
    </Tip>
  );
});

/* ------------------------------------------------------------------ Confirm (AlertDialog) */
type ConfirmOptions = { title: string; description?: ReactNode; confirm?: string; cancel?: string; danger?: boolean };
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => true);
export const useConfirm = () => useContext(ConfirmContext);
/** Promise-based Radix AlertDialog: `if (await confirm({...})) doIt()`. Focus lands on Cancel by default. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions & { open: boolean }>({ title: '', open: false });
  const resolver = useRef<(v: boolean) => void>(() => {});
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => { resolver.current = resolve; setState({ ...o, open: true }); }), []);
  const close = (v: boolean) => { resolver.current(v); setState((s) => ({ ...s, open: false })); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={state.open} onOpenChange={(o) => { if (!o) close(false); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="modal alert-dialog">
            <div className="modal-body">
              <AlertDialog.Title className="alert-title">{state.title}</AlertDialog.Title>
              {state.description && <AlertDialog.Description className="subtle">{state.description}</AlertDialog.Description>}
              <div className="alert-actions">
                <AlertDialog.Cancel asChild>
                  <button className="button ghost" autoFocus>{state.cancel ?? 'Cancel'}</button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button className={`button ${state.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>{state.confirm ?? 'Continue'}</button>
                </AlertDialog.Action>
              </div>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

/* ------------------------------------------------------------------ Progress, Separator */
export function Meter({ value, max = 100, label, tone }: { value: number; max?: number; label: string; tone?: 'green' | 'amber' | 'red' | 'purple' }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const t = tone ?? (pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red');
  return (
    <Progress.Root className={`meter ${t}`} value={value} max={max} aria-label={label} getValueLabel={(v, m) => `${label}: ${v} of ${m}`}>
      <Progress.Indicator className="meter-indicator" style={{ transform: `translateX(-${100 - pct}%)` }} />
    </Progress.Root>
  );
}
export function IndeterminateProgress({ label }: { label: string }) {
  return (
    <Progress.Root className="progress-bar" value={null} aria-label={label}>
      <Progress.Indicator className="progress-bar-indicator" />
    </Progress.Root>
  );
}
export const Separator = ({ vertical = false }: { vertical?: boolean }) => <SeparatorPrimitive.Root className={`separator ${vertical ? 'vertical' : ''}`} orientation={vertical ? 'vertical' : 'horizontal'} decorative />;

/* ------------------------------------------------------------------ Accordion section (persisted) */
const OPEN_EVENT = 'tas:sections';
/** Expand or collapse every AccordionSection whose id starts with `prefix`. */
export const setAllSections = (prefix: string, open: boolean) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prefix, open } }));
export function AccordionSection({ id, title, summary, badge, icon, children, defaultOpen = true }: { id: string; title: ReactNode; summary?: ReactNode; badge?: ReactNode; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const key = 'tas:open:' + id;
  const [open, setOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(key); return v === null ? defaultOpen : JSON.parse(v); } catch { return defaultOpen; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(open)); } catch { /* ignore */ } }, [key, open]);
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (id.startsWith(d.prefix)) setOpen(d.open); };
    window.addEventListener(OPEN_EVENT, h);
    return () => window.removeEventListener(OPEN_EVENT, h);
  }, [id]);
  return (
    <Accordion.Root type="single" collapsible value={open ? id : ''} onValueChange={(v) => setOpen(v === id)} className={`panel collapsible ${open ? 'open' : ''}`} id={`section-${id}`}>
      <Accordion.Item value={id}>
        <Accordion.Header asChild>
          <div>
            <Accordion.Trigger className="collapsible-heading">
              <ChevronDown size={15} className="accordion-chevron" />
              {icon}
              <h2>{title}</h2>
              {!open && summary && <span className="collapsible-summary">{summary}</span>}
              {badge && <span className="collapsible-badge">{badge}</span>}
            </Accordion.Trigger>
          </div>
        </Accordion.Header>
        <Accordion.Content className="accordion-content">
          <div className="wizard-body">{children}</div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}

/* ------------------------------------------------------------------ Switch, ToggleGroup */
export function Switch({ id, checked, onCheckedChange, label, description }: { id: string; checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <div className="switch-row">
      <div>
        <label htmlFor={id}>{label}</label>
        {description && <span className="field-hint">{description}</span>}
      </div>
      <SwitchPrimitive.Root id={id} className="switch" checked={checked} onCheckedChange={onCheckedChange}>
        <SwitchPrimitive.Thumb className="switch-thumb" />
      </SwitchPrimitive.Root>
    </div>
  );
}
export function Segmented<T extends string>({ value, onValueChange, options, label, size }: { value: T; onValueChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: 'small' }) {
  return (
    <ToggleGroup.Root type="single" className={`segmented ${size ?? ''}`} aria-label={label} value={value} onValueChange={(v) => { if (v || v === '') onValueChange(v as T); }}>
      {options.map((o) => (
        <ToggleGroup.Item key={o.value || 'all'} value={o.value} className="segmented-item" aria-label={typeof o.label === 'string' ? o.label : o.value}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/* ------------------------------------------------------------------ Preferences */
export type Prefs = { density: 'comfortable' | 'compact'; textSize: 'small' | 'medium' | 'large'; motion: 'system' | 'reduce'; contrast: 'normal' | 'high'; theme: AppThemeId; editorTheme: EditorThemeId; accent: AccentId; mode: 'basic' | 'advanced'; haptics: boolean; sidebar: boolean; focus: boolean; showStats: boolean };
export const defaultPrefs: Prefs = { density: 'comfortable', textSize: 'medium', motion: 'system', contrast: 'normal', theme: 'studio', editorTheme: 'auto', accent: 'violet', mode: 'basic', haptics: true, sidebar: true, focus: false, showStats: true };
const PrefsContext = createContext<{ prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }>({ prefs: defaultPrefs, setPrefs: () => {} });
export const usePrefs = () => useContext(PrefsContext);
/** Applies preferences as data attributes on <html> so plain CSS can respond. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<Prefs>(() => {
    try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem('tas:prefs') ?? '{}') }; } catch { return defaultPrefs; }
  });
  useEffect(() => {
    try { localStorage.setItem('tas:prefs', JSON.stringify(prefs)); } catch { /* ignore */ }
    const el = document.documentElement;
    el.dataset.density = prefs.density;
    el.dataset.text = prefs.textSize;
    el.dataset.motion = prefs.motion;
    el.dataset.contrast = prefs.contrast;
    el.dataset.accent = prefs.accent;
    el.dataset.mode = prefs.mode;
    // Accent tokens come from src/accents.ts (contrast-tested). Matrix keeps its own phosphor green.
    const a = accentById(prefs.accent);
    const vars: Record<string, string> = prefs.theme === 'matrix' ? {} : { '--accent': a.accent, '--accent-strong': a.strong, '--on-accent': a.onStrong, '--accent-text': prefs.theme === 'light' ? a.strong : a.accent, '--accent-soft': (prefs.theme === 'light' ? a.strong : a.accent) + (prefs.theme === 'light' ? '1f' : '24') };
    for (const k of ['--accent', '--accent-strong', '--on-accent', '--accent-text', '--accent-soft']) { if (vars[k]) el.style.setProperty(k, vars[k]); else el.style.removeProperty(k); }
    el.dataset.theme = prefs.theme;
    el.style.colorScheme = prefs.theme === 'light' ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(el).getPropertyValue('--bg').trim() || '#0b0e16');
    el.dataset.focus = String(prefs.focus);
    el.dataset.sidebar = String(prefs.sidebar);
  }, [prefs]);
  const setPrefs = useCallback((p: Partial<Prefs>) => set((x) => ({ ...x, ...p })), []);
  return <PrefsContext.Provider value={{ prefs, setPrefs }}>{children}</PrefsContext.Provider>;
}
/** Short vibration on touch devices for confirmations (respects the haptics preference). */
export function haptic(pattern: number | number[] = 12) {
  try {
    const p = JSON.parse(localStorage.getItem('tas:prefs') ?? '{}');
    if (p.haptics === false) return;
    if (matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(pattern);
  } catch { /* ignore */ }
}
/** Wrap state changes that switch pages in a View Transition when the browser supports it. */
export function withTransition(fn: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (d.startViewTransition && document.documentElement.dataset.motion !== 'reduce' && !matchMedia('(prefers-reduced-motion: reduce)').matches) d.startViewTransition(fn);
  else fn();
}
export const TooltipProvider = ({ children }: { children: ReactNode }) => <Tooltip.Provider delayDuration={350} skipDelayDuration={200}>{children}</Tooltip.Provider>;
