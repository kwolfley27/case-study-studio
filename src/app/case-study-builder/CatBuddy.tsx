import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import sprite from './assets/cat-sprite.png';
import type { BuilderStudy, CaseStudySection } from './model';
import { ENDPOINT as AI_URL } from './AiDraft';
import { publicAnonKey } from '../../utils/supabase/info';
import type { ComponentTemplate } from './library';

/*
  Miso: a little Siamese cat in the corner of the studio that you can talk to.
  - Click the cat to wake it up or put it to sleep. Drag it anywhere; double-click to send it home. It stays awake (even after a reload) until you say "Miso, sleep" or click it.
  - It listens with the browser's own speech recognition, so listening costs nothing and nothing is sent to Claude.
  - It only acts when you say its name first ("Miso, preview"), or within a few seconds of its last answer.
  - The basics are understood right here (no tokens). Anything else goes to Claude through the studio's AI function.
  - Hold Option (Alt) and draw around something on the page to point at it ("this").
*/
const W = 37, H = 48, SCALE = 2;
type Mode = 'canvas' | 'framed' | 'preview';
export type CatActions = {
  sections: CaseStudySection[];
  selectedId: string | null;
  select: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  remove: (id: string) => void;
  setVariant: (id: string, variant: string) => void;
  templates: ComponentTemplate[];
  add: (t: ComponentTemplate) => void;
  setMode: (m: Mode | 'present') => void;
  openPublish: () => void;
  openResearch: () => void;
  openBrand: () => void;
  labelOf: (s: CaseStudySection) => string;
  // For requests Claude handles:
  setText: (sectionId: string, field: string, value: string) => void;
  moveTo: (sectionId: string, toIndex: number) => void;
  addAfter: (t: ComponentTemplate, afterId?: string) => string | void;
  placeClip: (slot: string, clip: Clip) => void;
  snapshot: () => BuilderStudy;
  restore: (s: BuilderStudy) => void;
  mode: string;
  studyTitle: string;
  heroHasImage: boolean;
  header: { eyebrow: string; title: string; summary: string; facts: Array<{ label: string; value: string }> };
  setStudyText: (field: string, value: string) => void;
};
export type Clip = { image: string; figmaUrl?: string; name?: string; at?: number; picked?: boolean; text?: string; site?: string; url?: string; title?: string };
type Reply = 'chirp' | 'voice' | 'silent';

/* A soft two-note "mrrp", made on the spot (no audio files). */
function chirp(kind: 'ok' | 'hm' = 'ok') {
  try {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext; const ctx: AudioContext = new C();
    const notes = kind === 'ok' ? [[740, 0], [1110, .09]] : [[880, 0], [700, .1]];
    for (const [f, t] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ctx.currentTime + t); g.gain.linearRampToValueAtTime(.07, ctx.currentTime + t + .015); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .16);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .18);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch { /* no audio */ }
}
/* The most natural voice the computer has (Apple's Premium/Enhanced voices, Google, Microsoft Natural), at a normal pitch. */
function niceVoice(): SpeechSynthesisVoice | null {
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); if (!vs.length) return null;
  const rank = (v: SpeechSynthesisVoice) => (/premium|enhanced|natural|neural/i.test(v.name) ? 10 : 0) + (/ava|samantha|allison|zoe|serena|google us english|aria|jenny/i.test(v.name) ? 5 : 0) + (/en-US/i.test(v.lang) ? 1 : 0) - (/compact|novelty|bells|bubbles|whisper|zarvox|trinoids|albert|bad news|good news|organ|cellos/i.test(v.name) ? 20 : 0);
  return [...vs].sort((a, b) => rank(b) - rank(a))[0];
}

