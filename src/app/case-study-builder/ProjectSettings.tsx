import { useRef } from 'react';
import { AppWindow, Ban, ImagePlus, Laptop, Monitor, Smartphone } from 'lucide-react';
import type { BuilderStudy } from './model';

/* The page-level inspector (nothing selected): visual choices instead of long dropdowns. */
type Hero = NonNullable<BuilderStudy['hero']>;
const SWATCHES = ['#c8553d', '#375c45', '#3d6b8c', '#0447ff', '#ff4704', '#6b5b95', '#000000'];

function Swatches({ value, onChange, allowNone, label }: { value?: string; onChange: (v?: string) => void; allowNone?: boolean; label: string }) {
  const custom = useRef<HTMLInputElement>(null);
  const v = (value || '').toLowerCase();
  const isPreset = SWATCHES.includes(v);
  return <div className="csb-ps-swatches" role="radiogroup" aria-label={label}>
    {allowNone && <button type="button" role="radio" aria-checked={!value} className="csb-ps-swatch is-none" onClick={() => onChange(undefined)} title="None"><i /></button>}
    {SWATCHES.map(c => <button key={c} type="button" role="radio" aria-checked={v === c} className="csb-ps-swatch" style={{ ['--sw' as string]: c }} onClick={() => onChange(c)} title={c}><i /></button>)}
    <button type="button" role="radio" aria-checked={!!value && !isPreset} className="csb-ps-swatch is-custom" style={!!value && !isPreset ? { ['--sw' as string]: value } : undefined} onClick={() => custom.current?.click()} title="Custom colour"><i /></button>
    <input ref={custom} type="color" className="csb-ps-color" value={/^#[\da-f]{6}$/i.test(value || '') ? value : '#888888'} onChange={e => onChange(e.target.value)} tabIndex={-1} aria-hidden="true" />
  </div>;
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ v: T; l: string; icon?: React.ReactNode; hint?: string }>; onChange: (v: T) => void; label: string }) {
  return <div className="csb-ps-seg" role="radiogroup" aria-label={label}>
    {options.map(o => <button key={o.v} type="button" role="radio" aria-checked={value === o.v} title={o.hint || o.l} onClick={() => onChange(o.v)}>{o.icon}<span>{o.l}</span></button>)}
  </div>;
}

