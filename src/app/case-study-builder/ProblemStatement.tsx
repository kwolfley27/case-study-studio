import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { EditableText } from './EditableText';
import { useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';
import { ResearchVisual } from './ResearchVisuals';

/*
  Problem statement as one clear sentence:
    [who] [need a way to] [need] [because] [insight].
  The filled-in parts are highlighted; the connecting words are editable too.
  Optional: a "How might we…" question and a success measure.
  items: 0 who · 1 need (title = connector) · 2 insight (title = connector)
         3 How might we · 4 success (hidden toggles them off)
*/
const connector = (title: string | undefined, fallback: string) => {
  const t = (title || '').trim();
  if (!t || /^needs?$/i.test(t)) return fallback === 'because' ? 'because' : 'need a way to';
  if (/^because$/i.test(t)) return 'because';
  return t;
};

export function ProblemStatement({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const [who, need, why, hmw, success] = section.items;
  const extras = ((hmw && !hmw.hidden) || (success && !success.hidden)) ? <div className="csb-ps-extras">
      {hmw && !hmw.hidden && <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .6, delay: .6 }}><small><EditableText field="items.3.title" value={hmw.title || 'How might we'} /></small><p><EditableText field="items.3.detail" value={hmw.detail} /></p></motion.div>}
      {success && !success.hidden && <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .6, delay: .75 }}><small><EditableText field="items.4.title" value={success.title || "We'll know it worked when"} /></small><p><EditableText field="items.4.detail" value={success.detail} /></p></motion.div>}
    </div> : null;
  // Rows layout: Who / Needs / Because as labeled rows under the normal heading.
  if (section.options?.layout === 'rows') return <div className="csb-ps-rows"><ResearchVisual section={{ ...section, items: [who, need, why].filter(Boolean).map((item, i) => ({ ...item, title: i === 0 ? (item.title || 'Who') : i === 1 ? 'Needs' : 'Because' })) }} />{extras}</div>;
  const markColor = String(section.options?.markColor || 'accent');
  const markVar = markColor === 'accent' ? 'var(--csb-accent)' : markColor === 'accent2' ? 'var(--csb-accent-2, var(--csb-accent))' : markColor === 'ink' ? 'var(--t-ink, #000)' : markColor;
  // Highlighter marker (default) or a thin underline, in any colour.
  const marker = section.options?.markStyle !== 'underline';
  const band = marker ? '58%' : '2px';
  const mark = (index: number, value: string) => <motion.mark style={{ '--ps-mark': markVar } as React.CSSProperties} className={`csb-ps-mark ${marker ? 'is-marker' : ''} ${markColor === 'accent' ? 'is-acc' : ''}`} initial={reduce ? false : { backgroundSize: `0% ${band}` }} whileInView={{ backgroundSize: `100% ${band}` }} viewport={{ once: true, amount: .8 }} transition={{ duration: .8, delay: .25 + index * .35, ease: [0.22, 1, 0.36, 1] }}><EditableText field={`items.${index}.detail`} value={value} /></motion.mark>;
  const sentence = <>
      {mark(0, who?.detail || '')}{' '}
      <EditableText field="items.1.title" value={connector(need?.title, 'need')} />{' '}
      {mark(1, need?.detail || '')}{' '}
      <EditableText field="items.2.title" value={connector(why?.title, 'because')} />{' '}
      {mark(2, why?.detail || '')}.
    </>;
  // With a "How might we" question the statement sits on a card that turns over as you scroll.
  if (hmw && !hmw.hidden && section.options?.flip !== false) return <FlipStatement bubbleBg={section.options?.bubble ? String(section.options.bubble) : undefined} bubbleInk={section.options?.bubbleInk ? String(section.options.bubbleInk) : undefined} sentence={sentence} hmwTitle={hmw.title || 'How might we'} hmwDetail={hmw.detail} success={success && !success.hidden ? success : undefined} />;
  return <div className="csb-ps">
    <motion.p className="csb-ps-sentence" initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}>
      {mark(0, who?.detail || '')}{' '}
      <EditableText field="items.1.title" value={connector(need?.title, 'need')} />{' '}
      {mark(1, need?.detail || '')}{' '}
      <EditableText field="items.2.title" value={connector(why?.title, 'because')} />{' '}
      {mark(2, why?.detail || '')}.
    </motion.p>
    {extras}
  </div>;
}

