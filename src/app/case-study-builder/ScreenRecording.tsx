import { useContext, useEffect, useRef, useState } from 'react';
import { Circle, Link2, Pause, Play, Square, Upload } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import { mediaUrl, PasscodeError, PASSCODE_KEY, putMedia, recordScreen, uploadToStudio, UploadSetupError } from './media';
import type { CaseStudySection } from './model';

/*
  Screen recording, presented like a product launch video: the camera zooms
  in and follows each "click moment", a smooth cursor (or dot) glides
  between them with a click ripple, and the video sits in a frame on a
  styled background. Mark click moments by clicking on the video in the
  editor; fine-tune them in the right panel.
*/

export type RecClick = { t: number; x: number; y: number; zoom?: number; hold?: number };
export type Recording = NonNullable<CaseStudySection['recording']>;
export const defaultRecording: Recording = { src: '', background: 'accent', frame: 'browser', padding: 64, radius: 14, cursor: 'arrow', zoom: 1.8, clicks: [], loop: true, controls: false, speed: 1 };

const LEAD = .55, HOLD = 1.7, TRAVEL = .8;
const DEMO: RecClick[] = [{ t: 1.1, x: 24, y: 24 }, { t: 3.2, x: 72, y: 46 }, { t: 5.3, x: 40, y: 78 }];
const DEMO_LENGTH = 7.2;
const ease = (k: number) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function cameraAt(t: number, clicks: RecClick[], zoom: number, base: { s: number; x: number; y: number }) {
  for (const c of clicks) if (t >= c.t - LEAD && t <= c.t + (c.hold ?? HOLD)) return { s: base.s * (c.zoom ?? zoom), x: c.x, y: c.y };
  return base;
}
function cursorAt(t: number, clicks: RecClick[]) {
  let prev = { x: 52, y: 64 }; let prevT = 0;
  for (const c of clicks) {
    const start = Math.max(prevT, c.t - TRAVEL);
    if (t < start) return prev;
    if (t <= c.t) { const k = ease((t - start) / Math.max(.05, c.t - start)); return { x: prev.x + (c.x - prev.x) * k, y: prev.y + (c.y - prev.y) * k }; }
    prev = { x: c.x, y: c.y }; prevT = c.t;
  }
  return prev;
}

