import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from './MotionKit';
import { EditableText } from './EditableText';
import type { BuilderStudy, CaseStudySection } from './model';
import { DeviceFrame, type Frame } from './DeviceFrame';

/*
  Title reveal hero — the opening from katelynwolfley.design.
  The title is sticky inside a soft inset panel; the product image sits one
  layer above it and scrolls up and over the title. Pure CSS for the core
  effect (works in the editor's scroll area and on the published page);
  browsers with scroll-driven animations also dim the title as it's covered.
*/
type ViewProps = {
  label: string; title: string; body: string; image?: string; caption?: string; alt: string;
  fields: { label: string; title: string; body: string; caption: string };
  slot: string; frame: Frame; editorMode: boolean; onFile?: (file: File) => void;
};

/* The title-reveal layout itself, used by the header (study fields) and by legacy sections. */
export function CoverHeroView({ label, title, body, image, caption, alt, fields, slot, frame, editorMode, onFile }: ViewProps) {
  const reduce = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const drop = editorMode && onFile ? {
    onDragOver: (event: React.DragEvent) => { event.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => { event.preventDefault(); event.stopPropagation(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onFile(file); },
  } : {};
  return <div className={`csb-cover ${frame !== 'none' ? 'has-device' : ''}`}>
    <div className="csb-cover-title">
      <motion.p className="csb-cover-label" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, ease: [0.22, 1, 0.36, 1] }}><EditableText field={fields.label} value={label} /></motion.p>
      <motion.h1 initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .08, ease: [0.22, 1, 0.36, 1] }}><EditableText field={fields.title} value={title} /></motion.h1>
      {(editorMode || body) && <motion.p className="csb-cover-summary" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8, delay: .2 }}><EditableText field={fields.body} value={body} /></motion.p>}
    </div>
    {frame !== 'none' ? <motion.div className="csb-cover-device" initial={reduce ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, delay: .15, ease: [0.22, 1, 0.36, 1] }}><DeviceFrame frame={frame} image={image} alt={alt} slot={slot} hint={editorMode ? 'Click to add your screen' : undefined} /></motion.div> :
    <motion.figure data-image-slot={slot} className={`csb-cover-media ${dragging ? 'is-dragging' : ''}`} {...drop} initial={reduce ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, delay: .15, ease: [0.22, 1, 0.36, 1] }}>
      {image
        ? <img src={image} alt={alt} />
        : editorMode
          ? <div className="csb-cover-empty"><FileUp size={26} strokeWidth={1.4} /><strong>Add your hero image or GIF</strong><span>click for files or a Figma link · it scrolls up over the title</span></div>
          : <div className="csb-cover-empty" aria-hidden="true" />}
      {editorMode && image && <span className="csb-cover-replace">Click or drop to replace</span>}
    </motion.figure>}
    {(editorMode || caption) && <p className="csb-cover-caption"><EditableText field={fields.caption} value={caption || ''} /></p>}
  </div>;
}

/* Title reveal as the page header (Page settings › Header › Title reveal). */
export function RevealHeader({ study, editorMode }: { study: BuilderStudy; editorMode: boolean }) {
  return <header className="csb-reveal-header"><CoverHeroView label={study.client} title={study.title} body={study.summary} image={study.heroImage} caption={study.heroCaption} alt={`${study.title} hero visual`} fields={{ label: 'client', title: 'title', body: 'summary', caption: 'heroCaption' }} slot="hero" frame={(study.hero?.frame as Frame | undefined) ?? 'none'} editorMode={editorMode} /></header>;
}

/* Legacy: a Title reveal hero added as a section (still renders older case studies). */
export function CoverHero({ section, editorMode, onUploadMedia }: { section: CaseStudySection; editorMode: boolean; onUploadMedia?: (sectionId: string, index: number, file: File) => void }) {
  const media = section.items[0] ?? { title: '', detail: '', image: '' };
  return <CoverHeroView label={section.eyebrow} title={section.title} body={section.body} image={media.image} caption={media.detail} alt={media.title || section.title} fields={{ label: 'eyebrow', title: 'title', body: 'body', caption: 'items.0.detail' }} slot={`${section.id}:0`} frame={(section.options?.frame as Frame | undefined) ?? 'none'} editorMode={editorMode} onFile={file => onUploadMedia?.(section.id, 0, file)} />;
}
