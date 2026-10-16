// Miso on Figma.
// - Point (while Miso is awake): hold Option and move the mouse in a loop around a frame, then let go of Option.
//   No clicking. Miso takes a picture of it, plus the link to the frame you have selected.
// - Talk: while Miso is awake in the studio, it listens here too. Say "Miso, make this the hero" and the studio
//   (open in another tab, even in the background) does it. The answer appears here.
(() => {
  if (window.top !== window || window.__miso) return; window.__miso = true;
  const css = `
  .miso-cat{position:fixed;z-index:2147483646;width:74px;height:96px;image-rendering:pixelated;pointer-events:auto;cursor:grab;touch-action:none;filter:drop-shadow(0 6px 10px rgba(40,30,20,.25))}
  .miso-cat.is-hearing{animation:miso-bop .5s ease-in-out infinite}
  @keyframes miso-bop{50%{transform:translateY(-2px)}}
  .miso-carry{position:fixed;z-index:2147483647;width:34px;height:26px;object-fit:cover;border-radius:3px;box-shadow:0 0 0 2px #fdfcfc,0 4px 8px -2px rgba(0,0,0,.35);transform:rotate(-8deg);pointer-events:none}
  .miso-toast{position:fixed;z-index:2147483647;max-width:280px;padding:9px 13px;border-radius:16px;background:#fdfcfc;color:#000;font:13px/1.35 Inter,system-ui,-apple-system,sans-serif;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 10px 24px -12px rgba(0,0,0,.3);pointer-events:none;transition:opacity .25s}
  .miso-toast.is-heard{color:#67615a;font-style:italic}
  .miso-lasso{position:fixed;inset:0;z-index:2147483645;width:100vw;height:100vh;pointer-events:none}
  .miso-lasso polyline{fill:rgba(200,85,61,.08);stroke:#c8553d;stroke-width:2.5;stroke-dasharray:6 6;stroke-linecap:round;stroke-linejoin:round}
  @media (prefers-reduced-motion:reduce){.miso-cat{animation:none!important}}`;
  const style = document.createElement('style'); style.textContent = css; document.documentElement.appendChild(style);
  const cat = document.createElement('img'); cat.className = 'miso-cat'; cat.alt = ''; document.documentElement.appendChild(cat);
  const carry = document.createElement('img'); carry.className = 'miso-carry'; carry.alt = ''; carry.style.display = 'none'; document.documentElement.appendChild(carry);
  const toast = document.createElement('div'); toast.className = 'miso-toast'; toast.style.opacity = '0'; document.documentElement.appendChild(toast);
  let tt = 0; const say = (t, heard) => { toast.textContent = t; toast.classList.toggle('is-heard', !!heard); toast.style.opacity = '1'; clearTimeout(tt); tt = setTimeout(() => { toast.style.opacity = '0'; }, heard ? 2500 : 4200); };
  const chirp = (kind = 'ok') => { try { const ctx = new AudioContext(); const notes = kind === 'ok' ? [[740, 0], [1110, .09]] : [[880, 0], [700, .1]]; for (const [f, t] of notes) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, ctx.currentTime + t); g.gain.linearRampToValueAtTime(.07, ctx.currentTime + t + .015); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .16); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .18); } setTimeout(() => ctx.close(), 600); } catch { /* no audio */ } };

  /* ---- where Miso sits (drag to move; remembered) ---- */
  let pos = null;
  const place = () => {
    const x = pos ? pos[0] * innerWidth : innerWidth - 90, y = pos ? pos[1] * innerHeight : innerHeight - 112;
    Object.assign(cat.style, { left: x + 'px', top: y + 'px' });
    Object.assign(carry.style, { left: x + 6 + 'px', top: y + 66 + 'px' });
    const right = x > innerWidth / 2; Object.assign(toast.style, right ? { right: innerWidth - x + 6 + 'px', left: 'auto' } : { left: x + 80 + 'px', right: 'auto' }, { top: Math.max(8, y + 6) + 'px' });
  };
  chrome.storage.local.get('misoPos').then(r => { pos = r.misoPos || null; place(); }); addEventListener('resize', place);
  cat.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopImmediatePropagation(); const r = cat.getBoundingClientRect(); const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const sx = e.clientX, sy = e.clientY; let moved = false;
    const mv = ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true; pos = [Math.min(innerWidth - 78, Math.max(4, ev.clientX - ox)) / innerWidth, Math.min(innerHeight - 100, Math.max(4, ev.clientY - oy)) / innerHeight]; place(); };
    const up = () => {
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
      if (moved) { chrome.storage.local.set({ misoPos: pos }); return; }
      // A click (no drag) wakes me up or puts me to sleep, here and in the studio.
      awake = !awake; chrome.storage.local.set({ misoAwake: awake });
      showCat(); listen(); chirp(awake ? 'ok' : 'hm'); say(awake ? `I’m listening here too. Talk away.` : 'Going to sleep.');
    };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
  });

  /* ---- awake / asleep follows the studio ---- */
  let awake = false, name = 'Miso', mode = 'all';
  const showCat = () => { cat.src = chrome.runtime.getURL(awake ? 'cat.png' : 'cat-sleep.png'); cat.title = awake ? `${name} is listening` : `${name} is asleep (wake ${name} in the studio)`; };
  const showClip = clip => { if (clip?.image) { carry.src = clip.image; carry.style.display = ''; } else carry.style.display = 'none'; };
  chrome.storage.local.get(['clip', 'misoAwake', 'misoName', 'misoListen']).then(r => { showClip(r.clip); awake = !!r.misoAwake; name = r.misoName || 'Miso'; mode = r.misoListen || 'all'; showCat(); listen(); });
  chrome.storage.onChanged.addListener(ch => {
    if (ch.clip) showClip(ch.clip.newValue);
    if (ch.misoListen) mode = ch.misoListen.newValue || 'all';
    if (ch.misoAwake || ch.misoName) { if (ch.misoAwake) awake = !!ch.misoAwake.newValue; if (ch.misoName) name = ch.misoName.newValue || 'Miso'; showCat(); listen(); }
  });

  /* ---- pointing: hold Option and circle (no click), or Option-drag ---- */
  const svgNS = 'http://www.w3.org/2000/svg';
  let pts = null, svg = null, line = null;
  const begin = (x, y) => { pts = x == null ? [] : [[x, y]]; svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'miso-lasso'); line = document.createElementNS(svgNS, 'polyline'); svg.appendChild(line); document.documentElement.appendChild(svg); };
  const add = (x, y) => { if (!pts) return; const l = pts[pts.length - 1]; if (l && Math.hypot(x - l[0], y - l[1]) < 3) return; pts.push([x, y]); line.setAttribute('points', pts.map(p => p.join(',')).join(' ')); };
  const finish = () => {
    if (!pts) return; const p = pts; pts = null; svg?.remove(); svg = null;
    if (p.length < 8) return;
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (rect.w < 60 || rect.h < 60) return;
    // A loop: the path comes back near where it started.
    const close = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < Math.max(rect.w, rect.h) * .45;
    if (!close) return;
    const hasNode = /[?&]node-id=/.test(location.href);
    const file = document.title.replace(/\s*[–-]\s*Figma\s*$/, '').trim();
    say('Got it…');
    if (stale()) return;
    requestAnimationFrame(() => requestAnimationFrame(() => chrome.runtime.sendMessage({ type: 'miso-capture', rect, viewport: { w: innerWidth, h: innerHeight }, url: location.href, name: file ? `your ${file} frame` : 'the frame' }, res => {
      if (!res?.ok) { say('I couldn’t take that picture. Try again?'); chirp('hm'); return; }
      chirp(); say(awake ? `Got it! Tell me where it goes (“${name}, make this the hero”).` : (hasNode ? 'Got it! In the studio, point and say “put it here”.' : 'Got the picture. Tip: click the frame first, so I bring its link too.'));
    })));
  };
    // Only while Miso is awake, and only without clicking, so Figma's own Option-drag (duplicate) keeps working.
  addEventListener('keydown', e => { if (e.key === 'Alt' && awake && !e.repeat && !pts && !/input|textarea/i.test(document.activeElement?.tagName || '')) begin(); }, true);
  addEventListener('keyup', e => { if (e.key === 'Alt') finish(); }, true);
  addEventListener('blur', () => { if (pts) { pts = null; svg?.remove(); svg = null; } });
  addEventListener('pointermove', e => { if (pts) add(e.clientX, e.clientY); }, true);
  // Pressing the mouse while holding Option is Figma's (duplicate, measure): drop the loop.
  addEventListener('pointerdown', () => { if (pts) { pts = null; svg?.remove(); svg = null; } }, true);

  /* ---- clicking a frame while I'm awake: I pick it up (Figma puts the frame's id in the address when you select it) ---- */
  let downAt = null, lastPick = '';
  const nodeOf = u => (u.match(/[?&]node-id=([^&#]+)/) || [])[1] || '';
  addEventListener('pointerdown', e => { downAt = e.target instanceof HTMLCanvasElement && !e.altKey && e.button === 0 ? [e.clientX, e.clientY, nodeOf(location.href), e.target] : null; }, true);
  addEventListener('pointerup', e => {
    const d = downAt; downAt = null; if (!d || !awake || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) return;
    setTimeout(() => {
      const node = nodeOf(location.href); if (!node || node === d[2] || node === lastPick || stale()) return;
      lastPick = node; const cr = d[3].getBoundingClientRect();
      const sel = document.querySelector('[class*="layer_row"][class*="selected"] [class*="name"], [aria-selected="true"] [class*="layer_name"]');
      const nm = (sel?.textContent || '').trim(); const file = document.title.replace(/\s*[–-]\s*Figma\s*$/, '').trim();
      cat.style.visibility = 'hidden'; toast.style.visibility = 'hidden'; carry.style.visibility = 'hidden';
      requestAnimationFrame(() => requestAnimationFrame(() => chrome.runtime.sendMessage({ type: 'miso-capture', selection: true, rect: { x: cr.left, y: cr.top, w: cr.width, h: cr.height }, viewport: { w: innerWidth, h: innerHeight }, url: location.href, name: nm || (file ? `a frame from ${file}` : 'the frame') }, res => {
        cat.style.visibility = ''; toast.style.visibility = ''; carry.style.visibility = '';
        if (!res?.ok) { lastPick = ''; if (res?.error === 'no-outline') say('I couldn’t see that frame. Hold Option and circle it instead.'); return; }
        chirp(); say(`Holding ${nm || 'that frame'}.`);
      })));
    }, 450);
  }, true);

  /* ---- listening here while Miso is awake (the studio tab pauses itself while you're away) ---- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, follow = 0, buf = [], bt = 0;
  const send = () => { if (stale()) return; const said = buf.join(' ').trim(); buf = []; if (!said) return; chrome.runtime.sendMessage({ type: 'miso-command', said, ambient: true }, res => { if (!res?.ok) { say(res?.error || 'I couldn’t reach the studio.'); chirp('hm'); } }); };
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // After the extension is updated, this old copy can't reach it; say so instead of failing silently.
  const stale = () => { if (chrome.runtime?.id) return false; try { rec?.abort(); } catch { /* ignore */ } rec = null; say('Miso was updated. Reload this tab to bring me back.'); return true; };
  let blocked = false;
  const listen = () => {
    if (stale()) return;
    // Only the tab you're working in listens (two tabs fighting over the mic is what made words stop).
    const want = awake && !document.hidden && document.hasFocus() && !!SR;
    chrome.storage.local.set({ misoFigma: want ? Date.now() : 0 }).catch(() => {});
    if (!want) { try { rec?.abort(); } catch { /* ignore */ } rec = null; cat.classList.remove('is-hearing'); return; }
    if (rec) return; blocked = false;
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    r.onresult = e => {
      quietSince = Date.now();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const s = norm(e.results[i][0].transcript), nm = norm(name); const at = (' ' + s + ' ').indexOf(' ' + nm + ' ');
        const raw = e.results[i][0].transcript.trim();
        if (mode === 'all') {
          // Everything mode: show what I hear, and pass it on after you pause; the studio decides if it's for me.
          cat.classList.add('is-hearing'); say(`“${raw.slice(-110)}”`, true);
          if (e.results[i].isFinal) { cat.classList.remove('is-hearing'); buf.push(raw); clearTimeout(bt); bt = setTimeout(send, 1100); }
          continue;
        }
        const addressed = at >= 0 || Date.now() < follow; if (!addressed) continue;
        const cmd = at >= 0 ? s.slice(at + nm.length).trim() : s;
        cat.classList.add('is-hearing'); if (cmd) say(`“${cmd}”`, true);
        if (e.results[i].isFinal && cmd) {
          cat.classList.remove('is-hearing'); say('…');
          chrome.runtime.sendMessage({ type: 'miso-command', said: cmd }, res => { if (!res?.ok) { say(res?.error || 'I couldn’t reach the studio.'); chirp('hm'); } });
        }
      }
    };
    r.onsoundstart = () => cat.classList.add('is-hearing');
    r.onsoundend = () => cat.classList.remove('is-hearing');
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { blocked = true; say('To hear you on Figma, allow the microphone for figma.com: click the icon at the left of the address bar.'); } };
    r.onend = () => { rec = null; setTimeout(listen, blocked ? 5000 : 400); };
    try { r.start(); rec = r; quietSince = Date.now(); } catch { /* already running */ }
  };
  document.addEventListener('visibilitychange', listen); addEventListener('focus', listen); addEventListener('blur', listen);
  let quietSince = Date.now();
  setInterval(() => { if (rec) chrome.storage.local.set({ misoFigma: Date.now() }).catch(() => {}); if (rec && Date.now() - quietSince > 50000) { quietSince = Date.now(); try { rec.abort(); } catch { /* ignore */ } } }, 5000);
  chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'miso-reply' && msg.text) { say(msg.text); chirp(msg.tone || 'ok'); follow = Date.now() + 8000; } });
})();
