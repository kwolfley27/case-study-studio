import { introHidden, navLabelFor, type BuilderStudy, type CaseStudySection } from './model';

/*
  The settings every section shares, in one quiet group at the bottom of the panel:
  background, which headings show, the side menu, gradient, and chapters.
  A chapter groups neighbouring sections under one name; while you read them a small
  step menu stays pinned beside them (stored as options.group, same name = same chapter).
*/
type Change = (p: Partial<CaseStudySection>) => void;
const SURFACES: Array<[CaseStudySection['variant'], string, string]> = [['light', 'White', '#fdfcfc'], ['tinted', 'Warm grey', '#f5f3f1'], ['dark', 'Dark', '#161411']];

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return <label className="csb-sb-switch"><span><b>{label}</b>{hint && <small>{hint}</small>}</span><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} /><i aria-hidden="true" /></label>;
}

export function SectionBasics({ study, section, onChange, onChangeOther }: { study: BuilderStudy; section: CaseStudySection; onChange: Change; onChangeOther: (id: string, patch: Partial<CaseStudySection>) => void }) {
  const o = section.options ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ options: { ...o, ...patch } });
  const hidden = introHidden(section);
  const idx = study.sections.findIndex(s => s.id === section.id);
  const groupOf = (s?: CaseStudySection) => String(s?.options?.group ?? '').trim();
  const g = groupOf(section);
  const above = study.sections[idx - 1], below = study.sections[idx + 1];
  // The run of neighbouring sections in this chapter.
  const members: CaseStudySection[] = [];
  if (g) { let i = idx; while (i > 0 && groupOf(study.sections[i - 1]) === g) i--; for (; i < study.sections.length && groupOf(study.sections[i]) === g; i++) members.push(study.sections[i]); }
  const startChapter = () => set({ group: groupOf(above) || groupOf(below) || section.eyebrow?.replace(/^\d+\s*\/\s*/, '').trim() || 'Chapter' });

  return <div className="csb-sb">
    <p className="csb-sb-title">Section</p>

    <div className="csb-sb-row">
      <span className="csb-sb-label">Background</span>
      <div className="csb-sb-surfaces" role="radiogroup" aria-label="Background">
        {SURFACES.map(([v, l, c]) => <button key={v} type="button" role="radio" aria-checked={section.variant === v} onClick={() => onChange({ variant: v })}><i style={{ background: c }} />{l}</button>)}
      </div>
    </div>

    {section.kind !== 'coverHero' && <div className="csb-sb-row">
      <span className="csb-sb-label">Show</span>
      <div className="csb-sb-chips" role="group" aria-label="Headings to show">
        <button type="button" aria-pressed={!hidden.eyebrow} onClick={() => set({ hideEyebrow: !hidden.eyebrow })}>Label</button>
        <button type="button" aria-pressed={!hidden.title} onClick={() => set({ hideTitle: !hidden.title })}>Title</button>
        {section.kind !== 'narrative' && <button type="button" aria-pressed={!hidden.body} onClick={() => set({ hideBody: !hidden.body })}>Intro text</button>}
      </div>
    </div>}

    <Switch label="Side menu" hint={`Listed as “${navLabelFor(section)}”`} on={!section.hideFromNav} onChange={v => onChange({ hideFromNav: !v })} />

    {study.accentGradient && study.accent2 && <div className="csb-sb-row">
      <span className="csb-sb-label">Gradient</span>
      <div className="csb-sb-chips" role="radiogroup" aria-label="Gradient in this section">
        {([['', 'Page setting'], ['on', 'On'], ['off', 'Off']] as const).map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={String(o.gradient ?? '') === v} aria-pressed={String(o.gradient ?? '') === v} onClick={() => set({ gradient: v || undefined })}>{l}</button>)}
      </div>
    </div>}

    <Switch label="Part of a chapter" hint="Groups this with the sections next to it under one name. A small step menu stays pinned beside them while someone reads." on={!!g} onChange={v => v ? startChapter() : set({ group: '' })} />
    {g && <div className="csb-sb-chapter">
      <label><span className="csb-sb-label">Chapter name</span><input value={String(o.group ?? '')} onChange={e => set({ group: e.target.value })} placeholder="e.g. Discover" /></label>
      <div className="csb-sb-steps" aria-label="Sections in this chapter">
        {members.map((m, k) => <span key={m.id} className={m.id === section.id ? 'is-me' : ''}><em>{String(k + 1).padStart(2, '0')}</em>{navLabelFor(m)}</span>)}
      </div>
      <div className="csb-sb-actions">
        {below && groupOf(below) !== g && <button type="button" onClick={() => onChangeOther(below.id, { options: { ...(below.options ?? {}), group: g } })}>Add “{navLabelFor(below)}”</button>}
      </div>
    </div>}
  </div>;
}
