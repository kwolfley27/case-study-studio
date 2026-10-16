// Miso on Figma: hold Option (Alt) and draw around a frame. Miso takes a picture of it, plus the link to
// the frame you have selected, and carries it over to Case Study Studio.
(() => {
  if (window.top !== window || window.__miso) return; window.__miso = true;
  const css = `
  .miso-cat{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:74px;height:96px;image-rendering:pixelated;pointer-events:auto;cursor:grab;touch-action:none;filter:drop-shadow(0 6px 10px rgba(40,30,20,.25));transition:opacity .3s,transform .3s}
  .miso-cat.is-hidden{opacity:0;transform:translateY(12px)}
  .miso-carry{position:fixed;z-index:2147483647;width:34px;height:26px;object-fit:cover;border-radius:3px;box-shadow:0 0 0 2px #fdfcfc,0 4px 8px -2px rgba(0,0,0,.35);transform:rotate(-8deg);pointer-events:none}
  .miso-toast{position:fixed;z-index:2147483647;max-width:260px;padding:9px 13px;border-radius:16px 16px 4px 16px;background:#fdfcfc;color:#000;font:13px/1.35 Inter,system-ui,-apple-system,sans-serif;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 10px 24px -12px rgba(0,0,0,.3);pointer-events:none;transition:opacity .25s}
  .miso-lasso{position:fixed;inset:0;z-index:2147483645;width:100vw;height:100vh;pointer-events:none}
  .miso-lasso polyline{fill:rgba(200,85,61,.08);stroke:#c8553d;stroke-width:2.5;stroke-dasharray:6 6;stroke-linecap:round;stroke-linejoin:round}`;
  const style = document.createElement('style'); style.textContent = css; document.documentElement.appendChild(style);
  const cat = document.createElement('img'); cat.className = 'miso-cat'; cat.src = chrome.runtime.getURL('cat.png'); cat.alt = ''; document.documentElement.appendChild(cat);
  const carry = document.createElement('img'); carry.className = 'miso-carry'; carry.alt = ''; carry.style.display = 'none'; document.documentElement.appendChild(carry);
  const toast = document.createElement('div'); toast.className = 'miso-toast'; toast.style.opacity = '0'; document.documentElement.appendChild(toast);
  let tt = 0; const say = t => { toast.textContent = t; toast.style.opacity = '1'; clearTimeout(tt); tt = setTimeout(() => { toast.style.opacity = '0'; }, 3600); };
  const show = clip => { if (clip?.image) { carry.src = clip.image; carry.style.display = ''; } else { carry.style.display = 'none'; } };
  // Drag Miso anywhere; the picture and the speech bubble follow. The spot is remembered.
  let pos = null;
  const place = () => {
    const x = pos ? pos[0] * innerWidth : innerWidth - 90, y = pos ? pos[1] * innerHeight : innerHeight - 112;
    Object.assign(cat.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    Object.assign(carry.style, { left: x + 6 + 'px', top: y + 66 + 'px' });
    const right = x > innerWidth / 2; Object.assign(toast.style, right ? { right: innerWidth - x + 6 + 'px', left: 'auto' } : { left: x + 80 + 'px', right: 'auto' }, { top: Math.max(8, y + 6) + 'px', bottom: 'auto' });
  };
  chrome.storage.local.get('misoPos').then(r => { pos = r.misoPos || null; place(); }); addEventListener('resize', place);
  cat.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopImmediatePropagation(); const r = cat.getBoundingClientRect(); const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = ev => { pos = [Math.min(innerWidth - 78, Math.max(4, ev.clientX - ox)) / innerWidth, Math.min(innerHeight - 100, Math.max(4, ev.clientY - oy)) / innerHeight]; place(); };
    const up = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); chrome.storage.local.set({ misoPos: pos }); };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
  });
  chrome.storage.local.get('clip').then(r => show(r.clip)); chrome.storage.onChanged.addListener(ch => { if (ch.clip) show(ch.clip.newValue); });

  const svgNS = 'http://www.w3.org/2000/svg';
  let pts = null, svg = null, line = null;
  const block = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  window.addEventListener('pointerdown', e => {
    if (!e.altKey || e.button !== 0) return; block(e);
    pts = [[e.clientX, e.clientY]];
    svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'miso-lasso'); line = document.createElementNS(svgNS, 'polyline'); svg.appendChild(line); document.documentElement.appendChild(svg);
  }, true);
  window.addEventListener('pointermove', e => { if (!pts) return; block(e); pts.push([e.clientX, e.clientY]); line.setAttribute('points', pts.map(p => p.join(',')).join(' ')); }, true);
  window.addEventListener('pointerup', e => {
    if (!pts) return; block(e); const p = pts; pts = null; svg?.remove();
    if (p.length < 4) return;
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (rect.w < 20 || rect.h < 20) return;
    const hasNode = /[?&]node-id=/.test(location.href);
    const file = document.title.replace(/\s*[–-]\s*Figma\s*$/, '').trim();
    say('Got it…');
    // Wait a frame so the lasso line isn't in the picture.
    requestAnimationFrame(() => requestAnimationFrame(() => chrome.runtime.sendMessage({ type: 'miso-capture', rect, viewport: { w: innerWidth, h: innerHeight }, url: location.href, name: file ? `your ${file} frame` : 'the frame' }, res => {
      if (!res?.ok) { console.warn('Miso:', res?.error); say('I couldn’t take that picture. Try again?'); return; }
      say(hasNode ? 'Got it! Go to the studio and say “put it here”.' : 'Got the picture. Tip: click the frame first, so I bring its link too.');
    })));
  }, true);
})();
