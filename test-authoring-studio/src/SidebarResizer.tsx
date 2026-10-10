import { useRef, useState } from 'react';

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 520;
export const SIDEBAR_DEFAULT = 260;
const COLLAPSE_AT = 120;

/**
 * Drag handle on the sidebar's right edge (like the Claude desktop app):
 * col-resize cursor on hover, pointer-captured drag, snap-collapse when dragged nearly shut,
 * double-click to reset, arrow keys for keyboard resizing (Shift for bigger steps).
 */
export default function SidebarResizer({ width, onWidth, onCollapse, label = 'Resize sidebar' }: { width: number; onWidth: (w: number) => void; onCollapse?: () => void; label?: string }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));
  const end = () => {
    start.current = null;
    setDragging(false);
    document.documentElement.classList.remove('is-resizing');
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={`sidebar-resizer ${dragging ? 'dragging' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        setDragging(true);
        document.documentElement.classList.add('is-resizing');
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const next = start.current.w + (e.clientX - start.current.x);
        if (next < COLLAPSE_AT && onCollapse) {
          end();
          onCollapse();
          return;
        }
        onWidth(clamp(next));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => onWidth(SIDEBAR_DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft') { e.preventDefault(); onWidth(clamp(width - step)); }
        if (e.key === 'ArrowRight') { e.preventDefault(); onWidth(clamp(width + step)); }
        if (e.key === 'Home') { e.preventDefault(); onWidth(SIDEBAR_MIN); }
        if (e.key === 'End') { e.preventDefault(); onWidth(SIDEBAR_MAX); }
        if (e.key === 'Enter') { e.preventDefault(); onWidth(SIDEBAR_DEFAULT); }
      }}
    />
  );
}