/* The flip: a tall scroll scene with a sticky card. Front = the problem statement,
   back = a speech bubble asking "How might we…?". Rotation follows the scroll, so it
   turns back if you scroll up. Reduced motion shows the two faces one after the other. */
function FlipStatement({ bubbleBg, bubbleInk, sentence, hmwTitle, hmwDetail, success }: { bubbleBg?: string; bubbleInk?: string; sentence: React.ReactNode; hmwTitle: string; hmwDetail: string; success?: { title: string; detail: string } }) {
  const reduce = useReducedMotion();
  const scene = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  // 0 when the card first pins, 1 when it lets go.
  const p = useMotionValue(0);
  useEffect(() => {
    const el = scene.current; if (!el) return;
    const scroller: HTMLElement | Window = el.closest('.csb-preview-viewport') as HTMLElement | null ?? window;
    let frame = 0;
    const measure = () => { frame = 0; const r = el.getBoundingClientRect(); const box = scroller instanceof Window ? { top: 0, height: window.innerHeight } : scroller.getBoundingClientRect();
      const pin = box.top + box.height * .24; const travel = r.height - (stick.current?.getBoundingClientRect().height ?? 0);
      p.set(Math.min(1, Math.max(0, (pin - r.top) / (travel || 1)))); };
    const on = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure(); scroller.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { scroller.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (frame) cancelAnimationFrame(frame); };
  }, [p]);
  // The statement settles back and softens; then the question arrives like a message.
  const frontOpacity = useTransform(p, [.08, .4], [1, 0]);
  const frontY = useTransform(p, [.08, .4], [0, -28]);
  const frontScale = useTransform(p, [.08, .4], [1, .96]);
  const frontBlur = useTransform(p, [.08, .4], ['blur(0px)', 'blur(8px)']);
  const bubble = useTransform(p, [.32, .62], [0, 1]);
  const bubbleY = useTransform(p, [.32, .62], [36, 0]);
  const bubbleScale = useTransform(bubble, [0, 1], [.9, 1]);
  const hint = useTransform(p, [0, .04, .1], [1, 1, 0]);
  // Text on the bubble follows the bubble's real colour: white on dark or mid tones, near-black on light ones.
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [autoInk, setAutoInk] = useState('#fdfcfc');
  useLayoutEffect(() => { const el = bubbleRef.current; if (!el || !bubbleBg) return; const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g); if (!m) return; const [r, g, b] = m.slice(0, 3).map(v => { const c = +v / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); setAutoInk(.2126 * r + .7152 * g + .0722 * b > .5 ? '#141414' : '#fdfcfc'); }, [bubbleBg]);
  const back = <div className="csb-psf-hmw">
    <motion.div ref={bubbleRef} className="csb-psf-bubble" style={{ ...(bubbleBg ? { background: bubbleBg, color: bubbleInk || autoInk } : {}), ...(reduce ? {} : { opacity: bubble, y: bubbleY, scale: bubbleScale }) }}>
      <span className="csb-psf-ask"><EditableText field="items.3.title" value={/\?$/.test(hmwTitle.trim()) ? hmwTitle : hmwTitle.replace(/[.…]*$/, '…')} /></span>
      <p><EditableText field="items.3.detail" value={hmwDetail} /></p>
    </motion.div>
  </div>;
  const successRow = success && <div className="csb-psf-success"><span><EditableText field="items.4.title" value={success.title || "We'll know it worked when"} /></span><p><EditableText field="items.4.detail" value={success.detail} /></p></div>;
  if (reduce) return <div className="csb-psf is-static"><div className="csb-psf-face is-front"><p className="csb-ps-sentence">{sentence}</p></div><div className="csb-psf-face is-back">{back}</div>{successRow}</div>;
  return <div className="csb-psf" ref={scene}>
    <div className="csb-psf-stick" ref={stick}>
      <motion.div className="csb-psf-card is-fade">
        <motion.div className="csb-psf-face is-front" style={{ opacity: frontOpacity, y: frontY, scale: frontScale, filter: frontBlur }}><p className="csb-ps-sentence">{sentence}</p><motion.span className="csb-psf-hint" style={{ opacity: hint }} aria-hidden="true">Keep scrolling</motion.span></motion.div>
        <div className="csb-psf-face is-back">{back}</div>
      </motion.div>
      {successRow && <motion.div style={{ opacity: bubble, width: '100%', display: 'grid', justifyItems: 'center' }}>{successRow}</motion.div>}
    </div>
    <div className="csb-psf-run" aria-hidden="true" />
  </div>;
}
