/**
 * Flow Image Bridge — Service Worker (MV3)
 *
 * Replaces the entire Python Flow pipeline (cdp_session.py, flow_client.py,
 * recaptcha_bridge.py, flow_image_service.py). The React app
 * (http://localhost:3000) sends a message here via chrome.runtime.sendMessage
 * thanks to externally_connectable; we coordinate with the Flow tab's content
 * script for a reCAPTCHA token, fetch the user's OAuth bearer from
 * labs.google/fx/api/auth/session (with first-party cookies), then POST
 * aisandbox-pa.googleapis.com/v1/projects/{projectId}/flowMedia:batchGenerateImages
 * and return the resulting image as a base64 data URL.
 *
 * Why SW and not content script for the final fetch:
 *   Content scripts inherit the page origin and are subject to same-origin
 *   policy. Only the extension service worker (or extension pages) can make
 *   cross-origin fetches with host_permissions. See:
 *   https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/
 *
 * Why we still need a content script at all:
 *   grecaptcha.enterprise.execute() is only defined on the labs.google page,
 *   and only in the MAIN world. The SW cannot call it. So we do a round-trip:
 *     SW -> isolated-world content script -> MAIN-world content script -> grecaptcha
 *   and get the token back the same way.
 */

// ── Config ──────────────────────────────────────────────────────────────────

// projectId is no longer hardcoded — it's extracted dynamically from the
// active Flow tab URL (`/project/{UUID}`) so the extension always uses a
// project that belongs to the user's signed-in Google account. The previous
// hardcoded constant pointed to the original developer's project, which
// caused HTTP 403 from Google when the user's account didn't own it.
const FLOW_TAB_URL = 'https://labs.google/fx/tools/flow';
const AUTH_SESSION_URL = 'https://labs.google/fx/api/auth/session';
const AISANDBOX = 'https://aisandbox-pa.googleapis.com/v1';
const UUID_RE = /\/project\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Mirror of flow_client.py MODELS / ASPECT_MAP so the React side can keep its
// existing { model, aspectRatio } shape and nothing else changes.
const MODELS = {
  imagen4: 'IMAGEN_3_5',
  banana2: 'NARWHAL',
  banana: 'NARWHAL',
  'banana-pro': 'GEM_PIX_2',
};

const ASPECTS = {
  '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
  '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
  '4:3': 'IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE',
  '3:4': 'IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR',
};

// ── Tab Pool ────────────────────────────────────────────────────────────────
// Each Flow tab has its own independent grecaptcha instance, so we can mint
// reCAPTCHA tokens and generate images in parallel across N tabs.