export function ProjectSettings({ study, update, pickBgImage }: { study: BuilderStudy; update: (p: Partial<BuilderStudy>) => void; pickBgImage: () => void }) {
  const hero: Hero = { style: 'standard', bg: 'accent', frame: study.hero?.style === 'immersive' ? 'laptop' : 'none', ...study.hero };
  const setHero = (p: Partial<Hero>) => update({ hero: { ...hero, ...p } });
  return <div className="csb-ps" style={{ ['--ps-accent' as string]: study.accent }}>
    <section>
      <h3>Header</h3>
      <div className="csb-ps-tiles" role="radiogroup" aria-label="Header style">
        {([['standard', 'Standard', 'Title, then the hero image'], ['reveal', 'Title reveal', 'Image scrolls up over the title'], ['immersive', 'Full width', 'Colour band, image rises over it']] as const).map(([v, l, hint]) =>
          <button key={v} type="button" role="radio" aria-checked={hero.style === v} title={hint} onClick={() => setHero({ style: v })}>
            <span className={`csb-ps-pic is-${v}`} aria-hidden="true"><b /><i /></span><span>{l}</span>
          </button>)}
      </div>
      {hero.style === 'immersive' && <>
        <p className="csb-ps-label">Background</p>
        <div className="csb-ps-swatches" role="radiogroup" aria-label="Header background">
          {([['accent', 'Brand colour', study.accent], ['soft', 'Soft brand tint', `color-mix(in srgb, ${study.accent} 18%, #fdfcfc)`], ['paper', 'Paper', '#f5f3f1'], ['night', 'Night', '#161411']] as const).map(([v, l, c]) =>
            <button key={v} type="button" role="radio" aria-checked={hero.bg === v} className="csb-ps-swatch" style={{ ['--sw' as string]: c }} title={l} onClick={() => setHero({ bg: v })}><i /></button>)}
          <button type="button" role="radio" aria-checked={hero.bg === 'image'} className="csb-ps-swatch is-image" title="Image…" onClick={() => hero.bgImage ? setHero({ bg: 'image' }) : pickBgImage()} style={hero.bgImage ? { ['--img' as string]: `url(${hero.bgImage})` } : undefined}><i>{!hero.bgImage && <ImagePlus size={13} />}</i></button>
        </div>
        {hero.bg === 'image' && hero.bgImage && <button type="button" className="csb-link-button" onClick={() => setHero({ bg: 'accent', bgImage: undefined })}>Remove background image</button>}
      </>}
      <p className="csb-ps-label">Frame</p>
      <Seg label="Hero image frame" value={hero.frame} onChange={frame => setHero({ frame })} options={[
        { v: 'none', l: 'None', icon: <Ban size={15} strokeWidth={1.6} />, hint: hero.style === 'immersive' ? 'No frame: a transparent PNG floats' : 'No frame' },
        { v: 'phone', l: 'Phone', icon: <Smartphone size={15} strokeWidth={1.6} /> },
        { v: 'laptop', l: 'Laptop', icon: <Laptop size={15} strokeWidth={1.6} /> },
        { v: 'desktop', l: 'Desktop', icon: <Monitor size={15} strokeWidth={1.6} /> },
        { v: 'browser', l: 'Browser', icon: <AppWindow size={15} strokeWidth={1.6} /> },
      ]} />
      <p className="csb-ps-hint">Click the image in the header to add or replace your screen.</p>
    </section>

    <section>
      <h3>Style</h3>
      <div className="csb-ps-tiles is-two" role="radiogroup" aria-label="Page style">
        {([['editorial', 'Editorial', 'Warm paper, light headlines'], ['classic', 'Classic', 'Crisp white, bold headlines']] as const).map(([v, l, hint]) =>
          <button key={v} type="button" role="radio" aria-checked={(study.theme ?? 'editorial') === v} title={hint} onClick={() => update({ theme: v })}>
            <span className={`csb-ps-aa is-${v}`} aria-hidden="true">Aa</span><span>{l}</span>
          </button>)}
      </div>
      <p className="csb-ps-label">Motion</p>
      <Seg label="Motion" value={study.motion ?? 'expressive'} onChange={motion => update({ motion })} options={[{ v: 'calm', l: 'Calm', hint: 'Gentle fades only' }, { v: 'expressive', l: 'Expressive', hint: 'Scroll-driven charts and reveals' }]} />
    </section>

    <section>
      <h3>Colour</h3>
      <p className="csb-ps-label">Accent</p>
      <Swatches label="Accent colour" value={/^#[\da-f]{6}$/i.test(study.accent) ? study.accent : '#c8553d'} onChange={c => update({ accent: c ?? '#c8553d' })} />
      <p className="csb-ps-label">Second accent <small>optional, for text you style</small></p>
      <Swatches label="Second accent" allowNone value={study.accent2} onChange={c => update({ accent2: c })} />
    </section>

    <section>
      <h3>Page</h3>
      <label className="csb-ps-switch"><span>Side menu</span><input type="checkbox" role="switch" checked={study.showNav !== false} onChange={e => update({ showNav: e.target.checked })} /><i aria-hidden="true" /></label>
      <label className="csb-ps-address"><span className="csb-ps-label">Page address</span>
        <span className="csb-ps-url"><em>/</em><input value={study.slug} spellCheck={false} onChange={e => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} /></span>
      </label>
      <p className="csb-ps-hint">Used for the published link and the exported file name.</p>
    </section>
  </div>;
}
