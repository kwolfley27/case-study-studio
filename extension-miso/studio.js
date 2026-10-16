// Miso bridge on Case Study Studio: hands the studio the frame you circled in Figma and the things you said there,
// and passes Miso's answers back to the Figma tab.
(() => {
  if (window.top !== window) return;
  const post = (type, extra) => window.postMessage({ source: 'miso-ext', type, ...extra }, location.origin);
  window.addEventListener('message', e => {
    if (e.source !== window || e.data?.source !== 'miso-page') return;
    if (e.data.type === 'hello') chrome.storage.local.get('clip').then(r => post('clip', { clip: r.clip || null }));
    if (e.data.type === 'clear') chrome.storage.local.remove('clip');
    if (e.data.type === 'state') chrome.storage.local.set({ misoAwake: !!e.data.awake, misoName: e.data.name || 'Miso', misoListen: e.data.listen || 'all' });
    if (e.data.type === 'reply') chrome.runtime.sendMessage({ type: 'miso-reply', text: e.data.text, tone: e.data.tone }).catch(() => {});
  });
  chrome.storage.onChanged.addListener(ch => { if (ch.clip) post('clip', { clip: ch.clip.newValue || null }); });
  chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'miso-command') post('command', { said: msg.said, clip: msg.clip, ambient: !!msg.ambient }); });
})();
