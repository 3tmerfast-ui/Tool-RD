/**
 * Flow Image Bridge — Popup script.
 * Asks the service worker for status and wires the open/refresh/copy buttons.
 */

const FLOW_URL = 'https://labs.google/fx/tools/flow';

const flowDot = document.getElementById('flowDot');
const flowVal = document.getElementById('flowVal');
const authDot = document.getElementById('authDot');
const authVal = document.getElementById('authVal');
const projectDot = document.getElementById('projectDot');
const projectVal = document.getElementById('projectVal');
const idVal = document.getElementById('idVal');
const errEl = document.getElementById('err');
const openBtn = document.getElementById('openBtn');
const refreshBtn = document.getElementById('refreshBtn');
const copyBtn = document.getElementById('copyBtn');

function showError(msg) {
  errEl.textContent = msg;
  errEl.style.display = msg ? 'block' : 'none';
}

async function refresh() {
  showError('');
  flowDot.className = 'dot';
  authDot.className = 'dot';
  projectDot.className = 'dot';
  flowVal.textContent = 'checking…';
  authVal.textContent = 'checking…';
  projectVal.textContent = 'checking…';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'status' });
    if (!res || !res.ok) throw new Error('no response from service worker');

    idVal.textContent = res.extensionId;

    if (res.flowTab) {
      flowDot.className = 'dot ok';
      const short = (res.flowTabUrl || '').replace('https://labs.google', '');
      flowVal.textContent = short || 'open';
    } else {
      flowDot.className = 'dot err';
      flowVal.textContent = 'not open';
    }

    if (res.auth) {
      authDot.className = 'dot ok';
      authVal.textContent = 'signed in';
    } else {
      authDot.className = 'dot err';
      authVal.textContent = res.authError || 'signed out';
    }

    if (res.projectId) {
      projectDot.className = 'dot ok';
      projectVal.textContent = res.projectId;
    } else {
      projectDot.className = 'dot err';
      projectVal.textContent = res.projectIdError || 'no project';
    }
  } catch (e) {
    showError(String(e?.message || e));
  }
}

openBtn.addEventListener('click', async () => {
  await chrome.tabs.create({ url: FLOW_URL });
  setTimeout(refresh, 1500);
});

refreshBtn.addEventListener('click', refresh);

copyBtn.addEventListener('click', async () => {
  const text = idVal.textContent;
  if (!text || text === '—') return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '✓';
    setTimeout(() => (copyBtn.textContent = 'copy'), 1200);
  } catch (e) {
    showError('Clipboard: ' + String(e?.message || e));
  }
});

refresh();
