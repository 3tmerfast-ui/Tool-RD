/**
 * Flow Image Bridge — Content Script (ISOLATED world)
 *
 * This script owns chrome.runtime.onMessage because chrome.runtime.* is
 * NOT exposed to MAIN-world content scripts in MV3. Its one job is to relay
 * reCAPTCHA requests from the service worker to the MAIN-world script
 * (which has access to window.grecaptcha) and pipe the answer back.
 *
 * Correlation IDs prevent crossed responses when the SW fires multiple
 * concurrent requests (serialised in background.js today, but the ID pattern
 * is a small defense if that changes).
 */

const PENDING = new Map();

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const data = e.data;
  if (!data || !data.__flowExtResponse) return;
  const pending = PENDING.get(data.__flowExtResponse);
  if (!pending) return;
  PENDING.delete(data.__flowExtResponse);
  pending(data.payload || { ok: false, error: 'empty payload from main world' });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'ping') {
    sendResponse({ ok: true, href: location.href });
    return false;
  }

  if (msg.type === 'get-recaptcha') {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      if (PENDING.has(id)) {
        PENDING.delete(id);
        sendResponse({ ok: false, error: 'recaptcha timed out (main-world bridge dead?)' });
      }
    }, 20000);
    PENDING.set(id, (payload) => {
      clearTimeout(timer);
      sendResponse(payload);
    });
    window.postMessage(
      {
        __flowExtRequest: id,
        action: msg.action || 'IMAGE_GENERATION',
      },
      '*',
    );
    return true; // async sendResponse
  }

  // Proxied fetch — runs from this content script's origin (labs.google), so
  // requests inherit first-party cookies + browser fingerprint headers, which
  // bypass the Google WAF "Sorry... automated queries" block that targets
  // service-worker-originated fetches.
  if (msg.type === 'flow-fetch') {
    (async () => {
      try {
        const init = {
          method: msg.method || 'GET',
          credentials: 'include',
          headers: msg.headers || {},
        };
        if (msg.body !== undefined) init.body = msg.body;
        const res = await fetch(msg.url, init);
        const text = await res.text();
        const headers = {};
        res.headers.forEach((v, k) => { headers[k] = v; });
        sendResponse({
          ok: true,
          status: res.status,
          statusText: res.statusText,
          headers,
          body: text,
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true; // async sendResponse
  }

  return false;
});
