/**
 * Flow Image Bridge — Content Script (MAIN world)
 *
 * Runs in the Flow page's own JavaScript context so it can access
 * `window.grecaptcha`. Cannot use chrome.runtime.* APIs (those are blocked in
 * MAIN world). Communicates with its isolated-world sibling via
 * window.postMessage using a correlation ID.
 */

(() => {
  // Flow's reCAPTCHA Enterprise site key. Taken from the old content script
  // and matches the key baked into the Flow web bundle.
  const SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';

  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    const req = e.data;
    if (!req || !req.__flowExtRequest) return;
    const id = req.__flowExtRequest;
    try {
      // grecaptcha is loaded async by Flow's bundle — wait up to 30s for it.
      if (typeof grecaptcha === 'undefined' || !grecaptcha.enterprise) {
        let waited = 0;
        while ((typeof grecaptcha === 'undefined' || !grecaptcha.enterprise) && waited < 30_000) {
          await new Promise(r => setTimeout(r, 500));
          waited += 500;
        }
        if (typeof grecaptcha === 'undefined' || !grecaptcha.enterprise) {
          throw new Error(
            'grecaptcha.enterprise is not loaded on this page yet. ' +
              'Stay on https://labs.google/fx/tools/flow for a few seconds after opening.',
          );
        }
      }
      const token = await grecaptcha.enterprise.execute(SITE_KEY, {
        action: req.action || 'IMAGE_GENERATION',
      });
      window.postMessage(
        { __flowExtResponse: id, payload: { ok: true, token } },
        '*',
      );
    } catch (err) {
      window.postMessage(
        {
          __flowExtResponse: id,
          payload: { ok: false, error: String(err?.message || err) },
        },
        '*',
      );
    }
  });
})();
