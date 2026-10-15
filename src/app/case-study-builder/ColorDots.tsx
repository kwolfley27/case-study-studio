import { useRef } from 'react';

/*
  The one colour picker used everywhere in the editor: a row of round swatches,
  the chosen colour's name written next to them, and an optional custom colour.
  Swatches are real colours (passed in), never CSS variables, so what you see in the
  panel is exactly what lands on the page.
*/
export type ColorOption = { value: string; label: string; color: string; none?: boolean };

export function ColorDots({ options, value, onChange, custom, label, compact }: { options: ColorOption[]; value: string; onChange: (v: string) => void; custom?: boolean; label: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const isCustom = custom && value.startsWith('#') && !options.some(o => o.value.toLowerCase() === value.toLowerCase());
  const current = isCustom ? 'Custom' : options.find(o => o.value === value)?.label ?? '';
  return <div className={`csb-colors ${compact ? 'is-compact' : ''}`} role="radiogroup" aria-label={label}>
    {options.map(o => <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={o.label} title={o.label}
      className={`csb-colors-dot ${o.none ? 'is-none' : ''}`} style={{ ['--sw' as string]: o.color }} onMouseDown={e => e.preventDefault()} onClick={() => onChange(o.value)}><i /></button>)}
    {custom && <>
      <button type="button" role="radio" aria-checked={!!isCustom} aria-label="Custom colour" title="Custom colour" className="csb-colors-dot is-custom" style={isCustom ? { ['--sw' as string]: value } : undefined} onClick={() => input.current?.click()}><i /></button>
      <input ref={input} type="color" className="csb-colors-input" value={/^#[\da-f]{6}$/i.test(value) ? value : '#888888'} onChange={e => onChange(e.target.value)} tabIndex={-1} aria-hidden="true" />
    </>}
    {!compact && current && <span className="csb-colors-name">{current}</span>}
  </div>;
}

/* Black or white text, whichever reads better on a colour. */
export function inkOn(hex: string) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim()); if (!m) return '#fdfcfc';
  const [r, g, b] = m.slice(1).map(x => { const c = parseInt(x, 16) / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b > .45 ? '#000000' : '#fdfcfc';
}

/* Bubble colours: ink, the page accents, warm grey, or custom. Stored as a real hex with its text colour. */
export function bubbleOptions(accent: string, accent2?: string): ColorOption[] {
  return [
    { value: '#000000', label: 'Black', color: '#000000' },
    { value: '#ebe8e4', label: 'Warm grey', color: '#ebe8e4' },
    { value: accent, label: 'Accent', color: accent },
    ...(accent2 && accent2.toLowerCase() !== accent.toLowerCase() ? [{ value: accent2, label: 'Accent 2', color: accent2 }] : []),
  ];
}
