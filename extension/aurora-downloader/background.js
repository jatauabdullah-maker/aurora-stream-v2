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
});

let jobRunning = false;

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
  const a = document.querySelector('a.redirect');
  return a ? a.href : null;
}

function submitFormFn() {
  const form = document.querySelector('form[action*="/d/"]');
  if (!form) return false;
  form.submit();
  return true;
}

/* ─── download tracking ─────────────────────────────────────── */

function waitForDownloadStart(timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.downloads.onCreated.removeListener(listener);
      reject(new Error('Download did not start (no response from source)'));
    }, timeoutMs);
    const listener = (item) => {
      clearTimeout(timer);
      chrome.downloads.onCreated.removeListener(listener);
      resolve(item);
    };
    chrome.downloads.onCreated.addListener(listener);
  });
}

function trackDownloadProgress(downloadId, report) {
  const timer = setInterval(async () => {
    try {
      const [item] = await chrome.downloads.search({ id: downloadId });
      if (!item) return;
      if (item.totalBytes > 0) {
        const pct = Math.round((item.bytesReceived / item.totalBytes) * 100);
        report({
          stage: 'downloading',
          message: `Downloading... ${pct}% (${(item.bytesReceived / 1048576).toFixed(0)}MB)`,
        });
      }
      if (item.state === 'complete' || item.state === 'interrupted') {
        clearInterval(timer);
      }
    } catch {
      clearInterval(timer);
    }
  }, 1500);
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

    const kwikUrl = await exec(tabId, extractRedirectFn);
    if (!kwikUrl || !/kwik\.cx/.test(kwikUrl)) throw new Error('Could not reach download page');

    await navigate(tabId, kwikUrl);
    if (!(await solveChallenge(tabId, report))) throw new Error('Security check not solved');

    report({ stage: 'resolving_link', message: 'Starting download...' });
    const submitted = await exec(tabId, submitFormFn);
    if (!submitted) throw new Error('Download form not found');

    const item = await waitForDownloadStart();
    report({ stage: 'downloading', message: 'Downloading...' });
    trackDownloadProgress(item.id, report);

    await waitDownloadSettled(item.id);
    const [final] = await chrome.downloads.search({ id: item.id });
    if (final?.state === 'interrupted') throw new Error('Download interrupted');

    report({
      stage: 'complete',
      message: `Saved to Downloads: ${final?.filename?.split(/[\\/]/).pop() || 'episode'}`,
    });
    return { ok: true, seconds: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    report({ stage: 'error', message: String(err?.message || err).slice(0, 200) });
    throw err;
  } finally {
    chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

function waitDownloadSettled(downloadId, timeoutMs = 30 * 60 * 1000) {
  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const [item] = await chrome.downloads.search({ id: downloadId });
        if (!item || item.state === 'complete' || item.state === 'interrupted') {
          clearInterval(timer);
          resolve();
        }
      } catch {
        clearInterval(timer);
        resolve();
      }
    }, 3000);
    setTimeout(() => {
      clearInterval(timer);
      resolve();
    }, timeoutMs);
  });
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
