import { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { PROMOTE_EVENT, type Promotion } from './commands';

const OFF = 'tas:rider:keyPromoterOff';
export const keyPromoterOn = () => { try { return localStorage.getItem(OFF) !== '1'; } catch { return true; } };
export const setKeyPromoter = (on: boolean) => { try { if (on) localStorage.removeItem(OFF); else localStorage.setItem(OFF, '1'); } catch { /* storage blocked */ } };

/** Key Promoter (Rider): a command run from a menu or the palette shows its shortcut for a few seconds. */
export default function KeyPromoter() {
  const [shown, setShown] = useState<Promotion | null>(null);
  useEffect(() => {
    let t = 0;
    const h = (e: Event) => {
      if (!keyPromoterOn()) return;
      setShown((e as CustomEvent<Promotion>).detail);
      clearTimeout(t);
      t = window.setTimeout(() => setShown(null), 6000);
    };
    window.addEventListener(PROMOTE_EVENT, h);
    return () => { clearTimeout(t); window.removeEventListener(PROMOTE_EVENT, h); };
  }, []);
  if (!shown) return null;
  return (
    <aside className="key-promoter" role="status" aria-label="Key Promoter">
      <Keyboard size={16} aria-hidden="true" />
      <div>
        <strong>{shown.label.replace(/…$/, '')}</strong> <kbd>{shown.shortcut}</kbd>
        <small>Used {shown.times} time{shown.times === 1 ? '' : 's'} without the shortcut.</small>
      </div>
      <button className="icon-button" aria-label="Dismiss" onClick={() => setShown(null)}><X size={13} /></button>
    </aside>
  );
}
