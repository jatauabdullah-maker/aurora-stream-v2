/* Aurora Downloader — background orchestrator (MV3 service worker) */

const SOURCE_BASE = 'https://animepahe.pw';

/* ─── messaging ─────────────────────────────────────────────── */

// top-level listeners keep the SW wakeable for tab events
chrome.tabs.onUpdated.addListener(() => undefined);
chrome.tabs.onRemoved.addListener(() => undefined);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version, busy: jobRunning });
    return;
  }

  if (msg.type === 'DOWNLOAD') {
    if (jobRunning) {
      sendResponse({ ok: false, error: 'A download is already running' });
      return;
    }
    sendResponse({ ok: true });
    runJob(msg.payload || {}, sender.tab?.id).catch((err) => {
      reportTo(sender.tab?.id, { type: 'PROGRESS', progress: { stage: 'error', message: String(err).slice(0, 200) } });
    });
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

  if (msg.type === 'CHUNK') {
    // relay stream chunks from the kwik tab to the Aurora tab
    if (currentJobAuroraTab) {
      chrome.tabs.sendMessage(currentJobAuroraTab, { type: 'CHUNK', data: msg.data, received: msg.received, total: msg.total, done: msg.done })
        .then((r) => sendResponse(r))
        .catch(() => sendResponse({ cancel: true }));
    } else {
      sendResponse({ cancel: true });
    }
    return true;
  }
});

let jobRunning = false;
let currentJobAuroraTab = null;

function reportTo(auroraTabId, msg) {
  if (!auroraTabId) return;
  chrome.tabs.sendMessage(auroraTabId, msg).catch(() => undefined);
}

/* ─── tab helpers ───────────────────────────────────────────── */

function waitTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 800);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function navigate(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await waitTabComplete(tabId);
}

async function exec(tabId, func, ...args) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result;
}

/* Poll from the BACKGROUND side: survives navigations that destroy the page
   context (redirect chains), re-injecting a short check every second. */
async function pollFor(tabId, func, timeoutMs, ...args) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await exec(tabId, func, ...args);
      if (r) return r;
    } catch {
      // execution context destroyed (navigation) — keep polling
    }
    await sleep(1000);
  }
  return null;
}

/* ─── cloudflare challenge ──────────────────────────────────── */

function isChallenged() {
  return /just a moment/i.test(document.title || '');
}

function clickTurnstileWidget() {
  // runs inside the challenges.cloudflare.com iframe
  const input = document.querySelector('input[type="checkbox"]');
  if (input) {
    input.click();
    return 'clicked-input';
  }
  const box = document.querySelector('[role="checkbox"], .ctp-checkbox-label, #challenge-stage label');
  if (box) {
    box.click();
    return 'clicked-box';
  }
  return 'nothing-found';
}