class TabPool {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.tabs = [];   // [{ tabId, busy, index }]
    this.queue = [];  // [{ resolve, reject }]
    this.initializing = false;
    this.initialized = false;
  }

  async init(size) {
    if (this.initializing) {
      // Wait for in-progress init to finish
      while (this.initializing) await new Promise(r => setTimeout(r, 200));
      // After waiting, check if we need more tabs
      if (this.tabs.length >= size) return;
    }
    this.initializing = true;
    size = Math.min(Math.max(size, 1), this.maxSize);
    try {
      // Only open tabs we don't already have
      const currentCount = this.tabs.length;
      if (size > currentCount) {
        // CRITICAL: open slot 0 sequentially first so its projectUrl gets
        // stashed in this.tabs[0] BEFORE the parallel batch starts. Otherwise
        // slots 1..N race past slot 0's push, find no projectUrl in the pool
        // yet, fall back to FLOW_TAB_URL (homepage), and the resulting tabs
        // crash with "No Flow project open in tab" when their content script
        // tries to extract the projectId from URL.
        if (currentCount === 0) {
          try {
            await this._openTab(0);
          } catch (e) {
            console.warn(`[flow-pool] slot 0 failed to open:`, e?.message || e);
          }
        }
        const startIdx = Math.max(1, this.tabs.length);
        if (size > startIdx) {
          const promises = [];
          for (let i = startIdx; i < size; i++) promises.push(this._openTab(i));
          // Use allSettled so one failing tab doesn't block the rest
          const results = await Promise.allSettled(promises);
          const failed = results.filter(r => r.status === 'rejected');
          if (failed.length > 0) {
            console.warn(`[flow-pool] ${failed.length}/${size - startIdx} tabs failed to open:`,
              failed.map(r => r.reason?.message || r.reason));
          }
        }
        console.log(`[flow-pool] scaled from ${currentCount} to ${this.tabs.length} tabs`);
      }
      this.initialized = true;
    } finally {
      this.initializing = false;
    }
  }

  async _openTab(index) {
    // Reuse existing labs.google tabs first
    if (index === 0) {
      const existing = await findFlowTab();
      if (existing) {
        let hasProject = existing.url && UUID_RE.test(existing.url);
        // Tab is on Flow homepage — try to restore last known project URL so
        // getProjectIdFromTab doesn't fail immediately with "No project open".
        if (!hasProject) {
          try {
            const stored = await chrome.storage.local.get('lastProjectUrl');
            if (stored.lastProjectUrl) {
              console.log(`[flow-pool] slot 0 on homepage, navigating to last project: ${stored.lastProjectUrl}`);
              await chrome.tabs.update(existing.id, { url: stored.lastProjectUrl });
              await new Promise(r => setTimeout(r, 2000)); // wait for navigation start
              const refreshed = await chrome.tabs.get(existing.id);
              hasProject = refreshed.url && UUID_RE.test(refreshed.url);
              if (hasProject) existing.url = refreshed.url;
            }
          } catch (navErr) {
            console.warn('[flow-pool] auto-navigate to last project failed:', navErr.message);
          }
        }
        try {
          // Project tabs deserve a longer warmup window — content script can
          // be slow to register on a hot tab the user already has open.
          await waitForContentReady(existing.id, hasProject ? 90000 : 45000);
          this.tabs.push({ tabId: existing.id, busy: false, index, projectUrl: hasProject ? existing.url : null });
          console.log(`[flow-pool] slot ${index}: reused existing tab ${existing.id} (project=${hasProject})`);
          return;
        } catch (e) {
          // CRITICAL: if the existing tab already has a /project/ in its URL,
          // KEEP USING IT — opening a new homepage tab would lose the user's
          // signed-in project context and cause "No Flow project open in tab".
          // We just need to ping until the content script wakes up, which
          // should happen as soon as the tab gets focus or the user clicks.
          if (hasProject) {
            console.warn(`[flow-pool] existing project tab not pinging yet, but using it anyway (will retry recaptcha later):`, e.message);
            // Try to programmatically inject the content script in case
            // document_idle never fired (eg. lazy-loaded SPA route).
            try {
              await chrome.scripting.executeScript({
                target: { tabId: existing.id },
                files: ['content_isolated.js'],
              });
              await chrome.scripting.executeScript({
                target: { tabId: existing.id },
                files: ['content_main.js'],
                world: 'MAIN',
              });
              await waitForContentReady(existing.id, 30000);
              this.tabs.push({ tabId: existing.id, busy: false, index, projectUrl: existing.url });
              console.log(`[flow-pool] slot ${index}: reused existing project tab ${existing.id} after manual inject`);
              return;
            } catch (e2) {
              console.warn(`[flow-pool] manual inject failed too:`, e2.message);
              // Push the tab anyway — getRecaptchaToken will retry; better
              // than mở tab homepage mới rồi crash với "No Flow project open".
              this.tabs.push({ tabId: existing.id, busy: false, index, projectUrl: existing.url });
              console.log(`[flow-pool] slot ${index}: forced-reuse existing project tab ${existing.id} (content script may still be loading)`);
              return;
            }
          }
          console.warn(`[flow-pool] existing tab not ready, opening new:`, e.message);
        }
      }
    }
    // Default open URL — fall back to homepage. But if we already have a
    // project tab in the pool (typically slot 0), open new tabs at the SAME
    // project URL so they're immediately usable without forcing the user to
    // pick a project on each new tab.
    let openUrl = FLOW_TAB_URL;
    try {
      const existingProjectSlot = this.tabs.find(s => s.projectUrl);
      if (existingProjectSlot?.projectUrl) {
        openUrl = existingProjectSlot.projectUrl;
      } else {
        // Slot 0 may not have stashed projectUrl yet — query it now.
        const slot0 = this.tabs[0];
        if (slot0) {
          const t = await chrome.tabs.get(slot0.tabId);
          if (t?.url && UUID_RE.test(t.url)) {
            openUrl = t.url;
            slot0.projectUrl = t.url;
          }
        }
      }
    } catch (e) {
      console.warn('[flow-pool] failed to derive project URL for new tab, using homepage:', e.message);
    }

    // Last resort: if still on homepage, restore from chrome.storage so the
    // tab opens directly into the last project without user intervention.
    if (openUrl === FLOW_TAB_URL) {
      try {
        const stored = await chrome.storage.local.get('lastProjectUrl');
        if (stored.lastProjectUrl) {
          openUrl = stored.lastProjectUrl;
          console.log(`[flow-pool] no open Flow tab found — restoring lastProjectUrl for new tab: ${openUrl}`);
        }
      } catch (e) {
        console.warn('[flow-pool] could not load lastProjectUrl from storage:', e.message);
      }
    }

    const tab = await chrome.tabs.create({ url: openUrl, active: false });
    await waitForContentReady(tab.id);
    const projectUrl = openUrl !== FLOW_TAB_URL ? openUrl : null;
    this.tabs.push({ tabId: tab.id, busy: false, index, projectUrl });
    console.log(`[flow-pool] slot ${index}: opened new tab ${tab.id} (project=${!!projectUrl})`);
  }

  acquire() {
    return new Promise((resolve, reject) => {
      const free = this.tabs.find(t => !t.busy);
      if (free) {
        free.busy = true;
        resolve(free);
        return;
      }
      this.queue.push({ resolve, reject });
    });
  }

  release(slot) {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      // Slot 0 is the user's own pre-existing tab — reuse it directly.
      // All other slots: close the finished tab and open a fresh one so each
      // image gets a clean Flow session (avoids per-session reCAPTCHA throttle).
      if (slot !== this.tabs[0]) {
        const reuseIndex = slot.index;
        this._closeSlot(slot);
        this._openTab(reuseIndex).then(() => {
          const fresh = this.tabs.find(t => t.index === reuseIndex && !t.busy);
          const target = fresh || this.tabs.find(t => !t.busy);
          if (target) {
            target.busy = true;
            next.resolve(target);
          } else {
            next.reject(new Error('[flow-pool] no free tab after fresh-open'));
          }
        }).catch(e => {
          console.warn('[flow-pool] fresh-open failed, rejecting job:', e?.message || e);
          next.reject(e);
        });
        return;
      }
      slot.busy = true;
      next.resolve(slot);
      return;
    }
    slot.busy = false;
    // Always keep at least 1 Flow tab open so the user keeps a working Flow page
    // after the batch finishes. Survive `this.tabs[0]` — `_openTab(0)` preferentially
    // REUSES the user's existing labs.google tab (the one with `/project/{uuid}` in
    // URL and a warm session). Slots 1..N-1 are background tabs WE created; closing
    // them is invisible to the user.
    if (this.tabs.length <= 1) return;
    if (slot === this.tabs[0]) return;
    this._closeSlot(slot);
  }

  _closeSlot(slot) {
    const idx = this.tabs.indexOf(slot);
    if (idx >= 0) this.tabs.splice(idx, 1);
    if (this.tabs.length === 0) this.initialized = false;
    try {
      chrome.tabs.remove(slot.tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn('[flow-pool] close failed:', chrome.runtime.lastError.message);
        } else {
          console.log(`[flow-pool] closed tab ${slot.tabId} (slot ${slot.index}), pool size: ${this.tabs.length}`);
        }
      });
    } catch (e) {
      console.warn('[flow-pool] close threw:', e?.message || e);
    }
  }

  handleTabRemoved(tabId) {
    const idx = this.tabs.findIndex(t => t.tabId === tabId);
    if (idx === -1) return;
    const slot = this.tabs[idx];
    this.tabs.splice(idx, 1);
    console.log(`[flow-pool] tab ${tabId} (slot ${slot.index}) removed, pool size: ${this.tabs.length}`);
    // If this tab was busy, reject any pending acquire for it
    // (the in-flight generateImageFlow will fail on sendMessage and be caught)
  }

  status() {
    return {
      size: this.tabs.length,
      maxSize: this.maxSize,
      busy: this.tabs.filter(t => t.busy).length,
      free: this.tabs.filter(t => !t.busy).length,
      queued: this.queue.length,
      initialized: this.initialized,
      tabIds: this.tabs.map(t => t.tabId),
    };
  }
}

