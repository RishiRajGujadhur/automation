import { registerRider } from './rider/commands';
import { clearNotices } from './rider/notifications';
import { setViewOptions, viewOptions } from './editor/viewOptions';

/** Opens (true), hides (false) or toggles the Notification Center (the shell listens). */
export const NOTIFICATION_CENTER_EVENT = 'tas:notification-center';
const center = (open?: boolean) => window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_EVENT, { detail: open }));
const toasts = () => [...document.querySelectorAll<HTMLElement>('.notification-toast')];
/** The newest toast's primary action (Undo, Cancel…): VS Code's Accept Notification Primary Action. */
export function acceptPrimaryAction() {
  const t = toasts().at(-1);
  const b = t?.querySelector<HTMLButtonElement>('.notification-button:not(.secondary)') ?? t?.querySelector<HTMLButtonElement>('.notification-button');
  if (!b) return false;
  b.click();
  return true;
}

/** VS Code's Notifications commands (VSCODE-250.md W39). */
registerRider([
  { id: 'notifications-show', label: 'Notifications: Show Notifications', menu: 'View', run: () => center(true) },
  { id: 'notifications-hide', label: 'Notifications: Hide Notifications', menu: 'View', run: () => center(false) },
  { id: 'notifications-clear', label: 'Notifications: Clear All Notifications', menu: 'View', run: () => { clearNotices(); toasts().forEach((t) => t.querySelector<HTMLButtonElement>('.toast-close')?.click()); } },
  { id: 'notifications-dnd', label: 'Notifications: Toggle Do Not Disturb Mode', menu: 'View', checked: () => !!viewOptions().doNotDisturb, run: () => setViewOptions({ doNotDisturb: !viewOptions().doNotDisturb }) },
  { id: 'notifications-focus', label: 'Notifications: Focus Notification Toast', menu: 'View', run: () => setTimeout(() => toasts().at(-1)?.querySelector<HTMLElement>('button')?.focus(), 50) },
  { id: 'notifications-accept', label: 'Notifications: Accept Notification Primary Action', menu: 'View', shortcut: 'Ctrl+Shift+A', run: () => { acceptPrimaryAction(); } },
]);

// Ctrl+Shift+A accepts a toast's primary action while one with an action is up (VS Code's notificationToastsVisible).
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'a') return;
  if (!toasts().some((t) => t.querySelector('.notification-button:not(.secondary)'))) return;
  e.preventDefault();
  e.stopPropagation();
  acceptPrimaryAction();
}, true);
