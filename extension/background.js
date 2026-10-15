// Case Study Studio Recorder: one screenshot per step while recording.
const STUDIO = ['https://kwolfley27.github.io/case-study-studio/', 'http://localhost:5173/', 'http://127.0.0.1:5173/'];
const get = async () => (await chrome.storage.local.get('rec')).rec || { recording: false, tabId: null, steps: [], name: '' };
const set = rec => chrome.storage.local.set({ rec });
let queue = Promise.resolve(); let lastClick = 0;

const toB64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
async function shot(windowId) {
  const url = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 });
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const w = 360, h = Math.round(bmp.height * w / bmp.width); const c = new OffscreenCanvas(w, h); c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.62 });
  return `data:image/jpeg;base64,${toB64(await out.arrayBuffer())}`;
}
async function heading(tabId) {
  try { const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => (document.querySelector('h1')?.innerText || document.title || '').replace(/\s+/g, ' ').trim().slice(0, 60) }); return r?.result || ''; } catch { return ''; }
}
async function capture(action) {
  const rec = await get(); if (!rec.recording) return;
  const tab = await chrome.tabs.get(rec.tabId).catch(() => null); if (!tab || !tab.active) return;
  const image = await shot(tab.windowId).catch(() => '');
  const label = (await heading(tab.id)) || tab.title || new URL(tab.url).hostname;
  const fresh = await get(); if (!fresh.recording) return;
  fresh.steps.push({ label, action: action || '', url: tab.url, image, at: Date.now() });
  if (!fresh.name) fresh.name = new URL(tab.url).hostname.replace(/^www\./, '');
  await set(fresh); badge(fresh);
}
const badge = rec => { chrome.action.setBadgeText({ text: rec.recording ? String(rec.steps.length) : '' }); chrome.action.setBadgeBackgroundColor({ color: '#ff4704' }); };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'click') {
      const rec = await get(); if (!rec.recording || sender.tab?.id !== rec.tabId) return reply({});
      const now = Date.now(); if (now - lastClick < 350) return reply({}); lastClick = now;
      // Wait for the page to react (navigate, open a sheet…) before the screenshot.
      queue = queue.then(() => new Promise(r => setTimeout(r, 1100))).then(() => capture(msg.action)).catch(() => {});
      return reply({});
    }
    if (msg.type === 'start') { const rec = { recording: true, tabId: msg.tabId, steps: [], name: '' }; await set(rec); badge(rec); queue = queue.then(() => capture('')); await queue; return reply(await get()); }
    if (msg.type === 'stop') { const rec = await get(); rec.recording = false; await set(rec); badge(rec); return reply(rec); }
    if (msg.type === 'clear') { const rec = { recording: false, tabId: null, steps: [], name: '' }; await set(rec); badge(rec); return reply(rec); }
    if (msg.type === 'undo') { const rec = await get(); rec.steps.pop(); await set(rec); badge(rec); return reply(rec); }
    if (msg.type === 'rename') { const rec = await get(); rec.name = msg.name; await set(rec); return reply(rec); }
    if (msg.type === 'get') return reply(await get());
    if (msg.type === 'send') {
      const rec = await get(); const flow = { name: rec.name || 'Recorded flow', source: 'web', steps: rec.steps };
      let [tab] = await chrome.tabs.query({ url: STUDIO.map(u => u + '*') });
      if (!tab) { tab = await chrome.tabs.create({ url: STUDIO[0] }); await new Promise(r => { const l = (id, info) => { if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(l); r(); } }; chrome.tabs.onUpdated.addListener(l); }); await new Promise(r => setTimeout(r, 1200)); }
      await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: f => window.postMessage({ source: 'csb-recorder', flow: f }, location.origin), args: [flow] });
      return reply({ ok: true });
    }
    reply({});
  })();
  return true;
});
// A new page in the recorded tab (typed URL, redirect) also counts as a step.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return; const rec = await get();
  if (!rec.recording || tabId !== rec.tabId) return;
  const last = rec.steps[rec.steps.length - 1]; if (last && last.url === tab.url) return;
  if (Date.now() - lastClick < 3000 || (last && Date.now() - last.at < 1500)) return; // the click is already capturing it
  queue = queue.then(() => new Promise(r => setTimeout(r, 600))).then(() => capture('')).catch(() => {});
});
