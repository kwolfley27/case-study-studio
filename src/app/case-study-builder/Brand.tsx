import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { Media } from './Media';
import { useFonts } from './TypeSpecimen';
import type { CaseStudySection } from './model';

/*
  Brand identity: the logo, the typefaces and labeled color swatches, the way a brand board shows them.
  Everything lives in section.items, told apart by item.group:
    logo     – image = wordmark, detail = what it means, value = short notes (one per line)
    submark  – image = app icon / submark, value "dark" = sits on a dark tile
    font     – title = family (set in that font), detail = where it's used, font.weight = weight shown
    primary  – title = color name, value = hex (big swatches)
    state    – title = color name, value = hex (small swatches)
  options: typeNote (why these fonts), label:submark / label:primary / label:state (group headings),
           hideLogo / hideType / hidePrimary / hideState.
*/
type Item = CaseStudySection['items'][number];
export type BrandGroup = 'logo' | 'submark' | 'font' | 'primary' | 'state';
const LABELS: Record<string, string> = { submark: 'Submark', primary: 'Primary colors', state: 'State colors' };

export const defaultBrandItems = (): Item[] => [
  { group: 'logo', title: 'Logo', detail: 'What the mark stands for, and why it fits the product.', value: '', image: '' },
  { group: 'submark', title: 'Light', detail: '', value: '', image: '' },
  { group: 'submark', title: 'Dark', detail: '', value: 'dark', image: '' },
  { group: 'font', title: 'Poppins', detail: 'H1 Regular / H2 Regular', font: { family: 'Poppins', size: 40, weight: 500 } },
  { group: 'font', title: 'Inter', detail: 'H3 Bold / Body Regular', font: { family: 'Inter', size: 40, weight: 700 } },
  { group: 'primary', title: 'Primary', detail: '', value: '#FE8002' },
  { group: 'primary', title: 'Secondary', detail: '', value: '#39C24E' },
  { group: 'state', title: 'Error', detail: '', value: '#E32A26' },
  { group: 'state', title: 'Info', detail: '', value: '#31A2FF' },
  { group: 'state', title: 'Warning', detail: '', value: '#FF5100' },
  { group: 'state', title: 'Success', detail: '', value: '#4AC955' },
];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const normHex = (v: string) => { const m = v.trim().match(HEX); if (!m) return ''; const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]; return `#${h.toUpperCase()}`; };
// White or near-black text, whichever reads better on the swatch.
const inkOn = (hex: string) => {
  const h = normHex(hex); if (!h) return '#1c1917';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b < .45 ? '#fff' : '#1c1917';
};

