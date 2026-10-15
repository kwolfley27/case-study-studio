import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from './MotionKit';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';
import { DeviceFrame, type Frame } from './DeviceFrame';

/*
  Title reveal hero — the opening from katelynwolfley.design.
  The title is sticky inside a soft inset panel; the product image sits one
  layer above it and scrolls up and over the title. Pure CSS for the core
  effect (works in the editor's scroll area and on the published page);
  browsers with scroll-driven animations also dim the title as it's covered.
*/
export function CoverHero({ section, editorMode, onUploadMedia }: { section: CaseStudySection; editorMode: boolean; onUploadMedia?: (sectionId: string, index: number, file: File) => void }) {
  const reduce = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const media = section.items[0] ?? { title: '', detail: '', image: '' };
  const drop = editorMode ? {
    onDragOver: (event: React.DragEvent) => { event.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => { event.preventDefault(); event.stopPropagation(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onUploadMedia?.(section.id, 0, file); },
  } : {};
  const frame = (section.options?.frame as Frame | undefined) ?? 'none';
  return <div className={`csb-cover ${frame !== 'none' ? 'has-device' : ''}`}>
    <div className="csb-cover-title">
      <motion.p className="csb-cover-label" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, ease: [0.22, 1, 0.36, 1] }}><EditableText field="eyebrow" value={section.eyebrow} /></motion.p>
      <motion.h1 initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .08, ease: [0.22, 1, 0.36, 1] }}><EditableText field="title" value={section.title} /></motion.h1>
      {(editorMode || section.body) && <motion.p className="csb-cover-summary" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8, delay: .2 }}><EditableText field="body" value={section.body} /></motion.p>}
    </div>
    {frame !== 'none' ? <motion.div className="csb-cover-device" initial={reduce ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, delay: .15, ease: [0.22, 1, 0.36, 1] }}><DeviceFrame frame={frame} image={media.image} alt={media.title || section.title} slot={`${section.id}:0`} hint={editorMode ? 'Click to add your screen' : undefined} /></motion.div> :
    <motion.figure data-image-slot={`${section.id}:0`} className={`csb-cover-media ${dragging ? 'is-dragging' : ''}`} {...drop} initial={reduce ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, delay: .15, ease: [0.22, 1, 0.36, 1] }}>
      {media.image
        ? <img src={media.image} alt={media.title || section.title} />
        : editorMode
          ? <label className="csb-cover-empty"><FileUp size={26} strokeWidth={1.4} /><strong>Drop your hero image or GIF</strong><span>click for files or a Figma link · it scrolls up over the title</span><input type="file" accept="image/*,.gif" onChange={event => { const file = event.target.files?.[0]; if (file) onUploadMedia?.(section.id, 0, file); event.target.value = ''; }} /></label>
          : <div className="csb-cover-empty" aria-hidden="true" />}
      {editorMode && media.image && <span className="csb-cover-replace">Click or drop to replace</span>}
    </motion.figure>}
    {(editorMode || media.detail) && <p className="csb-cover-caption"><EditableText field="items.0.detail" value={media.detail} /></p>}
  </div>;
}
