import { useRef, useState } from 'react';

/**
 * VS Code's sash on the panel's inner edge: drag to resize the panel (its height at the bottom, its width on the left
 * or right), double-click or Enter to go back to the default size, arrow keys to nudge. `size` 0 means the default.
 */
export default function PanelSash({ side, size, onSize, panel }: {
  side: 'bottom' | 'left' | 'right';
  size: number;
  onSize: (px: number) => void;
  /** The panel element (its size when a drag starts from the default). */
  panel: () => HTMLElement | null;
}) {
  const start = useRef<{ at: number; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const vertical = side !== 'bottom';
  const max = () => Math.round((vertical ? window.innerWidth : window.innerHeight) * 0.85);
  const clamp = (px: number) => Math.min(max(), Math.max(vertical ? 200 : 100, Math.round(px)));
  const current = () => size || (vertical ? panel()?.offsetWidth : panel()?.offsetHeight) || 260;
  const end = () => { start.current = null; setDragging(false); document.documentElement.classList.remove('is-resizing'); };
  // Growing the panel: up at the bottom, left for a panel on the right, right for one on the left.
  const grow = (from: number, to: number) => (side === 'bottom' || side === 'right' ? from - to : to - from);
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label="Resize panel"
      aria-valuenow={current()}
      tabIndex={0}
      title="Drag to resize the panel · double-click to reset"
      className={`panel-sash panel-sash-${side} ${dragging ? 'dragging' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { at: vertical ? e.clientX : e.clientY, size: current() };
        setDragging(true);
        document.documentElement.classList.add('is-resizing');
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onSize(clamp(start.current.size + grow(start.current.at, vertical ? e.clientX : e.clientY)));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => onSize(0)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 60 : 20;
        const keys: Record<string, number> = vertical
          ? { ArrowLeft: side === 'right' ? step : -step, ArrowRight: side === 'right' ? -step : step }
          : { ArrowUp: step, ArrowDown: -step };
        if (e.key in keys) { e.preventDefault(); onSize(clamp(current() + keys[e.key])); }
        if (e.key === 'Enter') { e.preventDefault(); onSize(0); }
      }}
    />
  );
}
