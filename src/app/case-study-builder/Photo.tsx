import { ImagePlus } from 'lucide-react';
import { EditableText } from './EditableText';
import { Media } from './Media';
import type { CaseStudySection } from './model';

/*
  Photo: one picture with your words, so a story doesn't read like an essay.
  options.photoLayout:
    right (default) – words on the left, photo on the right
    left            – photo on the left, words on the right
    full            – words above, photo across the column
    pair            – words above, two photos side by side
  The section's title and body are the words (the canvas lays them beside the photo).
  items[i].image = the photo (click it on the page to upload, paste or drop), items[i].title = its caption.
*/
export type PhotoLayout = 'right' | 'left' | 'full' | 'pair';
export const photoLayoutOf = (section: Pick<CaseStudySection, 'options'>): PhotoLayout => {
  const v = section.options?.photoLayout; return v === 'left' || v === 'full' || v === 'pair' ? v : 'right';
};

export function Photo({ section, editorMode }: { section: CaseStudySection; editorMode: boolean }) {
  const layout = photoLayoutOf(section);
  const count = layout === 'pair' ? 2 : 1;
  const items = Array.from({ length: count }, (_, i) => section.items[i] ?? { title: '', detail: '', image: '' });
  const ratio = section.options?.photoCrop === true;
  return <div className={`csb-photo csb-photo-n${count} ${ratio ? 'is-cropped' : ''}`}>
    {items.map((item, i) => <figure key={i} className="csb-photo-figure">
      <div className={`csb-photo-frame ${item.image ? 'has-image' : ''}`} data-image-slot={`${section.id}:${i}`}>
        {item.image ? <Media src={item.image} alt={item.title || 'Photo'} loading="lazy" />
          : editorMode ? <div className="csb-photo-empty"><ImagePlus size={22} strokeWidth={1.5} /><strong>Add a photo</strong><span>Click, paste or drop an image</span></div> : null}
      </div>
      {(editorMode || item.title) && <figcaption className="csb-photo-caption"><EditableText field={`items.${i}.title`} value={item.title} /></figcaption>}
    </figure>)}
  </div>;
}

export function PhotoControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const layout = photoLayoutOf(section); const o = section.options ?? {};
  const set = (photoLayout: PhotoLayout) => {
    const need = photoLayout === 'pair' ? 2 : 1;
    const items = [...section.items]; while (items.length < need) items.push({ title: '', detail: '', image: '' });
    onChange({ options: { ...o, photoLayout }, items });
  };
  const choices: Array<[PhotoLayout, string]> = [['right', 'Text · Photo'], ['left', 'Photo · Text'], ['full', 'Full width'], ['pair', 'Two photos']];
  return <div className="csb-tsc">
    <div className="csb-sb-row"><span className="csb-sb-label">Layout</span>
      <div className="csb-sb-chips" role="group" aria-label="Photo layout">{choices.map(([k, l]) => <button key={k} type="button" aria-pressed={layout === k} onClick={() => set(k)}>{l}</button>)}</div>
    </div>
    <div className="csb-sb-row"><span className="csb-sb-label">Shape</span>
      <div className="csb-sb-chips" role="group" aria-label="Photo shape">
        <button type="button" aria-pressed={o.photoCrop !== true} onClick={() => onChange({ options: { ...o, photoCrop: false } })}>As uploaded</button>
        <button type="button" aria-pressed={o.photoCrop === true} onClick={() => onChange({ options: { ...o, photoCrop: true } })}>Same shape (4:3)</button>
      </div>
    </div>
    <small style={{ fontSize: 11.5, color: '#6f6961', lineHeight: 1.45 }}>Click the photo on the page to upload, paste a Figma frame, or drop an image.</small>
  </div>;
}