export function Brand({ section, editorMode }: { section: CaseStudySection; editorMode: boolean }) {
  const o = section.options ?? {};
  const all = section.items.map((it, i) => ({ it, i }));
  const of = (g: BrandGroup) => all.filter(x => x.it.group === g);
  const label = (g: string) => <EditableText field={`options.label:${g}`} value={String(o[`label:${g}`] ?? LABELS[g])} />;
  const logo = of('logo')[0]; const subs = of('submark'); const fonts = of('font');
  useFonts(fonts.map(f => f.it.font?.family ?? f.it.title));
  const showLogo = !o.hideLogo && !!logo; const showType = !o.hideType && fonts.length > 0;

  const swatches = (g: 'primary' | 'state') => { const list = of(g); if (o[g === 'primary' ? 'hidePrimary' : 'hideState'] || !list.length) return null;
    return <div className={`csb-brand-colors is-${g}`}>
      <p className="csb-brand-label">{label(g)}</p>
      <div className="csb-brand-swatches" style={{ ['--n' as string]: list.length }}>
        {list.map(({ it, i }) => { const hex = normHex(it.value ?? '') || '#DDDDDD'; return <div key={i} className="csb-brand-swatch" style={{ background: hex, color: inkOn(hex) }}>
          <strong><EditableText field={`items.${i}.title`} value={it.title} /></strong>
          <span>{hex}</span>
        </div>; })}
      </div>
    </div>; };

  return <div className="csb-brand">
    {(showLogo || showType) && <div className={`csb-brand-cards ${showLogo && showType ? '' : 'is-single'}`}>
      {showLogo && <div className="csb-brand-card is-logo">
        <div className={`csb-brand-wordmark ${logo.it.image ? 'has-image' : ''}`} data-image-slot={`${section.id}:${logo.i}`}>
          {logo.it.image ? <Media src={logo.it.image} alt={`${logo.it.title || 'Brand'} logo`} loading="lazy" /> : editorMode ? <span className="csb-brand-empty"><ImagePlus size={18} strokeWidth={1.5} /> Add your logo</span> : null}
        </div>
        <p className="csb-brand-text"><EditableText field={`items.${logo.i}.detail`} value={logo.it.detail} /></p>
        {(editorMode || logo.it.value) && <ul className="csb-brand-notes">{(logo.it.value || '').split('\n').concat(editorMode ? [''] : []).filter((l, k, a) => l.trim() || (editorMode && k === a.length - 1)).map((line, k) =>
          <li key={k}><EditableText field={`items.${logo.i}.value.${k}`} value={line} /></li>)}</ul>}
        {subs.length > 0 && <div className="csb-brand-subs">
          <p className="csb-brand-label">{label('submark')}</p>
          <div className="csb-brand-sub-row">{subs.map(({ it, i }) => <div key={i} className={`csb-brand-sub ${it.value === 'dark' ? 'is-dark' : ''} ${it.image ? 'has-image' : ''}`} data-image-slot={`${section.id}:${i}`}>
            {it.image ? <Media src={it.image} alt={`${it.title || 'Submark'}`} loading="lazy" /> : editorMode ? <ImagePlus size={18} strokeWidth={1.5} aria-label="Add submark" /> : null}
          </div>)}</div>
        </div>}
      </div>}
      {showType && <div className="csb-brand-card is-type">
        {fonts.map(({ it, i }) => { const fam = it.font?.family || it.title; return <div key={i} className="csb-brand-font">
          <h3 style={{ ['--bf' as string]: `"${fam}",system-ui,sans-serif`, ['--bw' as string]: it.font?.weight ?? 500 }}>{fam}</h3>
          <p><EditableText field={`items.${i}.detail`} value={it.detail} /></p>
        </div>; })}
        {(editorMode || o.typeNote) && <p className="csb-brand-text"><EditableText field="options.typeNote" value={String(o.typeNote ?? '')} /></p>}
      </div>}
    </div>}
    {swatches('primary')}
    {swatches('state')}
  </div>;
}