const pool = new TabPool(10);

// ── Flow tab discovery + auto-open ──────────────────────────────────────────

async function findFlowTab() {
  const tabs = await chrome.tabs.query({ url: 'https://labs.google/*' });
  // Prefer a tab that already has a project open — its URL will contain
  // `/project/{UUID}`. Fall back to any labs.google tab so init still works.
  const withProject = tabs.find(t => t.url && UUID_RE.test(t.url));
  return withProject || tabs[0] || null;
}

/**
 * Extract Flow projectId (UUID) from the URL of the given tab. If the tab has
 * drifted off `/project/{uuid}` (Flow's React app sometimes redirects
 * background tabs to homepage between generations) we self-heal by navigating
 * back to the last known project URL before throwing.
 */
async function getProjectIdFromTab(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (e) {
    throw new Error(`Flow tab no longer exists (closed?): ${e?.message || e}`);
  }
  let m = (tab.url || '').match(UUID_RE);

  if (!m) {
    let restoreUrl = null;
    try {
      const stored = await chrome.storage.local.get('lastProjectUrl');
      if (stored?.lastProjectUrl && UUID_RE.test(stored.lastProjectUrl)) {
        restoreUrl = stored.lastProjectUrl;
      }
    } catch (e) {
      console.warn('[flow-bridge] lastProjectUrl lookup failed:', e?.message || e);
    }

    if (restoreUrl) {
      console.warn(
        `[flow-bridge] tab ${tabId} drifted to "${tab.url}" — restoring to ${restoreUrl}`,
      );
      try {
        await chrome.tabs.update(tabId, { url: restoreUrl });
        try {
          await waitForContentReady(tabId, 30000);
        } catch (pingErr) {
          // Navigation reset the document — content_script may need a manual
          // re-inject before it pings. Try and then re-ping once more.
          console.warn(
            '[flow-bridge] post-restore ping failed, manual inject:',
            pingErr?.message || pingErr,
          );
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content_isolated.js'],
            });
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content_main.js'],
              world: 'MAIN',
            });
            await waitForContentReady(tabId, 15000);
          } catch (injectErr) {
            console.warn(
              '[flow-bridge] manual re-inject after restore failed:',
              injectErr?.message || injectErr,
            );
          }
        }
        tab = await chrome.tabs.get(tabId);
        m = (tab.url || '').match(UUID_RE);
        if (m) {
          console.log(`[flow-bridge] tab ${tabId} restored to project ${m[1]}`);
          // Refresh the cached projectUrl on the corresponding pool slot so
          // subsequent _openTab calls reuse the new (working) URL.
          const slot = pool?.tabs?.find?.((s) => s.tabId === tabId);
          if (slot) slot.projectUrl = tab.url;
        }
      } catch (e) {
        console.warn('[flow-bridge] restore navigation failed:', e?.message || e);
      }
    }
  }

  if (!m) {
    throw new Error(
      'No Flow project open in tab. Open https://labs.google/fx/en/tools/flow, ' +
      'create or pick a project (URL must look like .../project/{uuid}), then retry.',
    );
  }
  // Persist so next cold-start can auto-navigate back to this project.
  chrome.storage.local.set({ lastProjectUrl: tab.url }).catch(() => {});
  return m[1];
}

