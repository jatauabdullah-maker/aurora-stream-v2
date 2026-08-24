/* Aurora Downloader — bridge content script (runs on Aurora) */

const TAG = '__aurora_ext__';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.tag !== TAG) return;

  if (msg.type === 'PING' || msg.type === 'DOWNLOAD') {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        const err = chrome.runtime.lastError?.message;
        window.postMessage(
          { tag: TAG, type: 'RESPONSE', id: msg.id, resp: err ? { ok: false, error: err } : resp },
          window.location.origin
        );
      });
    } catch (e) {
      window.postMessage(
        { tag: TAG, type: 'RESPONSE', id: msg.id, resp: { ok: false, error: String(e) } },
        window.location.origin
      );
    }
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'PROGRESS') {
    window.postMessage({ tag: TAG, type: 'PROGRESS', progress: msg.progress }, window.location.origin);
  }
});

window.postMessage({ tag: TAG, type: 'READY' }, window.location.origin);
