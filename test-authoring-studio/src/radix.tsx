import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useField } from 'formik';
import { Check, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ------------------------------------------------------------------ Button */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'soft' | 'ghost' | 'success';
  size?: 'default' | 'small' | 'tiny';
  /** Render the child element (e.g. a link) with button styling via Radix Slot. */
  asChild?: boolean;
};
/** Radix Slot-based button: one place for variants and sizes; `asChild` lends the styling to another element. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'default', size = 'default', asChild, className = '', type = 'button', ...props }, ref) {
  const Comp = asChild ? Slot : 'button';
  const classes = ['button', variant === 'soft' ? 'primary-soft' : variant !== 'default' ? variant : '', size !== 'default' ? size : '', className].filter(Boolean).join(' ');
  return <Comp ref={ref} className={classes} {...(asChild ? {} : { type })} {...props} />;
});

/* ------------------------------------------------------------------ Select */
// Radix Select reserves "" for "no value", so an "all" option is mapped through a sentinel.
const EMPTY = '__empty__';
export type Option = string | { value: string; label: ReactNode };
const norm = (o: Option) => (typeof o === 'string' ? { value: o, label: o } : o);
export function Select({ value, onValueChange, options, ariaLabel, placeholder, id, invalid, onBlur, className = '' }: { value: string; onValueChange: (v: string) => void; options: Option[]; ariaLabel?: string; placeholder?: string; id?: string; invalid?: boolean; onBlur?: () => void; className?: string }) {
  const items = options.map(norm);
  return (
    <SelectPrimitive.Root value={value === '' ? EMPTY : value} onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)} onOpenChange={(open) => { if (!open) onBlur?.(); }}>
      <SelectPrimitive.Trigger id={id} className={`select-trigger ${className}`} aria-label={ariaLabel} aria-invalid={invalid || undefined}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="select-icon"><ChevronDown size={14} /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="select-content" position="popper" sideOffset={4}>
          <SelectPrimitive.ScrollUpButton className="select-scroll"><ChevronUp size={14} /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {items.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value === '' ? EMPTY : o.value} className="select-item">
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="select-indicator"><Check size={13} /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll"><ChevronDown size={14} /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
/** Radix Select bound to a Formik field. */
export function FormikSelect({ name, options, ariaLabel, id }: { name: string; options: Option[]; ariaLabel?: string; id?: string }) {
  const [field, meta, helpers] = useField<string>(name);
  return <Select id={id} value={field.value ?? ''} options={options} ariaLabel={ariaLabel} invalid={meta.touched && !!meta.error} onValueChange={(v) => helpers.setValue(v)} onBlur={() => helpers.setTouched(true)} />;
}

/* ------------------------------------------------------------------ Checkbox */
export function Checkbox({ checked, onCheckedChange, label, id, title, className = '' }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; id: string; title?: string; className?: string }) {
  return (
    <span className={`checkbox-row ${className}`} title={title}>
      <CheckboxPrimitive.Root id={id} className="checkbox" checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)}>
        <CheckboxPrimitive.Indicator className="checkbox-indicator"><Check size={12} strokeWidth={3} /></CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={id}>{label}</label>
    </span>
  );
}

/* ------------------------------------------------------------------ Dropdown menu */
export type MenuEntry =
  | { label: string; icon?: LucideIcon; onSelect: () => void; shortcut?: string; disabled?: boolean; danger?: boolean; active?: boolean }
  | 'separator'
  | { heading: string }
  | { submenu: string; icon?: LucideIcon; items: MenuEntry[] };

/** Renders the same entries with either Radix ContextMenu or DropdownMenu primitives (identical part names). */
export function MenuEntries({ entries, P }: { entries: MenuEntry[]; P: typeof DropdownMenu | typeof import('@radix-ui/react-context-menu') }) {
  return (
    <>
      {entries.map((e, i) => {
        if (e === 'separator') return <P.Separator key={i} className="context-separator" />;
        if ('heading' in e) return <P.Label key={i} className="context-label">{e.heading}</P.Label>;
        if ('submenu' in e)
          return (
            <P.Sub key={i}>
              <P.SubTrigger className="context-item">
                {e.icon && <e.icon size={14} />}
                <span>{e.submenu}</span>
                <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
              </P.SubTrigger>
              <P.Portal>
                <P.SubContent className="context-menu" sideOffset={4}>
                  <MenuEntries entries={e.items} P={P} />
                </P.SubContent>
              </P.Portal>
            </P.Sub>
          );
        return (
          <P.Item key={i} className={`context-item ${e.danger ? 'danger' : ''} ${e.active ? 'active' : ''}`} disabled={e.disabled} onSelect={e.onSelect}>
            {e.icon && <e.icon size={14} />}
            <span>{e.label}</span>
            {e.shortcut && <kbd>{e.shortcut}</kbd>}
          </P.Item>
        );
      })}
    </>
  );
}
export function Dropdown({ entries, label, trigger, align = 'start', className = '' }: { entries: MenuEntry[]; label: string; trigger?: ReactNode; align?: 'start' | 'end'; className?: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <button className={`icon-button ${className}`} aria-label={label} title={label}>
            <MoreHorizontal size={15} />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="context-menu" align={align} sideOffset={4} aria-label={label} onClick={(e) => e.stopPropagation()}>
          <MenuEntries entries={entries} P={DropdownMenu} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
