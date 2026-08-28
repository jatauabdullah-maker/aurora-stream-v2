/* Aurora Downloader — bridge content script (runs on Aurora) */

const TAG = '__aurora_ext__';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.tag !== TAG) return;

  if (
    msg.type === 'PING' ||
    msg.type === 'DOWNLOAD' ||
    msg.type === 'INSPECT' ||
    msg.type === 'CANCEL' ||
    msg.type === 'LIST_DOWNLOADS' ||
    msg.type === 'OPEN_DOWNLOAD'
  ) {
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'PROGRESS') {
    window.postMessage({ tag: TAG, type: 'PROGRESS', progress: msg.progress }, window.location.origin);
  } else if (msg.type === 'INSPECT_RESULT') {
    window.postMessage({ tag: TAG, type: 'INSPECT_RESULT', result: msg.result }, window.location.origin);
    sendResponse({ ok: true });
  } else if (msg.type === 'CHUNK') {
    window.postMessage(
      {
        tag: TAG,
        type: 'CHUNK',
        data: msg.data,
        received: msg.received,
        total: msg.total,
        done: msg.done,
        filename: msg.filename,
      },
      window.location.origin
    );
    sendResponse({ ok: true });
  }
});

window.postMessage({ tag: TAG, type: 'READY' }, window.location.origin);

// wake the service worker so it's ready for the first download
try {
  chrome.runtime.sendMessage({ type: 'PING' }, () => void chrome.runtime.lastError);
} catch {
  // extension context gone
}