type SR = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; abort: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };
const getSR = (): (new () => SR) | null => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
const store = { get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
/* Which browser this is. Speech-to-text only works in Google Chrome, Edge and Safari; Brave, Arc, Opera and
   Firefox either lack it or have it switched off. */
function browserName(): string {
  const n = navigator as any; const brands: string[] = (n.userAgentData?.brands ?? []).map((b: any) => b.brand);
  if (n.brave) return 'Brave';
  try { if (getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title')) return 'Arc'; } catch { /* ignore */ }
  if (brands.some(b => /Edge/.test(b))) return 'Edge';
  if (brands.some(b => /Opera/.test(b)) || /OPR\//.test(navigator.userAgent)) return 'Opera';
  if (brands.some(b => /Google Chrome/.test(b))) return 'Chrome';
  if (/Firefox\//.test(navigator.userAgent)) return 'Firefox';
  if (/Safari\//.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent)) return 'Safari';
  return brands.find(b => !/Not|Chromium/.test(b)) || 'this browser';
}
const SPEECH_BAD = ['Brave', 'Arc', 'Opera', 'Firefox'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* Pick the best match for spoken words among names (simple word overlap, good enough for section names). */
function bestMatch<T>(said: string, list: T[], names: (t: T) => string[]): T | null {
  const w = norm(said).split(' ').filter(x => x.length > 2 && !['the', 'section', 'part', 'one', 'and'].includes(x));
  if (!w.length) return null;
  let best: T | null = null, score = 0;
  for (const t of list) {
    const text = norm(names(t).join(' '));
    let s = 0; for (const x of w) if (text.includes(x)) s += x.length;
    if (norm(names(t)[0] ?? '') === norm(said)) s += 50;
    if (s > score) { score = s; best = t; }
  }
  return score >= 4 ? best : null;
}

export function CatBuddy({ actions }: { actions: CatActions }) {
  const [awake, setAwake] = useState(() => store.get('csb-cat-on', '0') === '1');
  const [name, setName] = useState(() => store.get('csb-cat-name', 'Miso'));
  const [replyMode, setReplyMode] = useState<Reply>(() => (store.get('csb-cat-reply', 'chirp') as Reply));
  const [thinking, setThinking] = useState(false);
  const [typing, setTyping] = useState(false);       // pretending to type an answer on my little laptop
  // What's going on with hearing, so problems are visible instead of silent.
  const [status, setStatus] = useState<'off' | 'starting' | 'listening' | 'words' | string>('off');
  const gotWords = useRef(false); const loudFor = useRef(0);
  const browser = typeof window !== 'undefined' ? browserName() : '';
  // 'all': everything you say goes to Claude (smart, follows the conversation). 'name': only after "Miso".
  const [listenMode, setListenMode] = useState<'all' | 'name'>(() => (store.get('csb-cat-listen', 'all') === 'name' ? 'name' : 'all'));
  const listenRef = useRef(listenMode); listenRef.current = listenMode;
  // What we've said lately and what we're working on, kept through reloads (this tab only for the talk, a few hours for the plan).
  const history = useRef<Array<{ who: 'katelyn' | 'miso'; text: string }>>((() => { try { return JSON.parse(sessionStorage.getItem('csb-cat-talk') || '[]'); } catch { return []; } })());
  const remember = (who: 'katelyn' | 'miso', text: string) => { if (!text) return; history.current = [...history.current, { who, text: text.slice(0, who === 'miso' ? 900 : 300) }].slice(-20); try { sessionStorage.setItem('csb-cat-talk', JSON.stringify(history.current)); } catch { /* ignore */ } };
  const plan = useRef<string>((() => { try { const p = JSON.parse(localStorage.getItem('csb-cat-plan') || 'null'); return p && Date.now() - p.at < 6 * 3600e3 ? String(p.text) : ''; } catch { return ''; } })());
  const setPlan = (t: string) => { plan.current = t.slice(0, 200); try { localStorage.setItem('csb-cat-plan', JSON.stringify({ text: plan.current, at: Date.now() })); } catch { /* ignore */ } };
  const buffer = useRef<string[]>([]); const bufTimer = useRef(0); const busy = useRef(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const clipRef = useRef<Clip | null>(null); clipRef.current = clip;
  const undo = useRef<BuilderStudy[]>([]);
  const pointer = useRef<[number, number] | null>(null);
  const [frame, setFrame] = useState(0);              // 0 idle, 1 blink, 2 ears up
  const startRef = useRef<() => void>(() => {}); const fails = useRef(0); const lastWords = useRef(0); const lastPicked = useRef<number | undefined>(0); const figmaAt = useRef(0); const bornAt = useRef(0);
  const figmaHas = useRef(false);               // the Figma tab is listening right now (only one tab can at a time)
  const [onFigma, setOnFigma] = useState(false);
  const hearRef = useRef<(said: string, fromFigma: boolean) => boolean>(() => false); const startBriefRef = useRef<(f: boolean) => void>(() => {});
  const wakeRef = useRef<(on: boolean) => void>(() => {});
  const [ext, setExt] = useState('');               // extension version, once it answers
  const [level, setLevel] = useState(0);              // mic loudness 0–1
  const [heard, setHeard] = useState('');             // live caption
  const [bubble, setBubble] = useState<{ text: string; n: number; stay?: boolean } | null>(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [hello, setHello] = useState(false);
  // Drag me anywhere; I remember the spot (as a share of the window, so it survives resizing).
  const [spot, setSpot] = useState<[number, number] | null>(() => { try { const v = JSON.parse(localStorage.getItem('csb-cat-spot') || 'null'); return Array.isArray(v) ? v as [number, number] : null; } catch { return null; } });
  const dragged = useRef(false);
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = (e.currentTarget as HTMLElement).closest('.csb-cat') as HTMLElement; const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top, sx = e.clientX, sy = e.clientY; dragged.current = false;
    const move = (ev: PointerEvent) => {
      if (!dragged.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      dragged.current = true;
      const x = Math.min(innerWidth - r.width - 4, Math.max(4, ev.clientX - ox)), y = Math.min(innerHeight - r.height - 4, Math.max(4, ev.clientY - oy));
      setSpot([x / innerWidth, y / innerHeight]);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setSpot(sp => { try { localStorage.setItem('csb-cat-spot', JSON.stringify(sp)); } catch { /* ignore */ } return sp; }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const act = useRef(actions); act.current = actions;
  const follow = useRef(0);                           // until when a follow-up needs no name
  const pending = useRef<null | (() => void)>(null);  // waiting for "yes"
  const target = useRef<string | null>(null);         // what was circled
  const speaking = useRef(false);
  const sr = useRef<SR | null>(null);
  const nameRef = useRef(name); nameRef.current = name;
  const replyRef = useRef(replyMode); replyRef.current = replyMode;
  const supported = typeof window !== 'undefined' && !!getSR();

  const remote = useRef(false); // the current request came from the Figma tab: answer there too
  const say = (text: string, tone: 'ok' | 'hm' = 'ok', kind = '') => {
    if (remote.current) { window.postMessage({ source: 'miso-page', type: 'reply', text, tone, kind }, location.origin); }
    if (text && text !== '…') remember('miso', text);
    setBubble(b => ({ text, n: (b?.n ?? 0) + 1 })); follow.current = Date.now() + 8000;
    if (replyRef.current === 'chirp') { chirp(tone); return; }
    if (replyRef.current !== 'voice' || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); const v = niceVoice(); if (v) u.voice = v; u.rate = 1.02; u.pitch = 1;
      u.onstart = () => { speaking.current = true; }; u.onend = () => { speaking.current = false; follow.current = Date.now() + 8000; };
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  };
  useEffect(() => { if (!bubble || bubble.stay) return; const t = setTimeout(() => setBubble(null), 4200); return () => clearTimeout(t); }, [bubble?.n]);

  /* ---------- understanding a command (all local) ---------- */
  const run = (raw: string): Promise<void> | void => {
    const a = act.current; const s = norm(raw);
    const cur = target.current ?? a.selectedId; const curSec = a.sections.find(x => x.id === cur);
    if (pending.current) { if (/^(yes|yeah|yep|do it|sure|ok|okay)\b/.test(s)) { const f = pending.current; pending.current = null; f(); return; } pending.current = null; if (/^(no|nope|cancel|never mind)\b/.test(s)) { say('Okay, I left it.'); return; } }
    if (/^(drop|let go of|put down|forget|let go) (it|that|this|the frame|the screen|the picture)( now)?$|^(let it go|let go|drop|put it down)$/.test(s)) { dropClip(); return; }
    if (/^(undo|undo that|take that back|go back)\b/.test(s)) { const prev = undo.current.pop(); if (!prev) { say('Nothing to undo.', 'hm'); return; } a.restore(prev); say('Undone.'); return; }
    if (/\b(put|place|drop|paste|add) (it|this|that|the frame|the screen)( here| there| in here)?\b/.test(s) && clipRef.current && !remote.current) { const slot = slotHere(); if (!slot) { say('Point at the spot first, then say put it here.', 'hm'); return; } undo.current.push(a.snapshot()); const nm = clipRef.current.name || 'it'; a.placeClip(slot, clipRef.current); dropClip(true); say(`Placed ${nm}.`); return; }
    if (/\b(sleep|go to sleep|stop listening|that s all|bye)\b/.test(s)) { say('Napping. Click me when you need me.'); setTimeout(() => sleep(), 900); return; }
    if (/\b(thank|thanks|good (cat|kitty|job))\b/.test(s)) { say('Purr.'); return; }
    if (/\b(what can (i|you) (say|do)|help)\b/.test(s)) { say('Try preview, edit, present, publish, go to a section, add a section, move this up, or make this dark.'); setMenu(true); return; }
    if (/\bpresent\b/.test(s)) { a.setMode('present'); say('Presenting.'); return; }
    if (/\bpreview\b/.test(s)) { a.setMode('preview'); say('Preview.'); return; }
    if (/\b(edit|editing|back to edit)\b/.test(s) && !/\bedit (the|this) /.test(s)) { a.setMode('canvas'); say('Back to editing.'); return; }
    if (/\bpublish\b/.test(s)) { a.openPublish(); say('Here’s publish.'); return; }
    if (/\bresearch\b/.test(s) && /\b(open|go|show)\b/.test(s)) { a.openResearch(); say('Opening research.'); return; }
    if (/\b(brand|fonts|logo)\b/.test(s) && /\b(open|go|show)\b/.test(s)) { a.openBrand(); say('Brand settings.'); return; }
    const mv = s.match(/\bmove (?:it|this|that|the section)? ?(up|down)\b/);
    if (mv) { if (!curSec) { say('Which one? Click it or circle it first.'); return; } a.move(curSec.id, mv[1] === 'up' ? -1 : 1); say(mv[1] === 'up' ? 'Moved up.' : 'Moved down.'); return; }
    const vr = s.match(/\b(?:make|set|turn) (?:it|this|that|the background)? ?(dark|black|tinted|grey|gray|light|white)\b/);
    if (vr) { if (!curSec) { say('Which section? Click or circle it first.'); return; } const v = /dark|black/.test(vr[1]) ? 'dark' : /tint|gr[ae]y/.test(vr[1]) ? 'tinted' : 'light'; a.setVariant(curSec.id, v); say(v === 'dark' ? 'Dark it is.' : v === 'tinted' ? 'Tinted.' : 'Light.'); return; }
    if (/\b(delete|remove) (this|that|the) section\b/.test(s)) { if (!curSec) { say('Which section? Click or circle it first.'); return; } pending.current = () => { a.remove(curSec.id); target.current = null; say('Deleted.'); }; say(`Delete ${a.labelOf(curSec)}? Say yes.`); return; }
    const add = s.match(/\badd (?:a |an |another |the )?(.+?)(?: section| component)?$/);
    if (add) { const t = bestMatch(add[1], a.templates, t => [t.name, t.kind, t.tags]); if (!t) { say(`I couldn’t find “${add[1]}”.`); return; } a.add(t); say(`Added ${t.name}.`); return; }
    const go = s.match(/\b(?:go to|show me|show|open|select|jump to|scroll to) (?:the )?(.+)$/);
    if (go) { const sec = bestMatch(go[1], a.sections, x => [a.labelOf(x), x.title, x.eyebrow, x.navLabel ?? '', x.kind]); if (!sec) { say(`I couldn’t find “${go[1]}”.`); return; } target.current = sec.id; a.select(sec.id); document.getElementById(`builder-section-${sec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); say(a.labelOf(sec) + '.'); return; }
    return askClaude(raw);
  };

  /* Where "here" is: the image spot under the mouse, else the first empty spot in the circled/selected section. */
  const slotHere = (): string | null => {
    const p = pointer.current; const a = act.current;
    if (p) { const el = document.elementFromPoint(p[0], p[1])?.closest('[data-image-slot]') as HTMLElement | null; const sl = el?.dataset.imageSlot; if (sl && /:\d+$/.test(sl)) return sl; }
    const id = target.current ?? a.selectedId; const sec = a.sections.find(x => x.id === id); if (!sec) return null;
    const k = sec.items.findIndex(it => !it.image); return `${sec.id}:${k >= 0 ? k : 0}`;
  };

  /* Let go of the frame I'm carrying (say "drop it", click the frame, or it happens once it's placed). */
  const dropClip = (quiet = false) => {
    if (!clipRef.current) { if (!quiet) say('I’m not holding anything.', 'hm'); return; }
    clipRef.current = null; setClip(null); window.postMessage({ source: 'miso-page', type: 'clear' }, location.origin);
    if (brief.current) endBrief();
    if (!quiet) say('Dropped it.');
  };
  /* The little chat, for questions and feedback ("how's the title looking?"). */
  const [chat, setChat] = useState<{ open: boolean; items: Array<{ who: 'katelyn' | 'miso'; text: string }> }>({ open: false, items: [] });
  const [draft, setDraft] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chat.items.length, chat.open]);
  const sendDraft = () => { const t = draft.trim(); if (!t) return; setDraft(''); remember('katelyn', t); typedRef.current = t; void askClaude(t, false); };
  const typedRef = useRef('');

  /* ---------- talking about a frame ----------
     After you pick a frame I just take notes while you talk about it. When you pause (or say "that's it"),
     I nod, tell you what I'd make (or ask one question), and only build it once you say okay. */
  const brief = useRef<{ words: string[]; phase: 'notes' | 'asking' | 'proposed'; fromFigma: boolean; timer: number } | null>(null);
  const [notes, setNotes] = useState<{ words: string; phase: string } | null>(null);
  const [nod, setNod] = useState(0);
  const showNotes = () => { const b = brief.current; setNotes(b ? { words: b.words.join(' '), phase: b.phase } : null); if (b && b.fromFigma) window.postMessage({ source: 'miso-page', type: 'reply', text: b.words.length ? b.words.join(' ') : 'Tell me about it. I’m taking notes.', tone: 'ok', kind: 'note' }, location.origin); };
  const startBrief = (fromFigma: boolean) => { clearTimeout(brief.current?.timer); pending.current = null; brief.current = { words: [], phase: 'notes', fromFigma, timer: 0 }; showNotes(); };
  const endBrief = () => { clearTimeout(brief.current?.timer); brief.current = null; setNotes(null); setBubble(bb => (bb?.stay ? null : bb)); };
  const propose = () => {
    const b = brief.current; if (!b || !b.words.length) { endBrief(); return; }
    clearTimeout(b.timer); setNod(n => n + 1); chirp();
    if (b.fromFigma) window.postMessage({ source: 'miso-page', type: 'reply', text: 'Got it. Thinking…', tone: 'ok', kind: 'nod' }, location.origin);
    b.phase = 'proposed'; showNotes(); remote.current = b.fromFigma;
    Promise.resolve(askClaude(b.words.join(' '), false, 'frame_brief', true)).finally(() => { remote.current = false; });
  };
  const DONE_TALKING = /\b(that'?s (it|all)|i'?m done|go ahead|what do you think|okay go|ok go|make it|build it)\W*$/i;
  // Every finished phrase goes through here first.
  const hear = (said: string, fromFigma: boolean): boolean => {
    const b = brief.current; if (!b) return false; const s = norm(said);
    if (/^(never mind|cancel|forget it|stop)\b/.test(s)) { endBrief(); pending.current = null; remote.current = fromFigma; say('Okay, dropped it.'); remote.current = false; return true; }
    if (b.phase === 'proposed') {
      if (pending.current && /^(yes|yeah|yep|yup|do it|sure|ok|okay|sounds good|perfect|great|go for it)\b/.test(s)) { const f = pending.current; pending.current = null; remote.current = fromFigma; f(); remote.current = false; endBrief(); return true; }
      // Anything else is a change or an answer: add it to the notes and think again.
      pending.current = null; b.words.push(`(then she said:) ${said}`); b.fromFigma = fromFigma; propose(); return true;
    }
    b.words.push(said); b.fromFigma = fromFigma; showNotes(); clearTimeout(b.timer);
    if (DONE_TALKING.test(said.trim())) { propose(); return true; }
    b.timer = window.setTimeout(propose, 4500);      // a real pause means you're finished
    return true;
  };
  // A smaller copy of the frame for Claude to look at (keeps each request light).
  const small = async (src: string) => { const im = new Image(); im.src = src; await im.decode(); const k = Math.min(1, 1100 / im.naturalWidth, 2200 / im.naturalHeight); const cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k); cv.getContext('2d')!.drawImage(im, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', .82); };
  /* Anything I don't understand myself goes to Claude, with a compact picture of the case study. */
  const askClaude = async (said: string, ambient = false, event = '', hold = false) => {
    const a = act.current;
    let pass = ''; try { pass = localStorage.getItem('csb-ai-passcode') || ''; } catch { /* ignore */ }
    if (!AI_URL) { say('I can only do the basics here.', 'hm'); return; }
    if (!pass) { say('I need your Studio passcode first. Add it in Draft with AI.', 'hm'); return; }
    // "Put my screenshot in…": a Mac screenshot copied to the clipboard (⌘⌃⇧4) becomes what I'm holding.
    if (/screen ?shot|what i (just )?copied|from my clipboard/i.test(said)) {
      try { for (const it of await navigator.clipboard.read()) { const t = it.types.find(x => x.startsWith('image/')); if (t) { const blob = await it.getType(t); const image = await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(blob); }); const c: Clip = { image, name: 'your screenshot', at: Date.now() }; clipRef.current = c; setClip(c); break; } } } catch { /* clipboard not allowed or empty */ }
    }
    // A question ("how's the title?", "how's the case study overall?"): send the whole case study, not a summary,
    // so the answer can weigh the title against the problem, the process and the results.
    const review = /\?|^(hey |so |okay |ok |um |hmm )*(how|what|is|does|do|should|would|could|can|which|why)\b|what do you think|how('s| is| are)|feedback|thoughts|review|critique|evaluate/i.test(said.trim());
    const cut = (t?: string, n = 160) => (t ?? '').replace(/\s+/g, ' ').slice(0, n);
    const context = {
      ambient, event, plan: plan.current, history: history.current.slice(-16, event ? undefined : -1), studyTitle: a.studyTitle, header: a.header, heroHasImage: a.heroHasImage, mode: a.mode, selectedId: a.selectedId, target: target.current, fromAnotherTab: remote.current,
      clip: clipRef.current ? { name: clipRef.current.name, figmaUrl: clipRef.current.figmaUrl, site: clipRef.current.site, url: clipRef.current.url, pageTitle: clipRef.current.title, text: clipRef.current.text?.slice(0, 5000) } : null,
      pointingAtSlot: slotHere(),
      fullStudy: review,
      sections: a.sections.map((x, i) => ({ index: i, id: x.id, kind: x.kind, hidden: (x as { hidden?: boolean }).hidden || undefined, title: cut(x.title, review ? 300 : 120), eyebrow: cut(x.eyebrow, 60), body: cut(x.body, review ? 1500 : 240), variant: x.variant,
        items: x.items.slice(0, review ? 40 : 12).map((it, k) => ({ i: k, title: cut(it.title, review ? 200 : 80), detail: cut(it.detail, review ? 700 : 160), ...(review && (it as { value?: string }).value ? { value: cut((it as { value?: string }).value, 80) } : {}), hasImage: !!it.image })) })),
      templates: a.templates.map(t => ({ id: t.id, name: t.name, kind: t.kind })),
    };
    busy.current = true; setThinking(true);
    const asking = review;
    if (!ambient || asking) setBubble(b => ({ text: asking ? 'Hmm…' : '…', n: (b?.n ?? 0) + 1 }));
    if (asking) setTyping(true);
    if (asking && remote.current) window.postMessage({ source: 'miso-page', type: 'reply', text: 'Hmm…', tone: 'ok', kind: 'think' }, location.origin);
    try {
      const c = clipRef.current; const fresh = !!c && Date.now() - (c.at ?? 0) < 20 * 60 * 1000;
      const image = fresh && (event || remote.current || /\b(this|it|that|frame|screen|build|make|use|put|fill|add)\b/i.test(said)) ? await small(c!.image).catch(() => '') : '';
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, 'X-Studio-Passcode': pass }, body: JSON.stringify({ task: 'assistant', said, context, image }), signal: AbortSignal.timeout(35000) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { say('That passcode didn’t work.', 'hm'); return; }
      if (!r.ok || !d || !Array.isArray(d.actions)) { say(/Notion research link/.test(d?.error || '') ? 'My brain needs the latest AI update deployed.' : 'Hmm, that didn’t work. Try again?', 'hm'); return; }
      const acts = d.actions as Array<Record<string, any>>;
      if (typeof d.plan === 'string') setPlan(d.plan);
      const risky = acts.some(x => x.type === 'delete_section');
      const apply = () => {
        if (acts.length) undo.current.push(a.snapshot());
        // Sections added in this reply are called "new1", "new2"… so later actions can fill them in.
        const made: string[] = []; const idOf = (v: unknown) => { const m = String(v ?? '').match(/^new(\d*)$/); return m ? made[(Number(m[1]) || made.length) - 1] : String(v ?? ''); };
        for (const x0 of acts) {
          const x = { ...x0, sectionId: idOf(x0.sectionId), afterId: x0.afterId ? idOf(x0.afterId) : undefined };
          const isNew = made.includes(x.sectionId);
          const sec = a.sections.find(y => y.id === x.sectionId) ?? (isNew ? { id: x.sectionId, items: [] as Array<{ image?: string }> } as unknown as typeof a.sections[number] : undefined);
          if (x.type === 'set_text' && x.sectionId === 'hero' && typeof x.field === 'string' && typeof x.value === 'string') a.setStudyText(x.field === 'eyebrow' ? 'client' : x.field, x.value);
          else if (x.type === 'set_text' && sec && typeof x.field === 'string' && typeof x.value === 'string') a.setText(sec.id, x.field, x.value);
          if (x.type === 'add_section') { const t = a.templates.find(y => y.id === x.templateId); if (t) { const id = a.addAfter(t, x.afterId); if (id) made.push(id); } }
          if (x.type === 'move_section' && sec && Number.isFinite(x.toIndex)) a.moveTo(sec.id, Number(x.toIndex));
          if (x.type === 'delete_section' && sec) a.remove(sec.id);
          if (x.type === 'set_variant' && sec && x.variant) a.setVariant(sec.id, x.variant);
          if (x.type === 'select' && sec) { target.current = sec.id; a.select(sec.id); document.getElementById(`builder-section-${sec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          if (x.type === 'place_clip' && clipRef.current) { const sl = x.sectionId === 'hero' ? 'hero' : sec ? `${sec.id}:${Number.isFinite(x.itemIndex) ? x.itemIndex : Math.max(0, sec.items.findIndex(it => !it.image))}` : slotHere(); if (sl) a.placeClip(isNew && !Number.isFinite(x.itemIndex) ? `${x.sectionId}:0` : sl, clipRef.current); }
          if (x.type === 'set_mode' && x.mode) a.setMode(x.mode);
        }
        if (acts.some(x => x.type === 'place_clip')) setTimeout(() => dropClip(true), 400);   // it's placed: I let go of it
      };
      if (typeof d.answer === 'string' && d.answer.trim()) {
        // A question or a request for feedback: answer in the chat.
        apply();
        const ans = d.answer.trim(); setChat(c => ({ open: true, items: [...c.items, { who: 'katelyn' as const, text: said }, { who: 'miso' as const, text: ans }].slice(-30) }));
        if (remote.current) window.postMessage({ source: 'miso-page', type: 'reply', text: ans, tone: 'ok', kind: 'chat' }, location.origin);
        remember('miso', ans); setBubble(null); chirp(); return;
      }
      if (hold) {
        // Talking about a frame: show the plan (or the question) and wait for okay.
        const line = String(d.say ?? '').trim() || (acts.length ? 'Here’s my plan. Okay?' : 'What should I make with it?');
        if (acts.length) pending.current = () => { apply(); say(String(d.done || 'Done. It’s in.')); };
        say(line, 'hm', 'plan'); setBubble(bb => ({ text: line, n: (bb?.n ?? 0) + 1, stay: true })); return;
      }
      if (risky) { pending.current = () => { apply(); say('Done.'); }; say(`${String(d.say || 'Delete it?')} Say yes to go ahead.`, 'hm'); return; }
      apply();
      const line = String(d.say ?? '').trim();
      if (line) say(line, acts.length ? 'ok' : 'hm'); else if (acts.length) say('Done.'); else if (!ambient) say('Okay.', 'hm');
    } catch { say('I couldn’t reach my brain. Try again?', 'hm'); }
    finally { setThinking(false); setTyping(false); busy.current = false; }
  };

  /* A screen brought over from Figma by the Miso extension. */
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== 'miso-ext') return;
      setExt(String(e.data.version || 'yes'));
      if (e.data.type === 'figma') { figmaAt.current = Date.now(); if (!!e.data.on === figmaHas.current) return; figmaHas.current = !!e.data.on; setOnFigma(!!e.data.on); if (e.data.on && !document.hasFocus()) { try { sr.current?.abort(); } catch { /* ignore */ } sr.current = null; } else startRef.current(); return; }
      if (e.data.type === 'wake') { const want = !!e.data.awake; if (want !== (store.get('csb-cat-on', '0') === '1')) wakeRef.current(want); return; }
      if (e.data.type !== 'clip' && e.data.type !== 'command') return;
      if (e.data.type === 'command') {
        if (e.data.clip) { setClip(e.data.clip); clipRef.current = e.data.clip; }
        const said = String(e.data.said || ''); remember('katelyn', said);
        if (e.data.ambient && hearRef.current(said, true)) return;
        remote.current = true; Promise.resolve(e.data.ambient ? askClaude(said, true) : run(said)).finally(() => { remote.current = false; });
        return;
      }
      const c = e.data.clip as Clip | null; setClip(c);
      clipRef.current = c;
      // Picked by clicking in Figma while we have a plan (like filling this case study): let Claude place it.
      if (c?.picked && Date.now() - (c.at ?? 0) < 60 * 1000 && c.at !== lastPicked.current) { lastPicked.current = c.at; startBriefRef.current(true); return; }
      if (c && Date.now() - (c.at ?? 0) < 10 * 60 * 1000) { setBubble(b => ({ text: `Got ${c.name || 'a frame'}. Point and say “put it here”.`, n: (b?.n ?? 0) + 1 })); follow.current = Date.now() + 12000; chirp(); }
    };
    window.addEventListener('message', on);
    const hello = () => window.postMessage({ source: 'miso-page', type: 'hello' }, location.origin);
    hello(); window.addEventListener('focus', hello);
    const mv = (e: PointerEvent) => { pointer.current = [e.clientX, e.clientY]; };
    window.addEventListener('pointermove', mv, { passive: true });
    return () => { window.removeEventListener('message', on); window.removeEventListener('focus', hello); window.removeEventListener('pointermove', mv); };
  }, []);

  /* ---------- listening ---------- */
  const handle = (text: string, final: boolean) => {
    if (speaking.current) return;                     // don't hear myself
    const s = norm(text); const nm = norm(nameRef.current);
    const idx = (' ' + s + ' ').indexOf(' ' + nm + ' ');
    const named = idx >= 0 || /\bhey (cat|kitty)\b/.test(s);
    const cmd = idx >= 0 ? s.slice(idx + nm.length).trim() : s.replace(/\bhey (cat|kitty)\b/, '').trim();
    if (listenRef.current === 'all') {
      // Show what I'm hearing, always, so you can see I'm listening.
      setHeard(text.trim().slice(-120) || '…');
      if (!final) return;
      setTimeout(() => setHeard(h => (h === text.trim().slice(-120) ? '' : h)), 1600);
      if (brief.current) { remember('katelyn', text.trim()); hear(text.trim(), false); return; }
      if (pending.current || (named && cmd && quick(cmd))) { remember('katelyn', text.trim()); void run(cmd || s); return; }
      // Everything else: gather what you say until you pause, then ask Claude what (if anything) to do.
      buffer.current.push(text.trim()); clearTimeout(bufTimer.current);
      bufTimer.current = window.setTimeout(flush, 1100);
      return;
    }
    if (brief.current) { setHeard(final ? '' : text.trim().slice(-120)); if (final) { remember('katelyn', text.trim()); hear(text.trim(), false); } return; }
    const addressed = named || Date.now() < follow.current || !!pending.current;
    if (!addressed) { setHeard(''); return; }
    setHeard(cmd || '…');
    if (final && cmd) { setHeard(''); remember('katelyn', cmd); void run(cmd); }
    else if (final && !cmd) { say('Mrrp?'); }
  };
  /* Commands I can do instantly, without Claude (only when you say my name, so passing remarks never trigger them). */
  const quick = (c: string) => /^(drop it|let go|let it go|drop (the|this|that) (frame|screen)|preview|edit|present|publish|undo|sleep|help|(open|go to|show) (research|brand)|move (it|this|that)? ?(up|down)|(make|set|turn) (it|this|that)? ?(dark|black|tinted|grey|gray|light|white)|add (a|an|another) .+)$/.test(norm(c));
  const flush = () => {
    if (busy.current) { clearTimeout(bufTimer.current); bufTimer.current = window.setTimeout(flush, 700); return; }
    const said = buffer.current.join(' ').trim(); buffer.current = []; if (!said) return;
    remember('katelyn', said); void askClaude(said, true);
  };

  const start = () => {
    const C = getSR(); if (!C || SPEECH_BAD.includes(browser)) { setError(`${browser} can’t turn speech into words. Open the studio in Google Chrome (or Safari) to talk to me.`); setStatus('unsupported'); return; }
    if (sr.current || document.hidden || (figmaHas.current && !document.hasFocus())) return;
    const r = new C(); r.continuous = true; r.interimResults = true; r.lang = 'en-US'; setStatus('starting');
    (r as any).onstart = () => setStatus(st => st === 'words' ? st : 'listening');
    (r as any).onsoundstart = () => setSound(true);
    (r as any).onsoundend = () => setSound(false);
    // Heard speech but no words a while later: usually Chrome is listening to a different microphone than you think.
    (r as any).onspeechstart = () => { const heardAt = Date.now();
      setTimeout(() => { if (sr.current === r && gotWords.current && lastWords.current < heardAt) { try { r.abort(); } catch { /* ignore */ } } }, 6000);
      const before = gotWords.current; setTimeout(() => { if (!before && !gotWords.current && store.get('csb-cat-on', '0') === '1') setError('I hear speech but get no words. Check your Mac’s input (System Settings → Sound → Input) matches the microphone you’re using, then click me twice.'); }, 7000); };
    r.onresult = (e: any) => { setError(''); fails.current = 0; lastWords.current = Date.now(); gotWords.current = true; setStatus('words'); for (let i = e.resultIndex; i < e.results.length; i++) handle(e.results[i][0].transcript, e.results[i].isFinal); };
    r.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') setStatus('error: ' + e.error); if (e.error === 'no-speech' || e.error === 'aborted') return; fails.current++;
      if (e.error === 'not-allowed' && gotWords.current) { setError('Chrome paused the microphone. Click me to start again.'); sleep(); } else if (e.error === 'not-allowed') { setError('I need the microphone. Click the icon at the left of the address bar, allow the microphone, then click me.'); sleep(); } else if (e.error === 'service-not-allowed') { setError(browser === 'Safari' ? 'Safari needs dictation turned on: System Settings → Keyboard → Dictation. Or use Google Chrome.' : 'Speech-to-text is switched off in this browser. Use Google Chrome.'); sleep(); } else if (e.error === 'network') setError('Chrome’s speech service isn’t reachable right now. I’ll keep trying.'); else if (e.error === 'audio-capture') setError('I can’t find a microphone.'); };
    // Browsers stop listening after a while; quietly start again while I'm awake.
    r.onend = () => { if (sr.current === r) sr.current = null; setSound(false); if (store.get('csb-cat-on', '0') === '1') setTimeout(() => startRef.current(), fails.current > 3 ? 2500 : 250); };
    try { r.start(); sr.current = r; bornAt.current = Date.now(); } catch { sr.current = null; fails.current++; }
  };
  // ⌃M turns listening on and off (the extension handles it on every tab; this covers the studio without it).
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyM') { e.preventDefault(); if (store.get('csb-cat-on', '0') === '1') { sleep(); chirp('hm'); } else { wake(); chirp(); } } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  startRef.current = start; hearRef.current = hear; startBriefRef.current = startBrief;
  // Watchdog: if Chrome dropped listening without telling me, start again.
  useEffect(() => {
    const t = setInterval(() => { if (figmaHas.current && Date.now() - figmaAt.current > 15000) { figmaHas.current = false; setOnFigma(false); } if (sr.current && Date.now() - Math.max(bornAt.current, lastWords.current) > 50000) { try { sr.current.abort(); } catch { /* ignore */ } } if (store.get('csb-cat-on', '0') === '1' && !sr.current && !document.hidden && (!figmaHas.current || document.hasFocus())) startRef.current(); }, 2000);
    return () => clearInterval(t);
  }, []);
  const sleep = () => { store.set('csb-cat-on', '0'); setAwake(false); setStatus('off'); try { sr.current?.abort(); } catch { /* ignore */ } sr.current = null; setHeard(''); };
  wakeRef.current = on => { if (on) wake(); else sleep(); };
  const wake = () => { store.set('csb-cat-on', '1'); setAwake(true); start(); setHello(true); setTimeout(() => setHello(false), 2600); };
  useEffect(() => { if (awake) start(); return () => { try { sr.current?.abort(); } catch { /* ignore */ } sr.current = null; }; }, []);
  useEffect(() => { window.postMessage({ source: 'miso-page', type: 'state', awake, name, listen: listenMode }, location.origin); }, [awake, name, listenMode, ext]);
  // While you're on another tab, the Miso extension listens there instead (so I never hear you twice).
  useEffect(() => {
    const vis = () => { if (document.hidden) { try { sr.current?.abort(); } catch { /* ignore */ } sr.current = null; } else if (store.get('csb-cat-on', '0') === '1') start(); };
    document.addEventListener('visibilitychange', vis); return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  /* Feedback while you talk comes from the speech recogniser itself. (Opening a second microphone stream
     alongside it can leave Chrome's recogniser with no audio, which is how words went missing.) */
  const [sound, setSound] = useState(false);
  useEffect(() => {
    if (!sound) { setLevel(0); return; }
    const t = setInterval(() => setLevel(.35 + Math.random() * .6), 120); return () => clearInterval(t);
  }, [sound]);
  /* "Test microphone" in the Check box: a short, separate level test with listening paused. */
  const [testing, setTesting] = useState(false);
  const testMic = async () => {
    setTesting(true); try { sr.current?.abort(); } catch { /* ignore */ } sr.current = null;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(st).connect(an);
      const buf = new Uint8Array(an.fftSize); const end = Date.now() + 3500;
      await new Promise<void>(res => { const loop = () => { an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) sum += (v - 128) ** 2; setLevel(Math.min(1, Math.sqrt(sum / buf.length) / 22)); if (Date.now() < end) requestAnimationFrame(loop); else res(); }; loop(); });
      st.getTracks().forEach(t => t.stop()); void ctx.close();
    } catch { setError('I need the microphone. Click the icon at the left of the address bar and allow it.'); }
    setLevel(0); setTesting(false); if (store.get('csb-cat-on', '0') === '1') start();
  };

  /* Blink now and then; perk the ears while you're talking. */
  const hearing = awake && (sound || level > .18);
  useEffect(() => {
    if (!awake) { setFrame(1); return; }
    if (hearing) { setFrame(2); return; }
    setFrame(0);
    let t = 0; const blink = () => { setFrame(1); setTimeout(() => setFrame(0), 140); t = window.setTimeout(blink, 2500 + Math.random() * 3500); };
    t = window.setTimeout(blink, 1800); return () => clearTimeout(t);
  }, [awake, hearing]);

  /* Hold Option and draw around something to point at it. */
  const [lasso, setLasso] = useState<Array<[number, number]> | null>(null);
  useEffect(() => {
    let pts: Array<[number, number]> | null = null;
    const down = (e: PointerEvent) => { if (!e.altKey || e.button !== 0) return; const t = e.target as Element; if (!t.closest('.csb-preview-viewport')) return; e.preventDefault(); e.stopPropagation(); pts = [[e.clientX, e.clientY]]; setLasso(pts); };
    const move = (e: PointerEvent) => { if (!pts) return; pts = [...pts, [e.clientX, e.clientY]]; setLasso(pts); };
    const up = () => {
      if (!pts) return; const p = pts; pts = null; setLasso(null); if (p.length < 4) return;
      const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length;
      const sec = document.elementsFromPoint(cx, cy).map(el => el.closest('[id^="builder-section-"]')).find(Boolean) as HTMLElement | undefined;
      if (!sec) return; const id = sec.id.replace('builder-section-', ''); target.current = id; act.current.select(id);
      const s = act.current.sections.find(x => x.id === id); setBubble(b => ({ text: `Got it: ${s ? act.current.labelOf(s) : 'this'}.`, n: (b?.n ?? 0) + 1 })); follow.current = Date.now() + 10000;
    };
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  if (!supported && !awake) { /* still show the cat; clicking explains */ }
  const bars = [0, 1, 2].map(i => Math.max(.15, Math.min(1, level * (1.4 - i * .3) + (hearing ? .1 : 0))));
  return <>
    {lasso && <svg className="csb-cat-lasso" aria-hidden="true"><polyline points={lasso.map(p => p.join(',')).join(' ')} /></svg>}
    <div className={`csb-cat ${typing ? 'is-typing' : ''} ${awake ? 'is-awake' : 'is-asleep'} ${hearing ? 'is-hearing' : ''} ${thinking ? 'is-thinking' : ''} ${clip ? 'has-clip' : ''} ${spot ? 'is-placed' : ''} ${spot && spot[1] < .35 ? 'is-high' : ''} ${spot && spot[0] > .6 ? 'is-right' : ''}`}
      style={spot ? { left: spot[0] * innerWidth, top: spot[1] * innerHeight, bottom: 'auto' } : undefined}>
      <AnimatePresence>
        {chat.open && <motion.div key="chat" className="csb-cat-chat" role="dialog" aria-label={`Chat with ${name}`}
          initial={{ opacity: 0, y: 8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: .22 }}>
          <header><span>{name}</span><button type="button" aria-label="Close chat" onClick={() => setChat(c => ({ ...c, open: false }))}>×</button></header>
          <div className="csb-cat-chat-list">
            {chat.items.map((m, i) => <div key={i} className={`csb-cat-msg is-${m.who}`}>{m.text.split('\n').map((line, k) => /^\s*[-•]\s+/.test(line) ? <p key={k} className="is-point">{line.replace(/^\s*[-•]\s+/, '')}</p> : line.trim() ? <p key={k}>{line}</p> : null)}</div>)}
            {thinking && <div className="csb-cat-msg is-miso is-thinking"><p>Hmm…</p></div>}
            <div ref={chatEnd} />
          </div>
          <form onSubmit={e => { e.preventDefault(); sendDraft(); }}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Ask ${name}…`} aria-label={`Message ${name}`} /><button type="submit" disabled={!draft.trim()}>Send</button></form>
        </motion.div>}
        {notes && notes.phase !== 'proposed' && !error && <motion.div key="notes" className="csb-cat-notes" role="status"
          initial={{ opacity: 0, y: 6, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: .2 }}>
          <span>{notes.words ? 'Taking notes' : `Tell me about ${clip?.name || 'this frame'}`}</span>
          <p>{notes.words ? notes.words.replace(/\(then she said:\) /g, '').slice(-320) : 'I’ll listen until you pause, then tell you what I’d make.'}{heard ? <i> {heard}</i> : null}</p>
        </motion.div>}
        {!(notes && notes.phase !== 'proposed' && !error) && (bubble || heard || error || hello || notes) && <motion.div key={error ? 'err' : heard ? 'heard' : hello && !bubble ? 'hello' : `b${bubble?.n}`} className={`csb-cat-bubble ${heard ? 'is-heard' : ''}`}
          initial={{ opacity: 0, y: 6, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: .2 }} role="status">
          {error || (heard ? `“${heard}”` : bubble?.text ?? (notes ? 'Got it. Thinking…' : `Hi! Say “${name}” and then what you need.`))}
        </motion.div>}
      </AnimatePresence>
      {menu && <div className="csb-cat-menu" role="dialog" aria-label={`${name} settings`}>
        <label><span>Name</span><input value={name} onChange={e => { setName(e.target.value); store.set('csb-cat-name', e.target.value); }} /></label>
        <div className="csb-cat-check-panel" aria-live="polite">
          <span>Check</span>
          <div><b>Browser</b><i className={SPEECH_BAD.includes(browser) ? 'is-bad' : 'is-ok'}>{browser}{SPEECH_BAD.includes(browser) ? ' (can’t do speech; use Chrome)' : ''}</i></div>
          <div><b>Figma extension</b><i className={ext ? 'is-ok' : ''}>{ext ? `connected${ext !== 'yes' ? ' · v' + ext : ''}` : 'not found here'}</i></div>
          <div><b>Microphone</b><i className={sound || level > .05 ? 'is-ok' : ''}>{testing ? <span className="csb-cat-meter"><em style={{ transform: `scaleX(${Math.max(.03, level)})` }} /></span> : <>{sound ? 'hearing sound' : awake ? 'quiet' : 'asleep'} · <button type="button" className="csb-cat-link" onClick={() => void testMic()}>Test it</button></>}</i></div>
          <div><b>Hearing words</b><i className={status === 'words' ? 'is-ok' : /error|unsupported/.test(status) ? 'is-bad' : ''}>{onFigma ? 'on your other tab' : status === 'words' ? 'yes' : status === 'listening' ? 'listening… say something' : status === 'starting' ? 'starting…' : status === 'off' ? 'asleep' : status}</i></div>
        </div>
        <div className="csb-cat-reply" role="radiogroup" aria-label="What I listen for"><span>What I listen for</span>
          <div>{([['all', 'Everything you say'], ['name', 'Only after “' + name + '”']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={listenMode === v} onClick={() => { setListenMode(v); store.set('csb-cat-listen', v); }}>{l}</button>)}</div>
          <small className="csb-cat-hint">{listenMode === 'all' ? 'Smartest: I follow along and only act or answer when you want something. Each pause sends what you said to Claude, so it costs a little while you talk.' : 'Cheapest: I ignore everything until you say my name.'}</small>
        </div>
        <div className="csb-cat-reply" role="radiogroup" aria-label="How I answer"><span>How I answer</span>
          <div>{([['chirp', 'Little chirp'], ['voice', 'Voice'], ['silent', 'Silent']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={replyMode === v} onClick={() => { setReplyMode(v); store.set('csb-cat-reply', v); if (v === 'chirp') chirp(); if (v === 'voice' && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance('Hi, I’m ' + name + '.'); const vv = niceVoice(); if (vv) u.voice = vv; speechSynthesis.speak(u); } }}>{l}</button>)}</div>
        </div>
        {clip && <div className="csb-cat-clip"><img src={clip.image} alt="" /><span>{clip.site && !/figma/.test(clip.site) ? <>From {clip.site}: </> : <>From Figma: </>}<b>{clip.name || 'a frame'}</b><small>Point at a spot and say “put it here”. Say “drop it” or click it on me to let go.</small></span><button type="button" aria-label="Drop this frame" onClick={() => dropClip(true)}>×</button></div>}
        <p>Say “{name}”, then:</p>
        <div className="csb-cat-cmds">{['preview', 'edit', 'present', 'publish', 'open research', 'go to the persona', 'add a bar chart', 'move this up', 'make this dark', 'delete this section', 'sleep'].map(c => <i key={c}>{c}</i>)}</div>
        <p>Hold <kbd>⌥ Option</kbd> and draw around something to point at it.</p>
        <p>Press <kbd>⌃ Control</kbd> <kbd>M</kbd> to turn my listening on and off, on any tab.</p>
        <p>Press <kbd>⌃ Control</kbd> <kbd>⇧ Shift</kbd> <kbd>4</kbd> on any site and drag a box to snip it for me. Or copy a Mac screenshot (<kbd>⌘ ⌃ ⇧ 4</kbd>) and say “put my screenshot in…”.</p>
        <p>Ask me things like “how’s the title looking?” and I’ll answer in a little chat.</p>
        <p className="is-note">Hearing you happens in your browser. What you say goes to Claude to understand it (in “Everything” mode, after each pause). “Undo” takes back my last change.</p>
        <p className="is-note">Drag me anywhere on the screen. Double-click me to send me back to my corner.</p>
        <p className="is-note"><a href={`${import.meta.env.BASE_URL}miso-extension.zip`} download>Get the Chrome extension</a> to bring me along to Figma and any website (Lucid, the App Store, competitors). Circle something and I bring the picture and its words.</p>
        <button type="button" onClick={() => setMenu(false)}>Done</button>
      </div>}
      <button type="button" className="csb-cat-btn" aria-pressed={awake} aria-label={awake ? `${name} is listening. Click to put ${name} to sleep.` : `Wake ${name} up to talk`}
        onPointerDown={startDrag} onDoubleClick={() => { setSpot(null); try { localStorage.removeItem('csb-cat-spot'); } catch { /* ignore */ } }}
        onClick={e => { if (dragged.current) { dragged.current = false; return; } if ((e.target as HTMLElement).classList.contains('csb-cat-carry')) { dropClip(); return; } if (awake) sleep(); else wake(); }} onContextMenu={e => { e.preventDefault(); setMenu(m => !m); }}>
        <span key={nod} className={`csb-cat-sprite ${nod ? 'is-nod' : ''}`} style={{ width: W * SCALE, height: H * SCALE, backgroundImage: `url(${sprite})`, backgroundSize: `${W * 3 * SCALE}px ${H * SCALE}px`, backgroundPosition: `${-frame * W * SCALE}px 0` }} />
        {!awake && <span className="csb-cat-z" aria-hidden="true">z<b>z</b></span>}
        <AnimatePresence>{typing && <motion.span key="laptop" className="csb-cat-laptop" aria-hidden="true" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: .2 }}><PixelLaptop /></motion.span>}</AnimatePresence>
        {clip && !typing && <img className="csb-cat-carry" src={clip.image} alt="" title="Click to drop this frame" />}
        {awake && <span className="csb-cat-bars" aria-hidden="true">{bars.map((b, i) => <i key={i} style={{ transform: `scaleY(${b})` }} />)}</span>}
      </button>
      <button type="button" className="csb-cat-gear" aria-label={`${name} settings`} onClick={() => setMenu(m => !m)}>⋯</button>
    </div>
  </>;
}

/* A tiny pixel laptop for Miso to "type" on while he thinks. We see the back of the lid; his paws tap the keys. */
function PixelLaptop() {
  const ink = '#3b332c';
  return <svg viewBox="0 0 24 16" width={48} height={32} shapeRendering="crispEdges">
    {/* lid (back), with a little paw on it */}
    <rect x="3" y="0" width="18" height="12" fill={ink} /><rect x="4" y="1" width="16" height="10" fill="#e6e0d8" />
    <rect x="11" y="5" width="2" height="2" fill="#c8553d" /><rect x="10" y="4" width="1" height="1" fill="#c8553d" /><rect x="13" y="4" width="1" height="1" fill="#c8553d" /><rect x="11" y="3" width="1" height="1" fill="#c8553d" /><rect x="12" y="3" width="1" height="1" fill="#c8553d" />
    {/* base */}
    <rect x="0" y="12" width="24" height="3" fill={ink} /><rect x="1" y="12" width="22" height="2" fill="#cfc8bf" />
    {/* paws, tapping in turn */}
    <g className="csb-cat-paw is-l"><rect x="5" y="9" width="5" height="4" fill={ink} /><rect x="6" y="10" width="3" height="2" fill="#f3e7d6" /></g>
    <g className="csb-cat-paw is-r"><rect x="14" y="9" width="5" height="4" fill={ink} /><rect x="15" y="10" width="3" height="2" fill="#f3e7d6" /></g>
    {/* key clicks */}
    <rect className="csb-cat-click is-l" x="7" y="7" width="1" height="1" fill={ink} /><rect className="csb-cat-click is-r" x="16" y="7" width="1" height="1" fill={ink} />
  </svg>;
}
