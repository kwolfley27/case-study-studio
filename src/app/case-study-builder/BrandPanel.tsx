import { useRef, useState } from 'react';
import { FileJson, Figma, ImageIcon, Trash2, X } from 'lucide-react';
import { brandFromFigma, defaultBrand, fontChoices, loadFont, paletteFromImage, parseTokensFile, suggestBrand, type Brand, type SavedBrand, type Suggestion } from './brand';
import { getFigmaToken, setFigmaToken } from './ImageSlots';
import type { BuilderStudy } from './model';

const KEY = 'csb-brand-styles';
const readSaved = (): SavedBrand[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeSaved = (list: SavedBrand[]) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };

export function BrandPanel({ study, onChange, onClose, notify }: { study: BuilderStudy; onChange: (patch: Partial<BuilderStudy>) => void; onClose: () => void; notify: (text: string, error?: boolean) => void }) {
  const brand: Brand = { ...defaultBrand, ...(study.brand ?? {}) };
  const [saved, setSaved] = useState<SavedBrand[]>(readSaved);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'figma' | null>(null);
  const [link, setLink] = useState('');
  const [token, setToken] = useState(getFigmaToken());
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const imageRef = useRef<HTMLInputElement>(null);
  const tokensRef = useRef<HTMLInputElement>(null);

  const setBrand = (patch: Partial<Brand>) => { if (patch.display) loadFont(patch.display); if (patch.text) loadFont(patch.text); onChange({ brand: { ...brand, ...patch } }); };
  const apply = (s: Suggestion, source: string) => {
    const patch = Object.fromEntries(Object.entries(s.brand).filter(([, v]) => v !== undefined && v !== '')) as Partial<Brand>;
    if (patch.display) loadFont(patch.display); if (patch.text) loadFont(patch.text);
    onChange({ brand: { ...brand, ...patch }, ...(s.accent ? { accent: s.accent } : {}), ...(s.accent2 ? { accent2: s.accent2 } : {}) });
    setFound(s.palette);
    const parts = [s.accent && 'accent', s.accent2 && 'second accent', patch.paper && 'background', patch.ink && 'text colour', patch.display && `“${patch.display}” headlines`].filter(Boolean);
    notify(`Brand updated from ${source}: ${parts.join(', ') || 'colours'}. Adjust anything below, then save it as a style.`);
  };
  const run = async (task: () => Promise<void>) => { setBusy(true); try { await task(); } catch (error) { notify(error instanceof Error ? error.message : 'Could not read that.', true); } finally { setBusy(false); } };

  const fromFigma = () => run(async () => {
    if (token.trim()) setFigmaToken(token);
    if (!getFigmaToken()) throw new Error('Add your Figma access token first.');
    const { swatches, fonts } = await brandFromFigma(link, getFigmaToken());
    apply(suggestBrand(swatches, fonts), 'Figma'); setMode(null);
  });
  const fromImage = (file?: File) => file && run(async () => apply(suggestBrand(await paletteFromImage(file)), 'your image'));
  const fromTokens = (file?: File) => file && run(async () => { const { swatches, fonts } = parseTokensFile(await file.text()); apply(suggestBrand(swatches, fonts), file.name); });

  const save = () => {
    const entry: SavedBrand = { ...brand, id: crypto.randomUUID(), name: name.trim() || `Brand ${saved.length + 1}`, accent: study.accent, accent2: study.accent2, theme: study.theme };
    const next = [entry, ...saved]; setSaved(next); writeSaved(next); setName(''); notify(`Saved “${entry.name}”. Apply it to any case study from this panel.`);
  };
  const use = (s: SavedBrand) => { const { id, name: n, accent, accent2, theme, ...rest } = s; if (rest.display) loadFont(rest.display); if (rest.text) loadFont(rest.text); onChange({ brand: rest, accent, accent2, theme: theme ?? study.theme }); notify(`Applied “${n}”.`); };
  const remove = (id: string) => { const next = saved.filter(s => s.id !== id); setSaved(next); writeSaved(next); };

  const colour = (label: string, value: string, set: (v: string) => void, id: string) => <label className="csb-brand-colour" htmlFor={id}>
    <input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={e => set(e.target.value)} />
    <span><strong>{label}</strong><small>{value}</small></span>
  </label>;
  const fontSelect = (label: string, value: string, set: (v: string) => void, id: string) => <div className="csb-field"><label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={e => { if (e.target.value === '__custom') { const custom = window.prompt('Google Fonts family name (e.g. "Schibsted Grotesk")', value); if (custom) set(custom.trim()); } else set(e.target.value); }}>
      <option value="">Page style default</option>
      {fontChoices.map(f => <option key={f} value={f}>{f}</option>)}
      {value && !fontChoices.includes(value) && <option value={value}>{value}</option>}
      <option value="__custom">Other Google font…</option>
    </select></div>;

  return <aside className="csb-brand-panel" aria-label="Brand">
    <div className="csb-brand-head"><div><p className="csb-panel-kicker">Brand</p><h2>Your design system</h2></div><button type="button" className="csb-icon-button" aria-label="Close brand panel" onClick={onClose}><X size={15} /></button></div>
    <div className="csb-brand-scroll">
      {saved.length > 0 && <section><p className="csb-panel-kicker">Saved styles</p><ul className="csb-brand-saved">{saved.map(s => <li key={s.id}>
        <button type="button" onClick={() => use(s)} title={`Apply ${s.name}`}><span className="csb-brand-dots">{[s.paper, s.ink, s.accent, s.accent2 || s.accent, s.surface].map((c, i) => <i key={i} style={{ background: c }} />)}</span><span><strong>{s.name}</strong><small>{s.display || 'Default fonts'}</small></span></button>
        <button type="button" className="csb-brand-remove" aria-label={`Delete ${s.name}`} onClick={() => remove(s.id)}><Trash2 size={13} /></button>
      </li>)}</ul></section>}

      <section><p className="csb-panel-kicker">Import</p>
        <div className="csb-brand-import">
          <button type="button" onClick={() => setMode(mode === 'figma' ? null : 'figma')} aria-expanded={mode === 'figma'} disabled={busy}><Figma size={15} /> Figma</button>
          <button type="button" onClick={() => imageRef.current?.click()} disabled={busy}><ImageIcon size={15} /> Image</button>
          <button type="button" onClick={() => tokensRef.current?.click()} disabled={busy}><FileJson size={15} /> Tokens</button>
        </div>
        <input ref={imageRef} type="file" accept="image/*" hidden onChange={e => { fromImage(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={tokensRef} type="file" accept=".json,.css,.txt,application/json,text/css" hidden onChange={e => { fromTokens(e.target.files?.[0]); e.target.value = ''; }} />
        {mode === 'figma' && <form className="csb-brand-figma" onSubmit={e => { e.preventDefault(); void fromFigma(); }}>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="Link to your style guide or design-system frame" aria-label="Figma link" />
          {!getFigmaToken() && <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Figma personal access token" aria-label="Figma token" />}
          <button type="submit" className="csb-primary-button" disabled={busy || !link.trim()}>{busy ? 'Reading…' : 'Read colours & fonts'}</button>
          <small>Tip: right-click the frame with your colours and type → Copy link to selection. The token stays in this tab only.</small>
        </form>}
        <p className="csb-field-note">Image: a screenshot of your style guide or a finished design. Tokens: a .json export (Tokens Studio, Figma variables) or a .css file of variables.</p>
        {found.length > 0 && <div className="csb-brand-found" aria-label="Colours found">{found.map(c => <i key={c} title={c} style={{ background: c }} />)}</div>}
      </section>

      <section><p className="csb-panel-kicker">Colours</p>
        <div className="csb-brand-colours">
          {colour('Accent', study.accent, v => onChange({ accent: v }), 'csb-b-accent')}
          {colour('Accent 2', study.accent2 || study.accent, v => onChange({ accent2: v }), 'csb-b-accent2')}
          {colour('Headlines', brand.ink, v => setBrand({ ink: v }), 'csb-b-ink')}
          {colour('Body text', brand.body, v => setBrand({ body: v }), 'csb-b-body')}
          {colour('Background', brand.paper, v => setBrand({ paper: v }), 'csb-b-paper')}
          {colour('Cards', brand.surface, v => setBrand({ surface: v }), 'csb-b-surface')}
        </div>
      </section>

      <section><p className="csb-panel-kicker">Type</p>
        {fontSelect('Headline font', brand.display, v => setBrand({ display: v }), 'csb-b-display')}
        {fontSelect('Body font', brand.text, v => setBrand({ text: v }), 'csb-b-text')}
        <div className="csb-field"><span className="csb-field-label">Headline weight</span><div className="csb-segment" role="group" aria-label="Headline weight">{([[300, 'Light'], [400, 'Regular'], [600, 'Bold']] as const).map(([w, l]) => <button key={w} type="button" aria-pressed={brand.weight === w} onClick={() => setBrand({ weight: w })}>{l}</button>)}</div></div>
      </section>

      <section><p className="csb-panel-kicker">Shape & base</p>
        <div className="csb-field"><span className="csb-field-label">Corners</span><div className="csb-segment" role="group" aria-label="Corners">{([['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round']] as const).map(([r, l]) => <button key={r} type="button" aria-pressed={brand.radius === r} onClick={() => setBrand({ radius: r })}>{l}</button>)}</div></div>
        <div className="csb-field"><span className="csb-field-label">Base style</span><div className="csb-segment" role="group" aria-label="Base style">{([['editorial', 'Editorial'], ['classic', 'Classic']] as const).map(([t, l]) => <button key={t} type="button" aria-pressed={(study.theme ?? 'editorial') === t} onClick={() => onChange({ theme: t })}>{l}</button>)}</div></div>
      </section>

      <section className="csb-brand-save"><p className="csb-panel-kicker">Save</p>
        <div><input value={name} onChange={e => setName(e.target.value)} placeholder="Name, e.g. Katelyn · portfolio" aria-label="Brand style name" /><button type="button" className="csb-primary-button" onClick={save}>Save style</button></div>
        <button type="button" className="csb-quiet-button" onClick={() => { onChange({ brand: undefined }); setFound([]); notify('Brand reset to the page style defaults.'); }}>Reset to page style defaults</button>
        <p className="csb-field-note">Saved styles live in this browser. Your case study keeps its brand when you export it.</p>
      </section>
    </div>
  </aside>;
}
