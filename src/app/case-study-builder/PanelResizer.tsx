import { useEffect, useState } from 'react';

/*
  Drag the inner edge of a floating panel to make it wider or narrower.
  The width is kept per panel in localStorage and set as a CSS variable on the app
  (--csb-left-w / --csb-right-w). Double-click the edge to go back to the default.
*/
export const PANEL_DEFAULTS = { left: 300, right: 600 } as const;
const LIMITS = { left: [240, 560], right: [320, 900] } as const;
const KEY = (side: 'left' | 'right') => `csb-panel-w-${side}`;

const read = (side: 'left' | 'right') => {
  try { const n = Number(localStorage.getItem(KEY(side))); if (n) return n; } catch { /* storage off */ }
  return PANEL_DEFAULTS[side];
};
const clamp = (side: 'left' | 'right', n: number) => Math.round(Math.min(Math.min(LIMITS[side][1], window.innerWidth * .6), Math.max(LIMITS[side][0], n)));

export function usePanelWidths() {
  const [left, setLeft] = useState(() => read('left'));
  const [right, setRight] = useState(() => read('right'));
  useEffect(() => { try { localStorage.setItem(KEY('left'), String(left)); localStorage.setItem(KEY('right'), String(right)); } catch { /* storage off */ } }, [left, right]);
  return { left, right, setLeft, setRight };
}

export function PanelResizer({ side, width, onWidth }: { side: 'left' | 'right'; width: number; onWidth: (n: number) => void }) {
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX; const w0 = width;
    document.body.classList.add('csb-resizing');
    const move = (ev: PointerEvent) => onWidth(clamp(side, w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX)));
    const up = () => { document.body.classList.remove('csb-resizing'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10; const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'; const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === grow) { e.preventDefault(); onWidth(clamp(side, width + step)); }
    if (e.key === shrink) { e.preventDefault(); onWidth(clamp(side, width - step)); }
  };
  return <div className={`csb-panel-resize is-${side}`} role="separator" aria-orientation="vertical" aria-label={`Resize ${side === 'left' ? 'sections' : 'design'} panel`} aria-valuenow={width} aria-valuemin={LIMITS[side][0]} aria-valuemax={LIMITS[side][1]} tabIndex={0}
    title="Drag to resize · double-click to reset" onPointerDown={start} onKeyDown={key} onDoubleClick={() => onWidth(PANEL_DEFAULTS[side])} />;
}
