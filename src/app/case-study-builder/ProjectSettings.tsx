import { useRef } from 'react';
import { AppWindow, Ban, ImagePlus, Laptop, Monitor, Smartphone } from 'lucide-react';
import { heroFacts, type BuilderStudy } from './model';
import { SPOT_DEFAULT } from './HeroSpot';
import { X } from 'lucide-react';
import { ColorDots, type ColorOption } from './ColorDots';

/* The page-level inspector (nothing selected): visual choices instead of long dropdowns. */
type Hero = NonNullable<BuilderStudy['hero']>;
const SWATCHES = ['#c8553d', '#375c45', '#3d6b8c', '#0447ff', '#ff4704', '#6b5b95', '#000000'];

export const GRAD_KINDS: Array<[string, string, string]> = [
  ['charts', 'Charts and numbers', 'Bars, rings, arcs, radar, meters'],
  ['marks', 'Highlighted words', 'The problem statement highlights'],
  ['lines', 'Lines and progress', 'Journey and flow lines, side menu, progress'],
  ['dots', 'Dots, pins and buttons', 'Annotation pins, play buttons, markers'],
  ['type', 'Display type', 'The big “Aa” in the type system'],
];

const SWATCH_NAMES: Record<string, string> = { '#c8553d': 'Terracotta', '#375c45': 'Forest', '#3d6b8c': 'Slate blue', '#0447ff': 'Blue', '#ff4704': 'Orange', '#6b5b95': 'Violet', '#000000': 'Black' };
export function Swatches({ value, onChange, allowNone, label }: { value?: string; onChange: (v?: string) => void; allowNone?: boolean; label: string }) {
  const options: ColorOption[] = [...(allowNone ? [{ value: '', label: 'None', color: '#fff', none: true }] : []), ...SWATCHES.map(c => ({ value: c, label: SWATCH_NAMES[c] ?? c, color: c }))];
  return <ColorDots label={label} options={options} value={(value || '').toLowerCase()} onChange={v => onChange(v || undefined)} custom />;
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ v: T; l: string; icon?: React.ReactNode; hint?: string }>; onChange: (v: T) => void; label: string }) {
  return <div className="csb-ps-seg" role="radiogroup" aria-label={label}>
    {options.map(o => <button key={o.v} type="button" role="radio" aria-checked={value === o.v} title={o.hint || o.l} onClick={() => onChange(o.v)}>{o.icon}<span>{o.l}</span></button>)}
  </div>;
}

