import { useContext, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, useMotionValue, useTransform, useInView, animate } from 'motion/react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import { Media } from './Media';
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
  const editing = !!useContext(EditingContext).edit;
  // Optional picture under the statement (item 5), e.g. the original design. Click it to paste a frame or image.
  const pic = section.items[5];
  const edit = useContext(EditingContext).edit;
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Spotlight: drag a box around one part of the picture (e.g. the license chip); the rest dims and the box gets a ring and a label.
  const spot = pic?.spots?.[0];
  const setSpots = (spots: NonNullable<typeof pic>['spots']) => edit?.('json:items', JSON.stringify(section.items.map((it, i) => i === 5 ? { ...it, spots } : it)));
  const draw = (event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = (event.clientX - r.left) / r.width, sy = (event.clientY - r.top) / r.height; let box = { x: sx, y: sy, w: 0, h: 0 };
    const move = (e: PointerEvent) => { const ex = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), ey = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); box = { x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy) }; setDraft(box); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); setDraft(null); setDrawing(false); if (box.w > .02 && box.h > .02) setSpots([{ ...box, note: spot?.note || 'License chip' }]); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  const labelRight = spot ? spot.x + spot.w / 2 > .6 : false;
  const labelAbove = spot ? spot.y + spot.h > .82 : false;
  const picture = pic && !pic.hidden && (pic.image || editing) ? <figure className="csb-ps-pic">
      <div className={`csb-ps-pic-frame ${pic.image ? 'has-image' : ''}`} data-image-slot={`${section.id}:5`}>
        {pic.image ? <Media src={pic.image} alt={pic.title || 'The original design'} loading="lazy" draggable={false} /> : <span className="csb-ps-pic-empty"><strong>Add a picture, like the original design</strong><small>Click to paste a Figma frame, an image or a GIF</small></span>}
        {pic.image && spot && !drawing && <>
          <motion.svg className="csb-ps-dim" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .6, delay: .2, ease: [0.22, 1, 0.36, 1] }}>
            <defs><mask id={`ps-m-${section.id}`}><rect width="100" height="100" fill="#fff" /><rect x={spot.x * 100} y={spot.y * 100} width={spot.w * 100} height={spot.h * 100} rx="1.2" fill="#000" /></mask></defs>
            <rect width="100" height="100" fill="#0c0b0a" fillOpacity=".55" mask={`url(#ps-m-${section.id})`} />
          </motion.svg>
          <motion.span className="csb-ps-ring" aria-hidden="true" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.w * 100}%`, height: `${spot.h * 100}%` }} initial={reduce ? false : { opacity: 0, scale: 1.04 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .5, delay: .35 }} />
          {(spot.note || editing) && <motion.span className={`csb-ps-label ${labelRight ? 'is-right' : ''} ${labelAbove ? 'is-above' : ''}`} style={labelRight ? { right: `${(1 - spot.x - spot.w) * 100}%`, ...(labelAbove ? { bottom: `${(1 - spot.y) * 100}%` } : { top: `${(spot.y + spot.h) * 100}%` }) } : { left: `${spot.x * 100}%`, ...(labelAbove ? { bottom: `${(1 - spot.y) * 100}%` } : { top: `${(spot.y + spot.h) * 100}%` }) }} initial={reduce ? false : { opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .5, delay: .5 }}><EditableText field="deep:items.5.spots.0.note" value={spot.note || ''} /></motion.span>}
        </>}
        {drawing && <div className="csb-sc-draw" data-no-slot onPointerDown={draw} onClick={e => e.stopPropagation()}><span>Drag a box around the part to point out</span>{draft && <i style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}</div>}
      </div>
      {editing && pic.image && <div className="csb-ps-pic-tools" data-no-slot onClick={e => e.stopPropagation()}>
        <button type="button" aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>{drawing ? 'Cancel' : spot ? 'Redraw spotlight' : '+ Spotlight a part'}</button>
        {spot && !drawing && <button type="button" onClick={() => setSpots([])}>Remove spotlight</button>}
      </div>}
      {(pic.title || editing) && <figcaption><EditableText field="items.5.title" value={pic.title || ''} /></figcaption>}
    </figure> : null;
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
  // Free text: one box, the statement in your own words.
  const free = section.options?.layout === 'free';
  const sentence = free ? <EditableText field="options.freeText" value={String(section.options?.freeText ?? '')} /> : <>
      {mark(0, who?.detail || '')}{' '}
      <EditableText field="items.1.title" value={connector(need?.title, 'need')} />{' '}
      {mark(1, need?.detail || '')}{' '}
      <EditableText field="items.2.title" value={connector(why?.title, 'because')} />{' '}
      {mark(2, why?.detail || '')}.
    </>;
  // With a "How might we" question the statement sits on a card that turns over as you scroll.
  if (hmw && !hmw.hidden && section.options?.flip !== false) return <FlipStatement picture={picture} bubbleBg={section.options?.bubble ? String(section.options.bubble) : undefined} bubbleInk={section.options?.bubbleInk ? String(section.options.bubbleInk) : undefined} sentence={sentence} hmwTitle={hmw.title || 'How might we'} hmwDetail={hmw.detail} success={success && !success.hidden ? success : undefined} />;
  return <div className="csb-ps">
    <motion.p className="csb-ps-sentence" initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}>
      {sentence}
    </motion.p>
    {picture}
    {extras}
  </div>;
}

/* The flip: a card in the page flow. Front = the problem statement,
   back = a speech bubble asking "How might we…?". Rotation follows the scroll, so it
   turns back if you scroll up. Reduced motion shows the two faces one after the other. */
function FlipStatement({ picture, bubbleBg, bubbleInk, sentence, hmwTitle, hmwDetail, success }: { picture?: React.ReactNode; bubbleBg?: string; bubbleInk?: string; sentence: React.ReactNode; hmwTitle: string; hmwDetail: string; success?: { title: string; detail: string } }) {
  // While editing, both faces stay still and fully visible so the text can be typed into; the flip plays in Preview and on the page.
  const editing = !!useContext(EditingContext).edit;
  const reduce = useReducedMotion() || editing;
  const scene = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  // 0 = the statement, 1 = the question. Plays on its own once the card is in view (no pinned scroll runway, so no empty space under it):
  // the statement stays long enough to read, then softens away and the question arrives.
  const p = useMotionValue(0);
  const seen = useInView(scene, { once: true, amount: .6 });
  useEffect(() => {
    if (!seen) return;
    const words = typeof sentence === 'string' ? sentence.split(/\s+/).length : 22;
    const hold = Math.min(4.5, Math.max(2.2, words * .14));
    const run = animate(p, 1, { delay: hold, duration: 1.8, ease: [0.22, 1, 0.36, 1] });
    return () => run.stop();
  }, [seen, p, sentence]);
  // The statement settles back and softens; then the question arrives like a message.
  const frontOpacity = useTransform(p, [.08, .5], [1, 0]);
  const frontY = useTransform(p, [.08, .5], [0, -28]);
  const frontScale = useTransform(p, [.08, .5], [1, .96]);
  const frontBlur = useTransform(p, [.08, .5], ['blur(0px)', 'blur(8px)']);
  const bubble = useTransform(p, [.45, .97], [0, 1]);
  const bubbleY = useTransform(p, [.45, .97], [36, 0]);
  const bubbleScale = useTransform(bubble, [0, 1], [.9, 1]);
  // The card's background fades away as the question arrives, so the bubble ends up on the page itself.
  const cardBg = useTransform(p, [.38, .78], [1, 0]);
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
  if (reduce) return <div className="csb-psf is-static"><div className="csb-psf-face is-front"><p className="csb-ps-sentence">{sentence}</p>{picture}</div><div className="csb-psf-face is-back">{back}</div>{successRow}</div>;
  return <div className={`csb-psf ${picture ? 'has-pic' : ''}`} ref={scene}>
    <div className="csb-psf-stick" ref={stick}>
      <motion.div className="csb-psf-card is-fade">
        <motion.div className="csb-psf-bg" aria-hidden="true" style={{ opacity: cardBg }} />
        <motion.div className="csb-psf-face is-front" style={{ opacity: frontOpacity, y: frontY, scale: frontScale, filter: frontBlur }}><p className="csb-ps-sentence">{sentence}</p></motion.div>
        <div className="csb-psf-face is-back">{back}</div>
      </motion.div>
      {/* The picture stays put under the card, so the card is only as tall as the text and the question doesn't float in empty space */}
      {picture}
      {successRow && <motion.div style={{ opacity: bubble, width: '100%', display: 'grid', justifyItems: 'center' }}>{successRow}</motion.div>}
    </div>
  </div>;
}