export function BrandControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const items = section.items; const o = section.options ?? {};
  const setItem = (i: number, patch: Partial<Item>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  const remove = (i: number) => onChange({ items: items.filter((_, k) => k !== i) });
  const add = (item: Item) => { const at = items.map(x => x.group).lastIndexOf(item.group); const next = [...items]; next.splice(at < 0 ? next.length : at + 1, 0, item); onChange({ items: next }); };
  const list = (g: BrandGroup) => items.map((it, i) => ({ it, i })).filter(x => x.it.group === g);
  const show: Array<[string, string]> = [['hideLogo', 'Logo'], ['hideType', 'Type'], ['hidePrimary', 'Primary colors'], ['hideState', 'State colors']];

  const colorGroup = (g: 'primary' | 'state') => <div className="csb-tsc-card">
    <div className="csb-tsc-top"><input className="csb-tsc-name" aria-label="Group name" value={String(o[`label:${g}`] ?? LABELS[g])} onChange={e => onChange({ options: { ...o, [`label:${g}`]: e.target.value } })} /></div>
    {list(g).map(({ it, i }) => { const hex = normHex(it.value ?? ''); return <div key={i} className="csb-brand-ctl-row">
      <input type="color" aria-label={`${it.title} color`} value={(hex || '#dddddd').toLowerCase()} onChange={e => setItem(i, { value: e.target.value.toUpperCase() })} />
      <input className="csb-brand-ctl-name" aria-label="Color name" value={it.title} onChange={e => setItem(i, { title: e.target.value })} />
      <input className="csb-brand-ctl-hex" aria-label="Hex" value={it.value ?? ''} onChange={e => setItem(i, { value: e.target.value })} onBlur={e => { const h = normHex(e.target.value); if (h) setItem(i, { value: h }); }} />
      <button type="button" className="csb-tsc-del" aria-label={`Remove ${it.title}`} onClick={() => remove(i)}><Trash2 size={13} /></button>
    </div>; })}
    <button type="button" className="csb-quiet-button" onClick={() => add({ group: g, title: 'New color', detail: '', value: '#888888' })}><Plus size={13} /> Add a color</button>
  </div>;

  return <div className="csb-tsc">
    <div className="csb-sb-row"><span className="csb-sb-label">Show</span>
      <div className="csb-sb-chips" role="group" aria-label="Parts to show">{show.map(([k, l]) => <button key={k} type="button" aria-pressed={!o[k]} onClick={() => onChange({ options: { ...o, [k]: !o[k] } })}>{l}</button>)}</div>
    </div>
    <div className="csb-tsc-head"><span className="csb-sb-label">Colors</span><small>Name each color and pick it, or paste a hex code. Click a name on the page to rename it there.</small></div>
    {colorGroup('primary')}
    {colorGroup('state')}
    <div className="csb-tsc-head"><span className="csb-sb-label">Typefaces</span><small>Any Google Font name works.</small></div>
    {list('font').map(({ it, i }) => <div key={i} className="csb-tsc-card">
      <div className="csb-tsc-top">
        <input className="csb-tsc-name" aria-label="Font family" value={it.font?.family ?? it.title} style={{ fontFamily: `"${it.font?.family ?? it.title}",system-ui` }} onChange={e => setItem(i, { title: e.target.value, font: { size: 40, weight: 500, ...it.font, family: e.target.value } })} />
        <button type="button" className="csb-tsc-del" aria-label={`Remove ${it.title}`} onClick={() => remove(i)}><Trash2 size={13} /></button>
      </div>
      <label className="csb-tsc-field"><span>Used for</span><input value={it.detail} onChange={e => setItem(i, { detail: e.target.value })} /></label>
      <label className="csb-tsc-field"><span>Weight shown</span><select value={it.font?.weight ?? 500} onChange={e => setItem(i, { font: { size: 40, family: it.title, ...it.font, weight: Number(e.target.value) } })}>{[300, 400, 500, 600, 700, 800].map(w => <option key={w} value={w}>{w}</option>)}</select></label>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => add({ group: 'font', title: 'Inter', detail: 'Body Regular', font: { family: 'Inter', size: 40, weight: 500 } })}><Plus size={13} /> Add a typeface</button>
    <div className="csb-tsc-head"><span className="csb-sb-label">Submarks</span><small>Click a tile on the page to add the image.</small></div>
    {list('submark').map(({ it, i }, k) => <div key={i} className="csb-brand-ctl-row">
      <span style={{ flex: 1, fontSize: 13 }}>Submark {k + 1}</span>
      <div className="csb-sb-chips" role="group" aria-label="Tile"><button type="button" aria-pressed={it.value !== 'dark'} onClick={() => setItem(i, { value: '' })}>Light</button><button type="button" aria-pressed={it.value === 'dark'} onClick={() => setItem(i, { value: 'dark' })}>Dark</button></div>
      <button type="button" className="csb-tsc-del" aria-label="Remove submark" onClick={() => remove(i)}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => add({ group: 'submark', title: 'Submark', detail: '', value: '', image: '' })}><Plus size={13} /> Add a submark</button>
    {!list('logo').length && <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [{ group: 'logo', title: 'Logo', detail: '', value: '', image: '' }, ...items] })}><Plus size={13} /> Add a logo card</button>}
  </div>;
}