/**
 * Wait until the Flow tab's isolated content script is alive and answering
 * pings. Needed after tab creation (content scripts aren't injected until the
 * page fires document_idle).
 */
async function waitForContentReady(tabId, timeoutMs = 45000) {
  const start = Date.now();
  let lastError = 'timed out';
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
      if (res && res.ok) return;
    } catch (e) {
      lastError = String(e?.message || e);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Flow tab content script never became ready: ${lastError}`);
}

async function findOrOpenFlowTab() {
  let tab = await findFlowTab();
  if (tab) return tab;
  // Open in a background tab so the user's workflow isn't interrupted.
  const created = await chrome.tabs.create({ url: FLOW_TAB_URL, active: false });
  await waitForContentReady(created.id);
  return created;
}

// ── reCAPTCHA round-trip ────────────────────────────────────────────────────

async function getRecaptchaToken(tabId, action = 'IMAGE_GENERATION') {
  const res = await chrome.tabs.sendMessage(tabId, { type: 'get-recaptcha', action });
  if (!res) throw new Error('content script returned no response');
  if (!res.ok) throw new Error(res.error || 'recaptcha token request failed');
  return res.token;
}

// ── Fetch proxy via labs.google content script ──────────────────────────────
// Runs the actual HTTP request from inside the labs.google tab so it inherits
// first-party cookies + browser fingerprint headers. This bypasses the
// Google WAF "Sorry / automated queries" page that returns HTTP 403 to
// service-worker-originated fetches against aisandbox-pa.googleapis.com.
async function fetchViaTab(tabId, { url, method, headers, body }) {
  // Make sure the content script is alive before we send the fetch — if it
  // isn't, ping in a tight loop (and re-inject if needed) for up to 60s so
  // we fail fast with a useful error instead of hanging the app for 120s.
  await ensureContentScript(tabId, 60000);

  // Wrap sendMessage in a 180s timeout — chrome.tabs.sendMessage has no
  // built-in timeout. Flow's batchGenerateImages legitimately takes 60-120s
  // under load (especially when the pool runs 4-6 tabs in parallel); a 60s
  // cap was too tight and produced false-positive timeouts mid-batch.
  const sendPromise = chrome.tabs.sendMessage(tabId, {
    type: 'flow-fetch',
    url,
    method,
    headers,
    body,
  });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('content script flow-fetch timed out after 180s')), 180000);
  });
  const res = await Promise.race([sendPromise, timeoutPromise]);

  if (!res || !res.ok) {
    throw new Error(res?.error || 'fetch via content script failed');
  }
  return res; // { ok, status, statusText, headers, body }
}

/**
 * Ensure the content script is loaded and answering pings on the given tab.
 * Re-injects the scripts if the first ping fails, then polls until ready.
 */
async function ensureContentScript(tabId, timeoutMs = 60000) {
  const start = Date.now();
  let injected = false;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
      if (res && res.ok) return;
    } catch (e) {
      // First failure: try injecting the scripts manually.
      if (!injected) {
        injected = true;
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content_isolated.js'] });
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content_main.js'], world: 'MAIN' });
          console.log('[flow-bridge] re-injected content scripts into tab', tabId);
        } catch (e2) {
          console.warn('[flow-bridge] re-inject failed:', e2.message);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`content script never became ready after ${timeoutMs}ms`);
}

// ── Bearer token from labs.google session ──────────────────────────────────

async function getAccessToken() {
  const res = await fetch(AUTH_SESSION_URL, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(
      `auth/session HTTP ${res.status} — not signed into labs.google? ` +
        `Open ${FLOW_TAB_URL} and log in.`,
    );
  }
  const data = await res.json();
  const token = data?.access_token || data?.accessToken;
  if (!token) {
    throw new Error(
      'auth/session returned no access_token — your Google session may be expired.',
    );
  }
  return token;
}

// ── Reference image upload ──────────────────────────────────────────────────
// Upload a photo to Flow so it can be used as a visual reference (imageInputs).
// Returns the media ID string. Caches per base64 hash to avoid re-uploading
// the same photo on every page generation.

// Cache stores either a resolved mediaId (string) or an in-flight promise.
// This deduplicates concurrent uploads — when 4 parallel tabs all need the
// same reference image, only one upload fires; the others await the same promise.
const _refCache = new Map(); // base64-prefix -> mediaId string | Promise<string>

async function uploadReferenceImage(base64Data, projectId, bearer, mimeType = 'image/jpeg', tabId) {
  // Cache key uses length + last 128 base64 chars rather than the historical
  // first-64 prefix. Two distinct JPEGs share an almost-identical header after
  // a 1024px / quality-0.85 resize, so the old key was colliding and returning
  // the WRONG mediaId — Flow then rendered listing mockups with the previous
  // session's cover. Length + tail entropy is collision-resistant.
  const cacheKey = base64Data.length + ':' + base64Data.slice(-128);
  const cached = _refCache.get(cacheKey);
  if (cached) {
    // Could be a resolved string or an in-flight promise — await handles both
    console.log('[flow-bridge] reusing cached/pending reference upload');
    return await cached;
  }

  // Store the upload promise immediately so concurrent calls share it
  const uploadPromise = (async () => {
    // Auto-detect MIME from the raw bytes if not provided
    if (!mimeType || mimeType === 'application/octet-stream') {
      try {
        const buf = base64ToBuf(base64Data.slice(0, 32));
        mimeType = detectMime(buf);
      } catch {
        mimeType = 'image/jpeg';
      }
    }

    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    const fileName = `reference${extMap[mimeType] || '.jpg'}`;

    const payload = {
      clientContext: { projectId, tool: 'PINHOLE' },
      imageBytes: base64Data,
      isUserUploaded: true,
      isHidden: false,
      mimeType,
      fileName,
    };

    const url = `${AISANDBOX}/flow/uploadImage`;
    // Proxy through labs.google tab to bypass Google WAF that blocks
    // service-worker-originated fetches with HTTP 403 "Sorry... automated queries".
    //
    // Content-Type MUST stay 'text/plain;charset=UTF-8' — this is Google Flow's
    // legacy "simple CORS" trick. The Flow web UI uses it too. If we send
    // 'application/json', the cross-origin fetch from labs.google content
    // script to aisandbox-pa.googleapis.com triggers an OPTIONS preflight that
    // this endpoint rejects with HTTP 400 INVALID_ARGUMENT, and the upload
    // silently fails (referenceUsed=false in the final response). The server
    // happily parses our JSON body regardless of Content-Type header.
    //
    // Retry inside the cached promise so concurrent callers awaiting the same
    // promise share the eventual success — Google's uploadImage rejects with
    // 400 INVALID_ARGUMENT intermittently when 10 tabs in the pool burst-upload
    // the same reference. Without retry-here, the first failure throws, the
    // cache entry is deleted, and N-1 callers race a fresh upload each.
    let lastErr;
    let lastBodyPreview;
    let lastStatus;
    const ATTEMPTS = 4;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const res = await fetchViaTab(tabId, {
          url,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'text/plain;charset=UTF-8',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.status < 200 || res.status >= 300) {
          lastStatus = res.status;
          lastBodyPreview = (res.body || '').slice(0, 2000);
          lastErr = new Error(`uploadImage HTTP ${res.status}: ${(res.body || '').slice(0, 800)}`);
          // Only retry on server-side / 4xx that look transient. 401/403 are
          // auth/abuse blocks where retrying won't help.
          if (res.status === 401 || res.status === 403) break;
          if (attempt < ATTEMPTS) {
            const delay = 800 * attempt + Math.floor(Math.random() * 600);
            console.warn(`[flow-bridge] uploadImage HTTP ${res.status} attempt ${attempt}/${ATTEMPTS}, retrying in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          break;
        }

        const data = JSON.parse(res.body);
        const mediaId = (data?.media || {}).name;
        if (!mediaId) {
          throw new Error(`uploadImage returned no mediaId: ${JSON.stringify(data).slice(0, 400)}`);
        }

        console.log('[flow-bridge] uploaded reference image, mediaId:', mediaId, attempt > 1 ? `(attempt ${attempt})` : '');
        // Replace the promise with the resolved string for future calls
        _refCache.set(cacheKey, mediaId);
        return mediaId;
      } catch (e) {
        lastErr = e;
        if (attempt < ATTEMPTS) {
          const delay = 800 * attempt + Math.floor(Math.random() * 600);
          console.warn(`[flow-bridge] uploadImage threw on attempt ${attempt}/${ATTEMPTS}, retrying in ${delay}ms:`, e?.message || e);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }

    console.error('[flow-bridge] uploadImage failed', {
      url,
      status: lastStatus,
      bodyPreview: lastBodyPreview,
      error: lastErr?.message,
    });
    throw lastErr || new Error('uploadImage failed after retries');
  })();

  _refCache.set(cacheKey, uploadPromise);

  try {
    return await uploadPromise;
  } catch (e) {
    // Upload failed — remove from cache so next attempt can retry
    _refCache.delete(cacheKey);
    throw e;
  }
}