export function ScreenRecording({ section, editorMode, onChange }: { section: CaseStudySection; editorMode: boolean; onChange?: (next: Recording) => void }) {
  const rec: Recording = { ...defaultRecording, ...(section.recording ?? {}) };
  const clicks = [...(rec.clicks ?? [])].sort((a, b) => a.t - b.t);
  const reduce = useReducedMotion() && !editorMode;
  const { edit } = useContext(EditingContext);
  const stage = useRef<HTMLDivElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState<'' | 'recording' | 'saving'>('');
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [aspect, setAspect] = useState(16 / 10);
  const [cropping, setCropping] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const live = useRef({ s: 1, x: 50, y: 50, last: -1 });
  const demo = !url;
  const crop = !demo && !cropping && rec.crop && rec.crop.w > 2 && rec.crop.h > 2 ? rec.crop : null;
  const base = crop ? { s: 100 / crop.w, x: crop.x + crop.w / 2, y: crop.y + crop.h / 2 } : { s: 1, x: 50, y: 50 };
  const viewAspect = crop ? aspect * crop.w / crop.h : demo ? 16 / 10 : aspect;

  const recRef = useRef(rec); recRef.current = rec;
  const [upload, setUpload] = useState<{ progress: number; note?: string; needsPasscode?: boolean } | null>(null);
  const [passcode, setPasscode] = useState('');
  const pending = useRef<Blob | null>(null);
  const save = (patch: Partial<Recording>) => { const next = { ...recRef.current, ...patch }; if (onChange) onChange(next); else edit?.('json:recording', JSON.stringify(next)); };

  useEffect(() => { let alive = true; setMissing(false); if (!rec.src) { setUrl(null); return; } void mediaUrl(rec.src).then(u => { if (!alive) return; setUrl(u); setMissing(!u); }); return () => { alive = false; }; }, [rec.src]);

  // autoplay when on screen
  useEffect(() => {
    const el = stage.current; const v = video.current; if (!el || !v) return;
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
    if (reduce) return;
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void v.play().catch(() => undefined); else v.pause(); }, { threshold: .35 });
    io.observe(el); return () => io.disconnect();
  }, [url, reduce]);

  // camera + cursor loop
  useEffect(() => {
    let frame = 0; let lastNow = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(.1, (now - lastNow) / 1000); lastNow = now;
      const list = demo ? DEMO : clicks;
      const t = demo ? (reduce ? 0 : (now / 1000) % DEMO_LENGTH) : (video.current?.currentTime ?? 0);
      const want = reduce || cropping ? base : cameraAt(t, list, rec.zoom ?? 1.8, base);
      const L = live.current;
      if (Math.abs(t - L.last) > .6 || cropping) { L.s = want.s; L.x = want.x; L.y = want.y; }
      else { const k = 1 - Math.exp(-dt * 5.5); L.s += (want.s - L.s) * k; L.x += (want.x - L.x) * k; L.y += (want.y - L.y) * k; }
      L.last = t;
      const view = cam.current?.parentElement;
      if (cam.current && view) {
        const Wv = view.clientWidth, Hv = view.clientHeight, W = cam.current.offsetWidth, H = cam.current.offsetHeight;
        const tx = clamp(Wv / 2 - L.s * L.x / 100 * W, Wv - L.s * W, 0), ty = clamp(Hv / 2 - L.s * L.y / 100 * H, Hv - L.s * H, 0);
        cam.current.style.transform = `translate(${tx}px, ${ty}px) scale(${L.s})`;
      }
      const p = cursorAt(t, list);
      const hit = list.find(c => t - c.t >= 0 && t - c.t < .6);
      if (cursor.current) { cursor.current.style.left = `${p.x}%`; cursor.current.style.top = `${p.y}%`; cursor.current.style.transform = `scale(${hit && t - hit.t < .18 ? .82 : 1})`; }
      if (ripple.current) { if (hit) { const k = (t - hit.t) / .6; ripple.current.style.left = `${hit.x}%`; ripple.current.style.top = `${hit.y}%`; ripple.current.style.opacity = String(.55 * (1 - k)); ripple.current.style.transform = `translate(-50%,-50%) scale(${.4 + k * 1.8})`; } else ripple.current.style.opacity = '0'; }
      if (!demo && editorMode && video.current) setTime(video.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [demo, JSON.stringify(clicks), rec.zoom, reduce, editorMode, base.s, base.x, base.y, cropping]);

  useEffect(() => { if (video.current) video.current.playbackRate = rec.speed ?? 1; }, [url, rec.speed]);

  const pct = (event: { clientX: number; clientY: number }) => { const r = cam.current!.getBoundingClientRect(); return { x: clamp((event.clientX - r.left) / r.width * 100, 0, 100), y: clamp((event.clientY - r.top) / r.height * 100, 0, 100) }; };
  const startCrop = (event: React.PointerEvent) => {
    if (!cropping || !cam.current) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const a = pct(event); let box = { x: a.x, y: a.y, w: 0, h: 0 }; setDraft(box);
    const move = (e: PointerEvent) => { const b = pct(e); box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; setDraft(box); };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); setDraft(null); setCropping(false); if (box.w > 3 && box.h > 3) save({ crop: { x: Math.round(box.x * 10) / 10, y: Math.round(box.y * 10) / 10, w: Math.round(box.w * 10) / 10, h: Math.round(box.h * 10) / 10 } }); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
  };
  const addClick = (event: React.MouseEvent) => {
    if (cropping) { event.stopPropagation(); return; }
    if (!editorMode || demo || !video.current || !cam.current) return;
    event.stopPropagation();
    const r = cam.current.getBoundingClientRect();
    const x = Math.round(clamp((event.clientX - r.left) / r.width * 100, 1, 99)), y = Math.round(clamp((event.clientY - r.top) / r.height * 100, 1, 99));
    const t = Math.round(video.current.currentTime * 10) / 10;
    video.current.pause();
    save({ clicks: [...clicks.filter(c => Math.abs(c.t - t) > .15), { t, x, y }].sort((a, b) => a.t - b.t) });
  };
  // Upload to the Studio's storage so the published page can play it.
  const publish = async (blob: Blob) => {
    pending.current = blob; setUpload({ progress: 0 });
    try {
      const url = await uploadToStudio(blob, section.id.slice(0, 8), progress => setUpload(u => ({ ...(u ?? {}), progress })));
      pending.current = null; save({ src: url }); setUpload({ progress: 1, note: 'Uploaded · ready for your published page' });
      window.setTimeout(() => setUpload(u => u?.progress === 1 ? null : u), 3500);
    } catch (e) {
      if (e instanceof PasscodeError) setUpload({ progress: 0, needsPasscode: true, note: e.message });
      else setUpload({ progress: 0, note: e instanceof UploadSetupError ? `${e.message} It's saved in this browser for now.` : (e instanceof Error ? e.message : 'Upload failed.') });
    }
  };
  const useBlob = async (blob: Blob) => { setBusy('saving'); try { save({ src: await putMedia(blob), clicks: [] }); void publish(blob); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the video.'); } finally { setBusy(''); } };
  const publishStored = async () => { if (!rec.src.startsWith('idb:')) return; const url = await mediaUrl(rec.src); if (!url) return; void publish(await (await fetch(url)).blob()); };
  const record = async () => { setError(''); try { stopRef.current = await recordScreen(blob => { stopRef.current = null; if (blob.size < 30_000) { setError('That recording came out empty. Choose a window or screen to share, keep it shared while you record, then press Stop.'); return; } void useBlob(blob); }, on => setBusy(on ? 'recording' : '')); } catch (e) { if (e instanceof Error && e.name !== 'NotAllowedError') setError(e.message); } };

  const bgStyle = rec.background === 'image' && rec.bgImage ? { backgroundImage: `url(${rec.bgImage})` } : undefined;
  const sourceButtons = <div className="csb-rec-sources" onClick={e => e.stopPropagation()}>
    <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload size={14} /> Upload video</button>
    <button type="button" onClick={() => void record()} disabled={!!busy}><Circle size={14} /> Record screen</button>
    <button type="button" onClick={() => setLinkMode(m => !m)} disabled={!!busy}><Link2 size={14} /> Video link</button>
    <input ref={fileRef} type="file" accept="video/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void useBlob(f); e.target.value = ''; }} />
  </div>;

  return <div className={`csb-rec csb-rec-bg-${rec.background} csb-rec-frame-${rec.frame}`} style={{ '--rec-pad': `${rec.background === 'none' ? 0 : rec.padding}px`, '--rec-radius': `${rec.radius}px` } as React.CSSProperties}>
    <div ref={stage} className="csb-rec-stage" style={bgStyle}>
      <div className="csb-rec-device">
        {(rec.frame === 'browser' || rec.frame === 'mac') && <div className="csb-rec-bar" aria-hidden="true"><i /><i /><i />{rec.frame === 'browser' && <span>{(section.items[0]?.title || 'yourproduct.com').slice(0, 40)}</span>}</div>}
        {rec.frame === 'phone' && <span className="csb-rec-island" aria-hidden="true" />}
        <div className={`csb-rec-viewport ${editorMode && !demo ? 'is-markable' : ''} ${cropping ? 'is-cropping' : ''}`} style={{ aspectRatio: String(viewAspect) }} onClick={addClick} onPointerDown={startCrop}>
          <div ref={cam} className="csb-rec-cam" style={{ aspectRatio: String(demo ? 16 / 10 : aspect) }}>
            {url ? <video ref={video} src={url} muted playsInline loop={rec.loop !== false} preload="metadata" controls={rec.controls || reduce} onDurationChange={e => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d); }} onLoadedMetadata={e => { const v = e.currentTarget; if (!Number.isFinite(v.duration)) { const reset = () => { v.removeEventListener('timeupdate', reset); v.currentTime = 0; if (!reduce) void v.play().catch(() => undefined); }; v.addEventListener('timeupdate', reset); v.currentTime = 1e101; } else setDuration(v.duration || 0); if (e.currentTarget.videoWidth) setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight); e.currentTarget.playbackRate = rec.speed ?? 1; }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-label={section.title} />
              : <div className="csb-rec-demo" aria-hidden="true"><div className="csb-rec-demo-side"><b /><i /><i /><i /><i /></div><div className="csb-rec-demo-main"><b /><div><i /><i /><i /></div><span /><span /><em /></div></div>}
            {rec.cursor !== 'none' && !reduce && <div ref={cursor} className={`csb-rec-cursor is-${rec.cursor}`} aria-hidden="true">{rec.cursor === 'arrow' ? <svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 2.8 19.4 13.6l-6.5.9 3.8 7.2-2.9 1.5-3.8-7.3-4.9 4.5z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" /></svg> : <i />}</div>}
            <span ref={ripple} className="csb-rec-ripple" aria-hidden="true" />
            {draft && <span className="csb-rec-cropbox" style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }} />}
            {cropping && !draft && rec.crop && <span className="csb-rec-cropbox is-current" style={{ left: `${rec.crop.x}%`, top: `${rec.crop.y}%`, width: `${rec.crop.w}%`, height: `${rec.crop.h}%` }} />}
          </div>
          {url && !playing && reduce && <button type="button" className="csb-rec-play" aria-label={`Play ${section.title}`} onClick={e => { e.stopPropagation(); void video.current?.play(); }}><Play size={22} fill="currentColor" /></button>}
          {demo && editorMode && <div className="csb-rec-empty" onClick={e => e.stopPropagation()}>
            <strong>Add a screen recording</strong>
            <span>Clicks you mark become zoom-ins, like this demo.</span>
            {sourceButtons}
            {linkMode && <form className="csb-rec-link" onSubmit={e => { e.preventDefault(); if (/^https:\/\/\S+$/i.test(link.trim())) { save({ src: link.trim(), clicks: [] }); setLinkMode(false); setLink(''); } else setError('Paste an https link to a video file (.mp4, .webm or .mov).'); }}><input autoFocus value={link} onChange={e => setLink(e.target.value)} placeholder="https://…/demo.mp4" aria-label="Video link" /><button type="submit">Use link</button></form>}
            {busy === 'saving' && <small>Saving video…</small>}
            {error && <em role="alert">{error}</em>}
          </div>}
          {missing && editorMode && <div className="csb-rec-empty"><strong>This video is stored in another browser</strong><span>Add it again, or use a video link for the published page.</span>{sourceButtons}</div>}
        </div>
      </div>
      {rec.frame === 'laptop' && <div className="csb-rec-base" aria-hidden="true" />}
    </div>

    {editorMode && !demo && <div className="csb-rec-editbar" onClick={e => e.stopPropagation()}>
      <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { const v = video.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); }}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
      <div className="csb-rec-scrub">
        <input type="range" min={0} max={duration || 1} step={.05} value={time} aria-label="Seek" onChange={e => { const v = video.current; if (v) { v.pause(); v.currentTime = Number(e.target.value); } }} />
        {duration > 0 && clicks.map((c, i) => <button key={i} type="button" className="csb-rec-mark" style={{ left: `${c.t / duration * 100}%` }} title={`Click ${i + 1} at ${fmt(c.t)}`} aria-label={`Go to click ${i + 1} at ${fmt(c.t)}`} onClick={() => { const v = video.current; if (v) { v.pause(); v.currentTime = Math.max(0, c.t - LEAD - .2); } }} />)}
      </div>
      <span className="csb-rec-time">{fmt(time)}</span>
      <button type="button" className={`csb-rec-tool ${cropping ? 'is-on' : ''}`} onClick={() => { video.current?.pause(); setCropping(c => !c); }}>{cropping ? 'Drag on the video…' : rec.crop ? 'Re-crop' : 'Crop to a detail'}</button>
      {rec.crop && !cropping && <button type="button" className="csb-rec-tool" onClick={() => save({ crop: undefined })}>Show full</button>}
      <span className="csb-rec-hint">{cropping ? 'Drag a box around the part to show' : 'Click the video to add a zoom moment'}</span>
    </div>}
    {editorMode && !demo && <div className="csb-rec-swap">{sourceButtons}{linkMode && <form className="csb-rec-link" onSubmit={e => { e.preventDefault(); if (/^https:\/\/\S+$/i.test(link.trim())) { save({ src: link.trim() }); setLinkMode(false); setLink(''); } }}><input value={link} onChange={e => setLink(e.target.value)} placeholder="https://…/demo.mp4" aria-label="Video link" /><button type="submit">Use link</button></form>}{rec.src.startsWith('idb:') && !upload && <button type="button" className="csb-rec-publish" onClick={() => void publishStored()}>Upload for my published page</button>}{error && <em role="alert">{error}</em>}</div>}

    {editorMode && upload && <div className={`csb-rec-upload ${upload.progress === 1 ? 'is-done' : ''}`} onClick={e => e.stopPropagation()} role="status">
      {upload.needsPasscode ? <form onSubmit={e => { e.preventDefault(); try { localStorage.setItem(PASSCODE_KEY, passcode.trim()); } catch { /* storage unavailable */ } if (pending.current) void publish(pending.current); else void publishStored(); }}><span>{upload.note}</span><input type="password" autoComplete="off" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Studio passcode" aria-label="Studio passcode" /><button type="submit" disabled={!passcode.trim()}>Upload</button></form>
        : <><span className="csb-rec-upload-bar"><i style={{ width: `${Math.round(upload.progress * 100)}%` }} /></span><span>{upload.note ?? `Uploading for your published page… ${Math.round(upload.progress * 100)}%`}</span>{upload.note && upload.progress < 1 && <button type="button" onClick={() => setUpload(null)}>Dismiss</button>}</>}
    </div>}
    {busy === 'recording' && <div className="csb-rec-recording" role="status"><span /> Recording… <button type="button" onClick={() => stopRef.current?.()}><Square size={12} fill="currentColor" /> Stop</button></div>}
    {(editorMode || section.items[0]?.detail) && <p className="csb-rec-caption"><EditableText field="items.0.detail" value={section.items[0]?.detail || ''} /></p>}
  </div>;
}
