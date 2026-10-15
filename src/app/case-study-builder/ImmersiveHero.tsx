import { useRef } from 'react';
import { motion, useTransform } from 'motion/react';
import { EditableText } from './EditableText';
import { useReducedMotion, useScrollProgress } from './MotionKit';
import type { BuilderStudy } from './model';

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
  const image = study.heroImage
    ? <img src={study.heroImage} alt={`${study.title} hero visual`} />
    : <div className="csb-designed-media"><strong>Hero visual</strong><span>{editorMode ? (hero.frame === 'none' ? 'Click to add a transparent PNG or image' : 'Click to add a screen for the mockup') : ''}</span></div>;
  return <header className={`csb-hx csb-hx-bg-${hero.bg} csb-hx-frame-${hero.frame}`} style={hero.bg === 'image' && hero.bgImage ? { backgroundImage: `url(${hero.bgImage})` } : undefined}>
    <motion.div className="csb-hx-title" style={{ opacity: titleOpacity, scale: titleScale }}>
      <p className="csb-eyebrow"><EditableText field="client" value={study.client} /></p>
      <h1><EditableText field="title" value={study.title} /></h1>
      <p className="csb-hx-summary"><EditableText field="summary" value={study.summary} /></p>
    </motion.div>
    <motion.div ref={media} className="csb-hx-media" initial={reduce ? false : { opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: .2, ease: [0.22, 1, 0.36, 1] }}>
      {hero.frame === 'none' && <div className="csb-hx-float" data-image-slot="hero">{image}</div>}
      {hero.frame === 'browser' && <div className="csb-hx-browser"><div className="csb-hx-bar" aria-hidden="true"><i /><i /><i /></div><div className="csb-hx-screen" data-image-slot="hero">{image}</div></div>}
      {hero.frame === 'laptop' && <div className="csb-hx-laptop"><div className="csb-hx-lid"><div className="csb-hx-screen" data-image-slot="hero">{image}</div></div><div className="csb-hx-base" aria-hidden="true" /></div>}
      {hero.frame === 'desktop' && <div className="csb-hx-desktop"><div className="csb-hx-monitor"><div className="csb-hx-screen" data-image-slot="hero">{image}</div></div><div className="csb-hx-stand" aria-hidden="true" /></div>}
      {hero.frame === 'phone' && <div className="csb-hx-phone"><span className="csb-hx-island" aria-hidden="true" /><div className="csb-hx-screen" data-image-slot="hero">{image}</div></div>}
    </motion.div>
  </header>;
}
