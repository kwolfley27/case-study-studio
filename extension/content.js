// Tells the recorder what you clicked. Nothing is sent anywhere unless you are recording.
(() => {
  if (window.top !== window || window.__csbRecorder) return; window.__csbRecorder = true;
  const name = el => {
    const t = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim();
    return t.length > 42 ? t.slice(0, 40) + '…' : t;
  };
  document.addEventListener('click', e => {
    const el = e.target instanceof Element ? (e.target.closest('a,button,[role=button],[role=tab],[role=link],[role=menuitem],[role=option],input,select,label,summary,[onclick]') || e.target) : null;
    if (!el) return;
    const kind = el.tagName === 'INPUT' || el.tagName === 'SELECT' ? 'Fill' : 'Tap';
    chrome.runtime.sendMessage({ type: 'click', action: name(el) ? `${kind} “${name(el)}”` : kind, url: location.href }).catch(() => {});
  }, true);
  document.addEventListener('submit', () => chrome.runtime.sendMessage({ type: 'click', action: 'Submit', url: location.href }).catch(() => {}), true);
})();
