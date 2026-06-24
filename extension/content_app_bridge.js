/**
 * Flow Image Bridge — App Bridge content script.
 *
 * Runs on the 3T Studio React app origins (localhost dev + production
 * app.3tify.com) at document_start. Broadcasts the extension's runtime ID
 * to the page via window.postMessage so the app can call
 * chrome.runtime.sendMessage(extensionId, ...) without staff having to
 * paste the ID into a .env file.
 *
 * The beacon re-fires every 2s for the first 10s in case the React
 * listener mounts after page load. The page can also request a beacon
 * on demand by posting { __flowExtPing: true }.
 */

const BEACON = {
  __flowExtBeacon: true,
  extensionId: chrome.runtime.id,
  version: chrome.runtime.getManifest().version,
};

function fire() {
  window.postMessage(BEACON, location.origin);
}

fire();
let n = 0;
const t = setInterval(() => {
  fire();
  if (++n >= 5) clearInterval(t);
}, 2000);

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data && e.data.__flowExtPing) fire();
});
