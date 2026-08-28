/* Aurora Downloader — minimal service worker.
   The pipeline runs in a hidden extension page (pipeline.html) because MV3
   service workers are short-lived and lack DOMParser. The SW only routes
   messages between Aurora and the engine page. */

const PIPE_PATH = 'pipeline.html';

let auroraTabId = null;

function isFromEngine(sender) {
  return !!sender.url && sender.url.includes(`/${PIPE_PATH}`);
}

async function ensureEngineTab() {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url && t.url.includes(PIPE_PATH));
  if (existing) return existing.id;

  const win = await chrome.windows.create({ url: 'about:blank', focused: false, state: 'minimized' });
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(PIPE_PATH), windowId: win.id, active: false });
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000);
    const listener = (id, info) => {
      if (id === tab.id && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 600);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  return tab.id;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  /* ── from Aurora (via bridge content script) ──────────────── */

  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }

  if (msg.type === 'DOWNLOAD') {
    (async () => {
      auroraTabId = sender.tab?.id ?? null;
      const engineTabId = await ensureEngineTab();
      await chrome.tabs.sendMessage(engineTabId, { type: 'PIPE_RUN', payload: msg.payload || {}, auroraTabId });
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
    });
    return true;
  }

  /* Inspection can take a minute or more (work tabs, challenges). Awaiting the
     engine's reply inside this handler means the MV3 service worker can be
     torn down mid-await, which closes the port and surfaces as
     "The message port closed before a response was received."
     So: ack immediately and let the engine push INSPECT_RESULT back, exactly
     like DOWNLOAD does with PROGRESS/CHUNK. */
  if (msg.type === 'INSPECT') {
    (async () => {
      auroraTabId = sender.tab?.id ?? null;
      const engineTabId = await ensureEngineTab();
      await chrome.tabs.sendMessage(engineTabId, { type: 'PIPE_INSPECT', payload: msg.payload || {} });
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
    });
    return true;
  }

  if (msg.type === 'CANCEL') {
    chrome.tabs.query({}).then((tabs) => {
      const engine = tabs.find((t) => t.url && t.url.includes(PIPE_PATH));
      if (engine) chrome.tabs.sendMessage(engine.id, { type: 'PIPE_CANCEL' }).catch(() => undefined);
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'LIST_DOWNLOADS') {
    chrome.downloads.search({ filenameRegex: '\\.mp4$', orderBy: ['-startTime'], limit: 60 }, (items) => {
      const list = (items || [])
        .filter((i) => i.exists !== false)
        .map((i) => ({
          id: i.id,
          filename: (i.filename || '').split(/[\\/]/).pop(),
          bytes: i.fileSize,
          date: i.startTime,
        }));
      sendResponse({ ok: true, items: list });
    });
    return true;
  }

  if (msg.type === 'OPEN_DOWNLOAD') {
    chrome.downloads.open(msg.id);
    sendResponse({ ok: true });
    return;
  }

  /* ── from the engine page ─────────────────────────────────── */

  if (isFromEngine(sender) && (msg.type === 'PROGRESS' || msg.type === 'CHUNK' || msg.type === 'INSPECT_RESULT')) {
    if (auroraTabId) {
      chrome.tabs.sendMessage(auroraTabId, msg)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ cancel: true }));
    } else {
      sendResponse({ cancel: true });
    }
    return true;
  }
});
