import { useRef } from 'react';
import { motion, useTransform } from 'motion/react';
import { EditableText } from './EditableText';
import { useReducedMotion, useScrollProgress } from './MotionKit';
import type { BuilderStudy } from './model';
import { DeviceFrame } from './DeviceFrame';

/*
  Full-width header: an edge-to-edge background, the title held in place, and
  the hero image (a transparent PNG, or a screen placed in a device mockup)
  rising over the title as you scroll, so the title tucks underneath it.
*/

export type HeroSettings = NonNullable<BuilderStudy['hero']>;
export const defaultHero: HeroSettings = { style: 'standard', bg: 'accent', frame: 'laptop' };

export function ImmersiveHero({ study, editorMode }: { study: BuilderStudy; editorMode: boolean }) {
  const hero = { ...defaultHero, ...(study.hero ?? {}) };
  const reduce = useReducedMotion();
  const media = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(media, 1, .35);
  const titleOpacity = useTransform(progress, v => reduce ? 1 : 1 - Math.min(1, Math.max(0, (v - .35) / .45)) * .8);
  const titleScale = useTransform(progress, v => reduce ? 1 : 1 - Math.min(1, Math.max(0, (v - .3) / .5)) * .06);
  return <header className={`csb-hx csb-hx-bg-${hero.bg} csb-hx-frame-${hero.frame}`} style={hero.bg === 'image' && hero.bgImage ? { backgroundImage: `url(${hero.bgImage})` } : undefined}>
    <motion.div className="csb-hx-title" style={{ opacity: titleOpacity, scale: titleScale }}>
      <p className="csb-eyebrow"><EditableText field="client" value={study.client} /></p>
      <h1><EditableText field="title" value={study.title} /></h1>
      <p className="csb-hx-summary"><EditableText field="summary" value={study.summary} /></p>
    </motion.div>
    <motion.div ref={media} className="csb-hx-media" initial={reduce ? false : { opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: .2, ease: [0.22, 1, 0.36, 1] }}>
      <DeviceFrame frame={hero.frame} image={study.heroImage} alt={`${study.title} hero visual`} slot="hero" hint={editorMode ? (hero.frame === 'none' ? 'Click to add a transparent PNG or image' : 'Click to add your screen') : undefined} />
    </motion.div>
  </header>;
}