export function ProjectSettings({ study, update, pickBgImage, onPickGradient }: { study: BuilderStudy; update: (p: Partial<BuilderStudy>) => void; pickBgImage: () => void; onPickGradient?: () => void }) {
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
        { v: 'phone', l: 'iPhone', icon: <Smartphone size={15} strokeWidth={1.6} /> },
        { v: 'laptop', l: 'MacBook', icon: <Laptop size={15} strokeWidth={1.6} /> },
        { v: 'desktop', l: 'iMac', icon: <Monitor size={15} strokeWidth={1.6} /> },
        { v: 'browser', l: 'Browser', icon: <AppWindow size={15} strokeWidth={1.6} /> },
      ]} />
      <p className="csb-ps-hint">Click the image in the header to add or replace your screen.</p>

      <label className="csb-ps-switch"><span>Spotlight<small>Lift one part of the screen out, larger, on top</small></span><input type="checkbox" role="switch" checked={!!study.heroSpot?.on} onChange={e => update({ heroSpot: { ...SPOT_DEFAULT, ...study.heroSpot, on: e.target.checked } })} /><i aria-hidden="true" /></label>
      {study.heroSpot?.on && <div className="csb-ps-sub">
        <label className="csb-ps-check"><input type="checkbox" checked={study.heroSpot.dim !== false} onChange={e => update({ heroSpot: { ...SPOT_DEFAULT, ...study.heroSpot, dim: e.target.checked } })} /><span>Dim the screen behind<small>So the highlighted part stands out</small></span></label>
        <label className="csb-ps-check"><input type="checkbox" checked={!!study.heroSpot.ring} onChange={e => update({ heroSpot: { ...SPOT_DEFAULT, ...study.heroSpot, ring: e.target.checked } })} /><span>Mark where it lives<small>A soft ring on the screen, joined to the card</small></span></label>
        <label className="csb-ps-field"><span className="csb-ps-label">Describe the image <small>for screen readers</small></span><input value={study.heroSpot.alt ?? ''} placeholder="Comment nudge: Turn your comments into edits" onChange={e => update({ heroSpot: { ...SPOT_DEFAULT, ...study.heroSpot, alt: e.target.value } })} /></label>
        <p className="csb-ps-hint">On the page: click the card to add the image (paste a Figma frame or upload). Drag to move it, drag its corner to resize.{study.heroSpot.image ? '' : ' Tip: crop just the component in Figma first.'}</p>
        {study.heroSpot.image && <button type="button" className="csb-link-button" onClick={() => update({ heroSpot: { ...SPOT_DEFAULT, ...study.heroSpot, image: undefined } })}>Remove the spotlight image</button>}
      </div>}
    </section>

    <section>
      <h3>Details under the title</h3>
      <div className="csb-ps-facts">
        {heroFacts(study).map((f, i, all) => <div key={i} className="csb-ps-fact">
          <input aria-label={`Detail ${i + 1} label`} value={f.label} placeholder="Label" onChange={e => update({ facts: all.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })} />
          <input aria-label={`Detail ${i + 1} value`} value={f.value} placeholder="Add a value" onChange={e => update({ facts: all.map((x, k) => k === i ? { ...x, value: e.target.value } : x) })} />
          <button type="button" aria-label={`Remove ${f.label || 'detail'}`} onClick={() => update({ facts: all.filter((_, k) => k !== i) })}><X size={14} /></button>
        </div>)}
      </div>
      {heroFacts(study).length < 4 && <div className="csb-ps-chips" aria-label="Add a detail">
        {['Role', 'Team', 'Timeline', 'Status', 'Company', 'Platform', 'Tools'].filter(l => !heroFacts(study).some(f => f.label.toLowerCase() === l.toLowerCase())).map(l => <button key={l} type="button" onClick={() => update({ facts: [...heroFacts(study), { label: l, value: '' }] })}>+ {l}</button>)}
      </div>}
      <p className="csb-ps-hint">Up to four. Empty ones don’t show on the page. Hiring managers look for role, team, timeline and whether it shipped.</p>
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
      <div className="csb-ps-seg" role="radiogroup" aria-label="Accent style" style={{ marginTop: 10 }}>
        {([[false, 'Solid'], [true, 'Gradient']] as const).map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={!!study.accentGradient === v} onClick={() => update(v ? { accentGradient: true, accent2: study.accent2 || '#6c4cff' } : { accentGradient: false })}><span>{l}</span></button>)}
      </div>
      {study.accentGradient && <div className="csb-ps-grad" style={{ background: `linear-gradient(120deg, ${study.accent}, ${study.accent2 || '#6c4cff'})` }} aria-hidden="true" />}
      {study.accentGradient && <div className="csb-ps-gradon" role="group" aria-label="Use the gradient on">
        <p className="csb-ps-label">Use the gradient on</p>
        {GRAD_KINDS.map(([k, l, hint]) => { const on = !(study.gradientOff ?? []).includes(k); return <label key={k} className="csb-ps-check" title={hint}><input type="checkbox" checked={on} onChange={e => update({ gradientOff: e.target.checked ? (study.gradientOff ?? []).filter(x => x !== k) : [...(study.gradientOff ?? []), k] })} /><span>{l}<small>{hint}</small></span></label>; })}
        <button type="button" className="csb-ps-pick" onClick={onPickGradient}>Choose single elements on the page…</button>
        <p className="csb-ps-hint">Anything unticked uses the solid accent. To keep one bar, ring or dot solid, choose it on the page.{(study.gradOffEls?.length ?? 0) > 0 ? ` ${study.gradOffEls!.length} element${study.gradOffEls!.length === 1 ? ' is' : 's are'} solid now.` : ''}</p>
      </div>}
      <p className="csb-ps-label">{study.accentGradient ? 'Gradient to' : <>Second accent <small>optional, for text you style</small></>}</p>
      <Swatches label={study.accentGradient ? 'Gradient end colour' : 'Second accent'} allowNone={!study.accentGradient} value={study.accent2} onChange={c => update({ accent2: c })} />
    </section>

    <section>
      <h3>Page</h3>
      <p className="csb-ps-label">Device mockups</p>
      <Seg label="Device mockups" value={study.deviceStyle ?? 'framed'} onChange={deviceStyle => update({ deviceStyle })} options={[{ v: 'framed', l: 'With hardware', hint: 'Phones, laptops and tablets with their bezels' }, { v: 'frameless', l: 'Frameless', hint: 'Just the rounded screen with a soft shadow' }]} />
      <label className="csb-ps-switch"><span>Side menu</span><input type="checkbox" role="switch" checked={study.showNav !== false} onChange={e => update({ showNav: e.target.checked })} /><i aria-hidden="true" /></label>
      <label className="csb-ps-address"><span className="csb-ps-label">Page address</span>
        <span className="csb-ps-url"><em>/</em><input value={study.slug} spellCheck={false} onChange={e => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} /></span>
      </label>
      <p className="csb-ps-hint">Used for the published link and the exported file name.</p>
    </section>
  </div>;
}
