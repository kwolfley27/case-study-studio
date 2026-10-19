import { useEffect, useState } from 'react';
import type { TextStyle } from './EditableText';
import { ColorDots } from './ColorDots';

/*
  Floating toolbar for the text you're editing. Only design tokens are offered:
  colour (default, ink, muted, accent, accent 2), size steps relative to the
  element (S, M, L, XL) and weight (light, regular, bold).
*/

type Target = { sectionId: string; field: string; rect: DOMRect };

const tones: Array<[TextStyle['tone'] | undefined, string, string]> = [[undefined, 'Default', 'currentColor'], ['ink', 'Ink', 'var(--t-ink,#1d1d1f)'], ['muted', 'Muted', 'var(--t-muted,#86868b)'], ['accent', 'Accent', 'var(--csb-accent)'], ['accent2', 'Accent 2', 'var(--csb-accent-2,var(--csb-accent))']];
const sizes: Array<[TextStyle['size'] | undefined, string]> = [['s', 'S'], [undefined, 'M'], ['l', 'L'], ['xl', 'XL']];
const weights: Array<[TextStyle['weight'] | undefined, string]> = [['light', 'Light'], [undefined, 'Auto'], ['bold', 'Bold']];

export function TextStyleBar({ accent, accent2, enabled, styleOf, onStyle, colors }: { accent?: string; accent2?: string; colors?: { ink: string; muted: string; accent: string; accent2: string }; enabled: boolean; styleOf: (sectionId: string, field: string) => TextStyle | undefined; onStyle: (sectionId: string, field: string, patch: TextStyle) => void }) {
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!enabled) { setTarget(null); return; }
    let current: HTMLElement | null = null;
    const locate = (el: HTMLElement) => {
      const section = el.closest('[id^="builder-section-"]');
      const field = el.dataset.field;
      if (!section || !field || !el.closest('.csb-preview-viewport')) return null;
      return { sectionId: section.id.replace('builder-section-', ''), field, rect: el.getBoundingClientRect() };
    };
    const onFocus = (event: FocusEvent) => { const el = (event.target as HTMLElement)?.closest?.('.csb-editable-text') as HTMLElement | null; if (!el) return; current = el; setTarget(locate(el)); };
    const onBlur = () => window.setTimeout(() => { const active = document.activeElement as HTMLElement | null; if (!active?.closest('.csb-editable-text, .csb-textbar')) { current = null; setTarget(null); } }, 0);
    const reposition = () => { if (current && document.contains(current)) setTarget(locate(current)); };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur); window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true); };
  }, [enabled]);

  if (!target) return null;
  const style = styleOf(target.sectionId, target.field) ?? {};
  const set = (patch: TextStyle) => onStyle(target.sectionId, target.field, patch);
  // Read the real colours from the page so the swatches match what you'll get.
  const page = document.querySelector('.csb-preview-viewport .csb-canvas'); const css = page ? getComputedStyle(page) : null;
  const read = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  const swatch = { ink: colors?.ink || read('--t-ink', '#1d1d1f'), muted: colors?.muted || read('--t-muted', '#86868b'), accent: colors?.accent || read('--csb-accent', '#c8553d'), accent2: colors?.accent2 || read('--csb-accent-2', read('--csb-accent', '#c8553d')) };
  const keep = (event: React.MouseEvent) => event.preventDefault(); // keep the caret in the text
  const top = target.rect.top > 70 ? target.rect.top - 48 : target.rect.bottom + 8;
  const left = Math.max(8, Math.min(window.innerWidth - 420, target.rect.left));

  return <div className="csb-textbar" role="toolbar" aria-label="Text style" style={{ top, left }} onMouseDown={keep}>
    <div className="csb-textbar-group" aria-label="Colour"><ColorDots compact label="Text colour" value={style.tone ?? ''} onChange={v => set({ tone: (v || undefined) as TextStyle['tone'] })} options={[
      { value: '', label: 'Default', color: 'linear-gradient(135deg,#f5f5f7 50%,#86868b 50%)' },
      { value: 'ink', label: 'Black', color: swatch.ink },
      { value: 'muted', label: 'Grey', color: swatch.muted },
      { value: 'paper', label: 'White', color: '#ffffff' },
      { value: 'accent', label: 'Accent', color: accent || swatch.accent },
      ...(accent2 ? [{ value: 'accent2', label: 'Accent 2', color: accent2 }] : []),
    ]} /></div>
    <span className="csb-textbar-sep" />
    <div className="csb-textbar-group" aria-label="Size">{sizes.map(([size, label]) => <button key={label} type="button" aria-label={`Size ${label}`} aria-pressed={style.size === size} onClick={() => set({ size })}>{label}</button>)}</div>
    <span className="csb-textbar-sep" />
    <div className="csb-textbar-group" aria-label="Weight">{weights.map(([weight, label]) => <button key={label} type="button" aria-label={`Weight ${label}`} aria-pressed={style.weight === weight} onClick={() => set({ weight })}>{label}</button>)}</div>
  </div>;
}