async function solveChallenge(tabId, report) {
  // Phase 1: quick synthetic attempts (works occasionally, harmless otherwise)
  const autoDeadline = Date.now() + 15000;
  let attempted = false;

  while (Date.now() < autoDeadline) {
    const challenged = await exec(tabId, isChallenged).catch(() => false);
    if (!challenged) return true;

    if (!attempted) {
      report({ stage: 'solving_protection', message: 'Solving security check...' });
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: clickTurnstileWidget,
      }).catch(() => undefined);
      attempted = true;
    }
    await sleep(4000);
  }

  // Phase 2: one trusted click from the user — clearance cookie then lasts ~a year,
  // so this is normally needed only once per browser.
  const stillChallenged = await exec(tabId, isChallenged).catch(() => false);
  if (!stillChallenged) return true;

  report({
    stage: 'solving_protection',
    message: 'One-time step: click the security checkbox in the opened tab (only needed once)',
  });
  await chrome.tabs.update(tabId, { active: true });
  const manualDeadline = Date.now() + 180000;
  while (Date.now() < manualDeadline) {
    const challenged = await exec(tabId, isChallenged).catch(() => false);
    if (!challenged) {
      await chrome.tabs.update(tabId, { active: false }).catch(() => undefined);
      report({ stage: 'solving_protection', message: 'Security check passed — continuing...' });
      return true;
    }
    await sleep(3000);
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── pipeline page functions (injected) ────────────────────── */

function searchAnimeFn(title) {
  return (async () => {
    try {
      const res = await fetch(`/api?m=search&q=${encodeURIComponent(title)}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const hit = data?.data?.[0];
        if (hit?.session) return { uuid: hit.session, name: hit.name };
      }
    } catch {
      // fall through to DOM autocomplete
    }
    return null;
  })();
}

function findEpisodeFn(epNum) {
  const links = [...document.querySelectorAll('a.play[href*="/play/"]')];
  for (const a of links) {
    const m = (a.textContent || '').match(/(\d+(?:\.\d+)?)/);
    if (m && parseFloat(m[1]) === epNum) return { href: a.href };
  }
  const nums = links
    .map((a) => {
      const m = (a.textContent || '').match(/(\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : NaN;
    })
    .filter((n) => !Number.isNaN(n));
  const next = document.querySelector('nav[aria-label="Page navigation"] a[rel="next"], nav[aria-label="Page navigation"] a:last-child');
  return { notFound: true, minOnPage: nums.length ? Math.min(...nums) : null, nextHref: next?.href ?? null };
}

function extractQualityFn() {
  return [...document.querySelectorAll('a[href*="pahe.win"]')].map((a) => ({
    text: a.textContent || '',
    href: a.href,
  }));
}

function extractRedirectFn() {
  // short check — the background polls with re-injection across redirect chains
  const a = document.querySelector('a.redirect');
  return a ? a.href : null;
}

function waitForKwikFormFn() {
  const form = document.querySelector('form[action*="/d/"]');
  return form ? true : null;
}

/* Streams the MP4 from the kwik page itself (correct Referer + user IP),
   chunked through the background to the Aurora tab. */
function streamDownloadFn() {
  return (async () => {
    const form = document.querySelector('form[action*="/d/"]');
    if (!form) return { error: 'Download form not found' };

    const res = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    if (!res.ok || !res.body) return { error: 'HTTP ' + res.status };

    const disposition = res.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    const filename = filenameMatch ? filenameMatch[1] : null;

    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    let received = 0;
    let pending = [];
    let pendingBytes = 0;
    const CHUNK_TARGET = 2 * 1024 * 1024;

    const toB64 = (bytes) => {
      let binary = '';
      const arr = new Uint8Array(bytes);
      const step = 0x8000;
      for (let i = 0; i < arr.length; i += step) {
        binary += String.fromCharCode.apply(null, arr.subarray(i, i + step));
      }
      return btoa(binary);
    };

    const sendChunk = async (b64, done) => {
      const resp = await chrome.runtime.sendMessage({
        type: 'CHUNK',
        data: b64,
        received,
        total,
        done,
      });
      if (resp?.cancel) throw new Error('Cancelled by user');
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      pending.push(value);
      pendingBytes += value.byteLength;
      if (pendingBytes >= CHUNK_TARGET) {
        const merged = new Uint8Array(pendingBytes);
        let off = 0;
        for (const p of pending) {
          merged.set(p, off);
          off += p.byteLength;
        }
        pending = [];
        pendingBytes = 0;
        await sendChunk(toB64(merged), false);
      }
    }
    if (pending.length) {
      const merged = new Uint8Array(pendingBytes);
      let off = 0;
      for (const p of pending) {
        merged.set(p, off);
        off += p.byteLength;
      }
      await sendChunk(toB64(merged), true);
    } else {
      await sendChunk('', true);
    }

    return { ok: true, bytes: received, filename };
  })();
}

/* ─── quality pick ──────────────────────────────────────────── */

function pickQuality(links, preferred) {
  const parsed = links
    .map((l) => {
      const qm = l.text.match(/(360|720|1080)p/);
      const sm = l.text.match(/\((\d+(?:\.\d+)?)\s*MB\)/i);
      return qm ? { quality: `${qm[1]}p`, href: l.href, sizeMB: sm ? parseFloat(sm[1]) : undefined } : null;
    })
    .filter(Boolean);
  if (parsed.length === 0) return null;
  return (
    parsed.find((q) => q.quality === preferred) ??
    parsed.find((q) => q.quality === '720p') ??
    parsed[parsed.length - 1]
  );
}

/* ─── main pipeline ─────────────────────────────────────────── */

async function runPipeline(payload, report) {
  const title = payload.animeTitle;
  const epNum = Number(payload.episodeNumber);
  const quality = payload.quality || '720p';
  if (!title || !epNum) throw new Error('Missing animeTitle or episodeNumber');

  const started = Date.now();
  const tab = await chrome.tabs.create({ url: SOURCE_BASE, active: false });
  const tabId = tab.id;

  try {
    report({ stage: 'searching', message: `Opening source for "${title}"...` });
    await waitTabComplete(tabId);
    if (!(await solveChallenge(tabId, report))) throw new Error('Security check not solved');

    let anime = await exec(tabId, searchAnimeFn, title);
    if (!anime?.uuid) throw new Error(`"${title}" not found on source`);
    report({ stage: 'found_anime', message: `Found: ${anime.name || title}` });

    await navigate(tabId, `${SOURCE_BASE}/anime/${anime.uuid}`);
    if (!(await solveChallenge(tabId, report))) throw new Error('Security check not solved');

    report({ stage: 'finding_episode', message: `Looking for episode ${epNum}...` });
    let playUrl = null;
    for (let page = 1; page <= 40 && !playUrl; page++) {
      const res = await exec(tabId, findEpisodeFn, epNum);
      if (res?.href) {
        playUrl = res.href;
        break;
      }
      if (res?.minOnPage != null && res.minOnPage < epNum) break;
      if (!res?.nextHref) break;
      await navigate(tabId, res.nextHref);
      if (!(await solveChallenge(tabId, report))) throw new Error('Security check not solved');
    }
    if (!playUrl) throw new Error(`Episode ${epNum} not found`);

    report({ stage: 'on_play_page', message: `Opening episode ${epNum}...` });
    await navigate(tabId, playUrl);
    if (!(await solveChallenge(tabId, report))) throw new Error('Security check not solved');

    const links = await exec(tabId, extractQualityFn);
    const chosen = pickQuality(links || [], quality);
    if (!chosen) throw new Error('No download links found');

    report({ stage: 'on_redirect', message: `Fetching ${chosen.quality} link...` });
    await navigate(tabId, chosen.href);
    if (!(await solveChallenge(tabId, report))) throw new Error('Security check not solved');

    const kwikUrl = await pollFor(tabId, extractRedirectFn, 30000);
    if (!kwikUrl || !/kwik\.cx/.test(kwikUrl)) throw new Error('Could not reach download page');

    await navigate(tabId, kwikUrl);
    if (!(await solveChallenge(tabId, report))) throw new Error('Security check not solved');

    report({ stage: 'resolving_link', message: 'Starting download...' });
    const formReady = await pollFor(tabId, waitForKwikFormFn, 20000);
    if (!formReady) throw new Error('Download form not found');

    currentJobAuroraTab = auroraTabId;
    report({ stage: 'downloading', message: 'Downloading...' });

    const streamResult = await exec(tabId, streamDownloadFn);
    currentJobAuroraTab = null;

    if (!streamResult?.ok) throw new Error(streamResult?.error || 'Download stream failed');

    report({
      stage: 'complete',
      message: `Downloaded: ${streamResult.filename || 'episode'} (${(streamResult.bytes / 1048576).toFixed(0)}MB)`,
    });
    return {
      ok: true,
      seconds: Math.round((Date.now() - started) / 1000),
      filename: streamResult.filename,
      bytes: streamResult.bytes,
    };
  } catch (err) {
    report({ stage: 'error', message: String(err?.message || err).slice(0, 200) });
    throw err;
  } finally {
    chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

async function runJob(payload, auroraTabId) {
  jobRunning = true;
  const report = (progress) => reportTo(auroraTabId, { type: 'PROGRESS', progress });
  try {
    await runPipeline(payload, report);
  } finally {
    jobRunning = false;
  }
}

/* exposed for testing */
globalThis.__auroraRunPipeline = runPipeline;