// ── Flow batchGenerateImages call ───────────────────────────────────────────

async function callFlow({ prompt, model, ratio, projectId, bearer, recaptcha, imageInputs, tabId }) {
  const sessionId = ';' + Date.now();
  const batchId = crypto.randomUUID();
  const clientContext = {
    recaptchaContext: {
      token: recaptcha,
      applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB',
    },
    projectId,
    tool: 'PINHOLE',
    sessionId,
  };
  const seed = Math.floor(Math.random() * 0x7fffffff);
  const body = {
    clientContext,
    mediaGenerationContext: { batchId },
    useNewMedia: true,
    requests: [
      {
        clientContext,
        imageModelName: MODELS[model] || 'NARWHAL',
        imageAspectRatio: ASPECTS[ratio] || 'IMAGE_ASPECT_RATIO_SQUARE',
        structuredPrompt: { parts: [{ text: prompt }] },
        seed,
        imageInputs: imageInputs || [],
      },
    ],
  };

  const url = `${AISANDBOX}/projects/${projectId}/flowMedia:batchGenerateImages`;
  // Proxy through labs.google tab to bypass Google WAF.
  const res = await fetchViaTab(tabId, {
    url,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status < 200 || res.status >= 300) {
    console.error('[flow-bridge] callFlow failed', {
      url,
      status: res.status,
      projectId,
      model,
      responseHeaders: res.headers,
      bodyPreview: (res.body || '').slice(0, 2000),
    });
    const err = new Error(`Flow HTTP ${res.status}: ${(res.body || '').slice(0, 800)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(res.body);
}

function extractFirstImage(data) {
  const media = data?.media || [];
  for (const item of media) {
    const g = item?.image?.generatedImage || {};
    if (g.fifeUrl) return { type: 'url', url: g.fifeUrl };
    const b64 = g.encodedImage || g.imageBytes;
    if (b64) return { type: 'base64', data: b64 };
  }
  const panels = data?.imagePanels || [];
  const first = panels[0]?.generatedImages?.[0];
  if (first?.encodedImage) return { type: 'base64', data: first.encodedImage };
  const raw = JSON.stringify(data).slice(0, 500);
  throw new Error(`Flow returned no images. Raw head: ${raw}`);
}

// ── Bytes <-> base64 + MIME sniff (SW has no Buffer/DOMParser) ─────────────

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status} from ${url}`);
  return await res.arrayBuffer();
}

function detectMime(buf) {
  const b = new Uint8Array(buf);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'image/png';
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';
  return 'image/png';
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

// ── Top-level pipeline ──────────────────────────────────────────────────────

async function generateImageFlow({ prompt, aspectRatio = '1:1', model = 'banana2', referenceImage, referenceMimeType, referenceImages, referenceMimeTypes, slot }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }
  const tabId = slot.tabId;
  const projectId = await getProjectIdFromTab(tabId);
  console.log('[flow-bridge] using projectId from tab:', projectId);
  const bearer = await getAccessToken();
  const recaptcha = await getRecaptchaToken(tabId, 'IMAGE_GENERATION');

  // Upload reference image(s). Multi-character path: arrays of base64 +
  // mime types — each becomes its own imageInputs entry (Flow handles
  // multiple references natively). Single path: legacy fields.
  let imageInputs = [];
  let referenceUsed = false;
  let referenceError;
  if (Array.isArray(referenceImages) && referenceImages.length > 0) {
    const mimes = Array.isArray(referenceMimeTypes) ? referenceMimeTypes : [];
    const inputs = [];
    const errors = [];
    for (let i = 0; i < referenceImages.length; i++) {
      const b64 = referenceImages[i];
      if (!b64) continue;
      const mime = mimes[i] || 'image/jpeg';
      try {
        const mediaId = await uploadReferenceImage(b64, projectId, bearer, mime, tabId);
        inputs.push({ imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE', name: mediaId });
        console.log('[flow-bridge] using reference image[' + i + ']:', mediaId);
      } catch (e) {
        const msg = e?.message || String(e);
        errors.push('slot ' + i + ': ' + msg);
        console.warn('[flow-bridge] reference image[' + i + '] upload failed:', msg);
      }
    }
    if (inputs.length > 0) {
      imageInputs = inputs;
      referenceUsed = true;
    }
    if (errors.length > 0) {
      referenceError = errors.join('; ');
    }
  } else if (referenceImage) {
    try {
      const mediaId = await uploadReferenceImage(referenceImage, projectId, bearer, referenceMimeType, tabId);
      imageInputs = [{ imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE', name: mediaId }];
      referenceUsed = true;
      console.log('[flow-bridge] using reference image:', mediaId);
    } catch (e) {
      referenceError = e?.message || String(e);
      console.warn('[flow-bridge] reference image upload failed, generating without it:', referenceError);
      // Continue without reference — don't block generation
    }
  }

  let data;
  try {
    data = await callFlow({
      prompt, model, ratio: aspectRatio, projectId,
      bearer, recaptcha, imageInputs, tabId,
    });
  } catch (e) {
    if (e?.status === 401) {
      // Session expired — refresh token and retry once.
      console.warn('[flow-bridge] 401 on callFlow, refreshing token and retrying...');
      const freshBearer = await getAccessToken();
      const freshRecaptcha = await getRecaptchaToken(tabId, 'IMAGE_GENERATION');
      data = await callFlow({
        prompt, model, ratio: aspectRatio, projectId,
        bearer: freshBearer, recaptcha: freshRecaptcha, imageInputs, tabId,
      });
    } else {
      throw e;
    }
  }
  const img = extractFirstImage(data);

  let bytes;
  if (img.type === 'url') {
    bytes = await fetchBytes(img.url);
  } else {
    bytes = base64ToBuf(img.data);
  }
  const mime = detectMime(bytes);
  const b64 = bufToBase64(bytes);
  return { dataUrl: `data:${mime};base64,${b64}`, referenceUsed, referenceError };
}

// ── Port-based keepalive (MV3) ───────────────────────────────────────────────
// An open external Port keeps the service worker resident for as long as the
// port is connected — no timer tricks needed. The React app opens one port per
// generation request and disconnects when done. The handler here is intentionally
// a no-op: just holding the port open is enough.
chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== 'flow-gen-keepalive') return;
  // Keep SW alive. Port disconnects automatically when the FE closes it.
  port.onDisconnect.addListener(() => {});
});

// ── Message handlers ────────────────────────────────────────────────────────

// From the React app (http://localhost:3000). Must be registered
// synchronously at the top level so the SW is woken for each incoming message.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  console.log('[flow-bridge] onMessageExternal received:', msg?.type, 'from origin:', _sender?.origin);
  if (!msg || typeof msg !== 'object') {
    sendResponse({ ok: false, error: 'no message' });
    return false;
  }

  if (msg.type === 'ping') {
    sendResponse({ ok: true, extensionId: chrome.runtime.id, version: '6.0.1' });
    return false;
  }

  if (msg.type === 'flow-init-pool') {
    const size = Math.min(Math.max(msg.size || 4, 1), 10);
    pool.init(size).then(() => {
      sendResponse({ ok: true, ...pool.status() });
    }).catch(e => {
      sendResponse({ ok: false, error: String(e?.message || e) });
    });
    return true;
  }

  if (msg.type === 'flow-pool-status') {
    sendResponse({ ok: true, ...pool.status() });
    return false;
  }

  if (msg.type === 'flow-generate') {
    (async () => {
      try {
        // Auto-init pool with 1 tab if not yet initialized (backward compat)
        if (!pool.initialized && !pool.initializing) {
          await pool.init(1);
        }
        const slot = await pool.acquire();
        try {
          const result = await generateImageFlow({
            prompt: msg.prompt,
            aspectRatio: msg.aspectRatio,
            model: msg.model,
            referenceImage: msg.referenceImage || undefined,
            referenceMimeType: msg.referenceMimeType || undefined,
            referenceImages: Array.isArray(msg.referenceImages) ? msg.referenceImages : undefined,
            referenceMimeTypes: Array.isArray(msg.referenceMimeTypes) ? msg.referenceMimeTypes : undefined,
            slot,
          });
          sendResponse({ ok: true, image: result.dataUrl, referenceUsed: result.referenceUsed, referenceError: result.referenceError });
        } finally {
          pool.release(slot);
        }
      } catch (e) {
        console.error('[flow-bridge] generate failed:', e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true; // keep the message channel open for async sendResponse
  }

  sendResponse({ ok: false, error: `unknown message type: ${msg.type}` });
  return false;
});

// From the popup (chrome.runtime.sendMessage, same-extension).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'status') return false;
  (async () => {
    let flowTab = null;
    try {
      flowTab = await findFlowTab();
    } catch {}
    let auth = false;
    let authError = null;
    try {
      const res = await fetch(AUTH_SESSION_URL, { credentials: 'include' });
      auth = res.ok;
      if (!res.ok) authError = `HTTP ${res.status}`;
    } catch (e) {
      authError = String(e?.message || e);
    }
    // Extract projectId from the active Flow tab so the popup can show
    // exactly which project this session will hit.
    let projectId = null;
    let projectIdError = null;
    if (flowTab) {
      const m = (flowTab.url || '').match(UUID_RE);
      if (m) projectId = m[1];
      else projectIdError = 'No /project/{uuid} in tab URL — open a project in Flow first.';
    } else {
      projectIdError = 'No labs.google tab open.';
    }
    sendResponse({
      ok: true,
      extensionId: chrome.runtime.id,
      version: '6.0.1',
      flowTab: !!flowTab,
      flowTabId: flowTab?.id || null,
      flowTabUrl: flowTab?.url || null,
      auth,
      authError,
      projectId,
      projectIdError,
      pool: pool.status(),
    });
  })();
  return true;
});

// ── MV3 service-worker keepalive ────────────────────────────────────────────
// Chrome unloads MV3 service workers after ~30s of idle. A periodic alarm
// keeps the worker alive so long-running pool sessions don't get suspended
// mid-request (which manifested as "Flow extension timed out after 120s").
chrome.alarms.create('flow-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flow-keepalive') {
    // No-op tick. Just having the alarm fire keeps the SW resident.
  }
});

// ── Tab removal — clean up pool when tabs are closed ────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  pool.handleTabRemoved(tabId);
});

// Lifecycle diagnostics — helpful when tailing `chrome://extensions` SW logs.
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[flow-bridge] installed/updated:', details.reason);
});
chrome.runtime.onStartup.addListener(() => {
  console.log('[flow-bridge] startup');
});
