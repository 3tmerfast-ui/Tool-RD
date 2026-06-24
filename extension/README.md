# Flow Image Bridge (extension v5)

Chrome extension that lets the Remix AI Studio React app talk directly to
**Google Labs Flow** (Nano Banana / Imagen) without any Python, Selenium,
CDP, or `--remote-debugging-port` hack.

## What it replaces

| Old path (v3 / v4)                           | New path (v5) |
|----------------------------------------------|---------------|
| Chrome on `--remote-debugging-port=9222`     | ❌ not needed |
| `flow_automation/src/cdp_session.py`         | ❌ not used  |
| `flow_automation/src/recaptcha_bridge.py`    | ❌ not used  |
| `flow_automation/src/flow_client.py` (HTTP)  | ↪️ moved into `background.js` |
| `app/services/flow_image_service.py`         | ❌ not used by the React app |
| `app/routers/pollinations.py` FastAPI route  | ❌ not used by the React app |

The React app now calls the extension directly via `chrome.runtime.sendMessage`.

## Architecture

```
┌────────────────────────┐  chrome.runtime.sendMessage   ┌─────────────────────┐
│ React app (localhost)  │ ────────────────────────────▶ │ Extension SW        │
│ src/services/          │                                │ background.js       │
│   flowImageService.ts  │ ◀──── base64 data URL ───────  │                     │
└────────────────────────┘                                │ 1. findOrOpenFlowTab│
                                                          │ 2. /fx/api/auth/... │
                                                          │ 3. get recaptcha    │◀─┐
                                                          │ 4. aisandbox-pa POST│  │
                                                          └─────────────────────┘  │
                                                                     │             │
                                                                     ▼             │
                                                          ┌─────────────────────┐  │
                                                          │ labs.google tab     │  │
                                                          │ content_isolated.js │──┘
                                                          │ content_main.js     │
                                                          │ (grecaptcha MAIN)   │
                                                          └─────────────────────┘
```

## Install

1. **Open** `chrome://extensions` in Google Chrome.
2. **Enable Developer mode** (toggle top-right).
3. Click **Load unpacked** and select this directory:
   `Book/backend/flow_automation/extension_v5/`
4. Chrome shows the extension card. **Copy the "ID"** shown under the extension
   name (32 hex-ish characters, e.g. `abcdefghijklmnopqrstuvwxyzabcdef`).
5. In `Book/remix_-ai-studio/.env.local`, add:

   ```
   VITE_FLOW_EXT_ID=<the id you just copied>
   ```

   If `.env.local` does not exist yet, create it. Do **not** commit this file.
6. Restart `npm run dev` so Vite picks up the new env var.
7. Sign into Google Labs Flow once: click the extension icon in the toolbar,
   then click **Open Flow**. Log in with your account. You should see both
   dots turn green in the popup (Flow tab ✓, Auth ✓).

That's it. The first image you generate from the app will either reuse the
existing Flow tab or auto-open one in the background.

## Developer notes

### Files
- `manifest.json` — MV3 manifest. Declares `externally_connectable` for
  localhost:3000 / 5173, `host_permissions` for labs.google and
  aisandbox-pa.googleapis.com, a service worker, and two content scripts
  (one ISOLATED, one MAIN).
- `background.js` — service worker. Owns all cross-origin fetches
  (auth/session + flowMedia:batchGenerateImages), coordinates the reCAPTCHA
  round-trip, downloads the generated image and returns it as a base64 data
  URL to the React app. Serialises calls with a Promise chain because
  `grecaptcha.enterprise.execute()` cannot run in parallel.
- `content_isolated.js` — content script in the ISOLATED world. Owns
  `chrome.runtime.onMessage` (which is **not available** in the MAIN world
  per Chromium issue 40826594). Relays `get-recaptcha` requests from the SW
  to the MAIN script via `window.postMessage` with a correlation UUID.
- `content_main.js` — content script in the MAIN world. Owns
  `window.grecaptcha.enterprise` access. Listens for `postMessage` requests
  from its isolated-world sibling, calls `grecaptcha.enterprise.execute()`,
  and posts the token back.
- `popup.html` / `popup.js` — tiny status UI with Flow-tab / Auth indicators,
  a copy-extension-ID button, an Open-Flow button, and a Refresh button.

### Why split content scripts?
`chrome.runtime.*` APIs are blocked in MAIN-world content scripts in MV3
(you can register them with `"world": "MAIN"` but the runtime APIs aren't
exposed). Since we need BOTH `chrome.runtime.onMessage` (to talk to the SW)
AND `grecaptcha` (which only exists in the page's JS context), we register
two scripts and bridge them with `window.postMessage`. This is the MV3
idiomatic pattern; see https://issues.chromium.org/issues/40826594

### Why SW for the final fetch, not content script?
Content scripts inherit the page's origin and are subject to CORS. Only the
extension service worker (or extension pages) can make cross-origin fetches
with the cookies declared via `host_permissions`. See:
https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/

### Debugging
- **SW logs**: `chrome://extensions` → "Service worker" link under the card.
- **Content script logs**: open the labs.google tab, then DevTools → Console.
- **Popup logs**: right-click the extension icon → Inspect popup.
- **Ping the extension from the React app**:
  ```js
  await (await import('./src/services/flowImageService')).isFlowExtensionReachable()
  ```

### Config
Currently hard-coded in `background.js`:
- `FLOW_PROJECT_ID = 'e17fd816-0744-4829-96f6-2c66e2e88e39'` (your Flow project)
- `FLOW_TAB_URL = 'https://labs.google/fx/tools/flow'`
- `SITE_KEY` (in `content_main.js`) — Flow's public reCAPTCHA Enterprise key

If you need a different Flow project ID per install, the cleanest upgrade is
to add a text field in `popup.html`, persist to `chrome.storage.sync`, and
read it from the SW at generate time.

### Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| `Flow extension not installed or VITE_FLOW_EXT_ID is not set` | Missing env var or extension not loaded | Install per steps above and restart `npm run dev` |
| `Flow extension unreachable: Could not establish connection...` | Wrong `VITE_FLOW_EXT_ID` | Copy the ID from `chrome://extensions` and update `.env.local` |
| `auth/session HTTP 401 — not signed into labs.google` | Not logged in | Click popup → Open Flow → sign into Google |
| `grecaptcha.enterprise is not loaded on this page yet` | Flow tab still loading | Wait ~5s and retry; the extension auto-retries the tab ready check |
| `Flow HTTP 400` | Prompt rejected or model invalid | Check the prompt; try a different model in the Story config panel |
| `Flow HTTP 403` | OAuth token stale or not authorised | Reload the Flow tab — extension re-fetches bearer on each request |
