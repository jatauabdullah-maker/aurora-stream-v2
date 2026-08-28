/* Aurora Downloader — pipeline engine (runs in a hidden extension page).
   Ported from kaze-downloader v2.1 (see kaze DOCUMENTATION.md):
   - parked per-host work tabs in a minimized window (first-party cookies)
   - XHR sniping for pahe.win (no countdown waits)
   - kwik form via real tab DOM polling (form is JS-built)
   - CDN URL capture via webRequest + DNR Referer rule
   - streams the MP4 to the Aurora page via chunk relay (IndexedDB playback) */

'use strict';

const REFERRER_RULE_ID = 424242;

const Pipeline = (() => {
  const BASE = 'https://animepahe.pw';

  let activeJob = null;
  let solving = false;
  const workTabs = new Map();
  const creating = new Map();
  let workWinId = null;
  let kwikTabId = null;
  let auroraTab = null;
  let engineTabId = null;

  /* ── engine page status indicator ──────────────────────────── */

  function setStatus(state, label) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusLabel');
    const guide = document.getElementById('guide');
    const stageLine = document.getElementById('stageLine');
    const subtitle = document.getElementById('engineSubtitle');

    if (dot) dot.className = `status-dot status-dot--${state}`;
    if (text) text.textContent = state === 'busy' ? 'Working' : 'Idle';

    const busy = state === 'busy';
    if (guide) guide.classList.toggle('show', busy);
    if (stageLine) {
      stageLine.classList.toggle('show', busy);
      if (busy) stageLine.textContent = label;
    }
    if (subtitle) {
      subtitle.textContent = busy
        ? 'Working on your download.'
        : 'Engine idling — downloads are driven from Aurora.';
    }
  }

  /* ── messaging to Aurora (relayed by the service worker) ──── */

  function stage(msg) {
    setStatus('busy', msg);
    // Always relay — the service worker drops it if no Aurora tab is bound.
    chrome.runtime
      .sendMessage({ type: 'PROGRESS', progress: { stage: 'resolving', message: msg } })
      .catch(() => undefined);
  }

  function sendChunk(b64, received, total, done, filename) {
    return chrome.runtime
      .sendMessage({ type: 'CHUNK', data: b64, received, total, done, filename })
      .then((resp) => {
        if (resp?.cancel) throw new Error('Cancelled');
      })
      .catch((e) => {
        if (String(e).includes('Cancelled')) throw e;
        throw new Error('Lost contact with Aurora — download stopped');
      });
  }

  /* ── utils ────────────────────────────────────────────────── */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function padNum(n) {
    const s = String(n);
    return s.length < 2 ? '0' + s : s;
  }

  /* ── parked work tabs (first-party cookie context) ────────── */

  async function getWorkWindow() {
    if (workWinId !== null) {
      try {
        await chrome.windows.get(workWinId);
        return workWinId;
      } catch {
        workWinId = null;
      }
    }
    const win = await chrome.windows.create({ url: 'about:blank', focused: false, state: 'minimized' });
    workWinId = win.id;
    return win.id;
  }

  async function createWorkTab(url) {
    const winId = await getWorkWindow();
    return chrome.tabs.create({ url, windowId: winId, active: false });
  }

  function waitTabComplete(tabId, timeoutMs = 45000) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        setTimeout(() => resolve(v), 500);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') finish(true);
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') finish(true); }).catch(() => finish(false));
    });
  }

  async function getWorkTab(hostname) {
    if (creating.has(hostname)) return creating.get(hostname);
    const p = (async () => {
      let tabId = workTabs.get(hostname);
      if (tabId !== undefined) {
        try {
          const t = await chrome.tabs.get(tabId);
          if (t.url && new URL(t.url).hostname === hostname) return tabId;
        } catch {}
        workTabs.delete(hostname);
      }
      const url = hostname === 'pahe.win' ? 'https://pahe.win/' : `https://${hostname}/`;
      const tab = await createWorkTab(url);
      workTabs.set(hostname, tab.id);
      await waitTabComplete(tab.id);
      return tab.id;
    })();
    creating.set(hostname, p);
    try {
      return await p;
    } finally {
      creating.delete(hostname);
    }
  }

  async function closeWorkTabs() {
    for (const [, tabId] of workTabs) {
      await chrome.tabs.remove(tabId).catch(() => undefined);
    }
    workTabs.clear();
    if (kwikTabId !== null) {
      await chrome.tabs.remove(kwikTabId).catch(() => undefined);
      kwikTabId = null;
    }
    if (workWinId !== null) {
      await chrome.windows.remove(workWinId).catch(() => undefined);
      workWinId = null;
    }
  }

  function tabFetch(tabId, url, opts = {}) {
    return chrome.scripting.executeScript({
      target: { tabId },
      func: async (u, o) => {
        try {
          const r = await fetch(u, { credentials: 'include', ...o });
          const text = await r.text();
          const ra = r.headers.get('retry-after');
          return { status: r.status, text, retryAfter: ra ? Number(ra) : null };
        } catch (e) {
          return { status: 0, error: String((e && e.message) || e) };
        }
      },
      args: [url, opts],
    }).then(([r]) => r?.result || { status: 0, error: 'no result' }).catch((e) => ({ status: 0, error: String(e) }));
  }

  /* Branded overlay on a work tab. `action: true` renders the loud
     "solve the checkbox" variant used during a challenge handoff. */
  function injectBanner(tabId, text, action = false) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: (t, isAction) => {
        const ID = 'aurora-banner';
        let b = document.getElementById(ID);
        if (!b) {
          b = document.createElement('div');
          b.id = ID;
          document.documentElement.appendChild(b);
          const style = document.createElement('style');
          style.textContent =
            '@keyframes aurora-pulse{0%,100%{box-shadow:0 0 0 0 rgba(139,124,248,.55)}50%{box-shadow:0 0 0 10px rgba(139,124,248,0)}}';
          document.documentElement.appendChild(style);
        }
        b.style.cssText =
          'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
          'background:linear-gradient(100deg,#8b7cf8,#4cc3f0);color:#fff;' +
          'font:700 15px/1.45 Inter,system-ui,sans-serif;padding:14px 18px;' +
          'text-align:center;box-shadow:0 6px 28px rgba(0,0,0,.5);' +
          'letter-spacing:-.005em;' +
          (isAction ? 'animation:aurora-pulse 1.8s ease-in-out infinite;' : '');
        b.innerHTML =
          '<span style="display:inline-flex;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap">' +
          '<span style="width:20px;height:20px;border-radius:6px;background:rgba(255,255,255,.22);' +
          'display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.14v14l11-7z"/></svg></span>' +
          '<span>' + t + '</span></span>';
      },
      args: [text, action],
    }).catch(() => undefined);
  }

  /* Bring a tab to the user, forcefully.
     A minimized window will not accept `focused: true` in the same call that
     activates the tab — the state change has to land first, otherwise the
     challenge tab stays hidden and the user never sees the checkbox. */
  async function focusTab(tabId, active) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (active) {
        // 1. un-minimize, 2. focus the window, 3. activate the tab
        await chrome.windows.update(tab.windowId, { state: 'normal' }).catch(() => undefined);
        await sleep(120);
        await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }).catch(() => undefined);
        await chrome.tabs.update(tabId, { active: true, highlighted: true }).catch(() => undefined);
        await sleep(120);

        // Verify it actually came forward; retry once if Chrome ignored us.
        const win = await chrome.windows.get(tab.windowId).catch(() => null);
        if (win && (win.state === 'minimized' || !win.focused)) {
          await chrome.windows.update(tab.windowId, { state: 'normal', focused: true, drawAttention: true }).catch(() => undefined);
          await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
        }
      } else {
        await chrome.tabs.update(tabId, { active: false }).catch(() => undefined);
      }
    } catch {}
  }

  /* Our own page — the branded engine view. */
  async function getEngineTab() {
    if (engineTabId !== null) return engineTabId;
    try {
      const t = await chrome.tabs.getCurrent();
      if (t?.id != null) engineTabId = t.id;
    } catch {}
    return engineTabId;
  }

  /* After a handoff, land the user on the Aurora engine page rather than
     dumping them on a raw kwik/pahe tab, then tuck the work window away. */
  async function focusEngineAfterHandoff() {
    const engine = await getEngineTab();
    if (engine !== null) {
      await focusTab(engine, true).catch(() => undefined);
    } else if (auroraTab) {
      await focusTab(auroraTab, true).catch(() => undefined);
    }
    if (workWinId !== null) {
      await chrome.windows.update(workWinId, { state: 'minimized', focused: false }).catch(() => undefined);
    }
  }

  // kept for the paths that just want the work window hidden again
  const focusAuroraBack = focusEngineAfterHandoff;

  /* ── low-level fetch with clearance handoff ────────────────── */

  function looksLikeChallenge(status, text) {
    if (status === 403 || status === 503) return true;
    if (typeof text === 'string' && text.length < 100000 && /just a moment/i.test(text)) return true;
    return false;
  }

  async function rawFetch(url, opts = {}) {
    const maxAttempts = 4;
    const hostname = new URL(url).hostname;
    let lastRes = null;
    for (let i = 0; i < maxAttempts; i++) {
      if (activeJob?.cancelled) throw new Error('Cancelled');
      const tabId = await getWorkTab(hostname);
      const res = await tabFetch(tabId, url, opts);
      if (res.status === 0) {
        await sleep(1200);
        continue;
      }
      lastRes = res;
      if (res.status === 429) {
        const wait = res.retryAfter && res.retryAfter > 0 ? Math.min(res.retryAfter, 60) * 1000 : Math.min(4000 * (i + 1) * (i + 1), 30000);
        stage(`Rate limited — waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!looksLikeChallenge(res.status, res.text)) return res;
      if (opts.noSolve || solving) return res;
      stage(`Security check on ${hostname} — handing you the tab`);
      solving = true;
      let solved = false;
      try {
        solved = await humanSolve(url, tabId);
      } finally {
        solving = false;
      }
      if (!solved) return res;
    }
    if (lastRes) return lastRes;
    throw new Error(`Could not reach ${hostname}`);
  }

  async function fetchText(url, opts = {}) {
    const res = await rawFetch(url, opts);
    if (looksLikeChallenge(res.status, res.text)) {
      throw new Error(`${new URL(url).hostname} is showing a security check that could not be passed`);
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    return res.text;
  }

  async function fetchJson(url, opts = {}) {
    return JSON.parse(await fetchText(url, { ...opts, headers: { ...(opts.headers || {}), Accept: 'application/json' } }));
  }

  /* ── cloudflare / turnstile handoff ────────────────────────── */

  function clickTurnstileInFrame() {
    // Turnstile renders inside a cross-origin iframe; executeScript with
    // allFrames lets us run *inside* it, where the checkbox is same-origin.
    const input = document.querySelector('input[type="checkbox"]');
    if (input) {
      input.click();
      return 'input';
    }
    const box = document.querySelector(
      '[role="checkbox"], .ctp-checkbox-label, .cb-lb label, #challenge-stage label, label.cb-lb'
    );
    if (box) {
      box.click();
      return 'box';
    }
    return null;
  }

  async function humanSolve(url, tabId) {
    const u = new URL(url);
    await chrome.tabs.update(tabId, { url: u.origin + '/' }).catch(() => undefined);
    await focusTab(tabId, true);
    injectBanner(
      tabId,
      'Aurora needs ONE click — solve the security checkbox below. It continues on its own.',
      true
    );

    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: clickTurnstileInFrame,
      }).catch(() => undefined);
    }, 3000);

    const deadline = Date.now() + 300000;
    let ticks = 0;
    while (Date.now() < deadline) {
      await sleep(2500);
      if (activeJob?.cancelled) return false;
      const probe = await tabFetch(tabId, url, { cache: 'no-store' });
      if (probe.status === 200 && !looksLikeChallenge(200, probe.text)) {
        injectBanner(tabId, 'Solved — Aurora is continuing. You can leave this alone.');
        await focusEngineAfterHandoff();
        stage('Security check passed — continuing');
        return true;
      }
      // Re-assert focus periodically; a reload can bury the window again.
      if (++ticks % 4 === 0) await focusTab(tabId, true);
    }
    return false;
  }

  /* ── animepahe API (first-party via parked tab) ────────────── */

  async function searchAnime(q) {
    const j = await fetchJson(`${BASE}/api?m=search&q=${encodeURIComponent(q)}`);
    return Array.isArray(j.data) ? j.data : [];
  }

  async function getEpisodes(session) {
    const eps = [];
    for (let p = 1; p <= 80; p++) {
      const j = await fetchJson(`${BASE}/api?m=release&id=${encodeURIComponent(session)}&sort=episode_asc&page=${p}`);
      for (const d of j.data || []) {
        eps.push({ num: Number(d.episode), session: d.session, audio: d.audio || '' });
      }
      if (!j.next_page_url) break;
    }
    eps.sort((a, b) => a.num - b.num);
    return eps;
  }

  /* ── play page parsing ─────────────────────────────────────── */

  function parsePlayLinks(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    for (const a of doc.querySelectorAll('a[href*="pahe.win"]')) {
      const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const qm = text.match(/(\d{3,4})p/i);
      const sm = text.match(/\((\d+(?:\.\d+)?)\s*(MB|GB)\)/i);
      out.push({
        href: a.href,
        group: text.split('·')[0].trim(),
        quality: qm ? qm[1] + 'p' : null,
        sizeMB: sm ? parseFloat(sm[1]) * (sm[2].toUpperCase() === 'GB' ? 1024 : 1) : null,
        dub: /\beng\b/i.test(text),
        text,
      });
    }
    return out.filter((l) => l.quality);
  }

  function pickLink(links, quality) {
    return (
      links.find((l) => !l.dub && l.quality === quality) ||
      links.find((l) => l.quality === quality) ||
      links.find((l) => !l.dub && l.quality === '720p') ||
      links[links.length - 1] ||
      null
    );
  }

  /* ── pahe.win resolution (parked tab + XHR snipe) ──────────── */

  async function tabExists(tabId) {
    try {
      await chrome.tabs.get(tabId);
      return true;
    } catch {
      return false;
    }
  }

  function probePaheDom(tabId) {
    return chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title || '';
        const body = document.body ? document.body.innerText.slice(0, 3000) : '';
        // Same as kwik: pahe.win can serve the challenge with HTTP 200 and a
        // normal title, so detect the widget rather than trusting the title.
        const hasTurnstile = !!document.querySelector(
          'iframe[src*="challenges.cloudflare.com"], .cf-turnstile, #cf-turnstile, [name="cf-turnstile-response"], #challenge-form, #challenge-stage'
        );
        return {
          host: location.hostname,
          challenged:
            hasTurnstile ||
            /just a moment|checking your browser|verify you are human|needs to review the security/i.test(title + ' ' + body),
          hasTurnstile,
          kwikHref: (() => {
            const a = document.querySelector('a.redirect[href]');
            return a && /kwik\./.test(a.href || '') ? a.href : null;
          })(),
        };
      },
    }).then(([r]) => r?.result ?? null).catch(async () => {
      if (await tabExists(tabId)) return { navigating: true };
      return { gone: true };
    });
  }

  async function resolveKwik(paheUrl) {
    const u = new URL(paheUrl);
    const host = u.hostname;
    let tabId = workTabs.get(host);
    if (tabId !== undefined) {
      try {
        await chrome.tabs.get(tabId);
      } catch {
        tabId = undefined;
        workTabs.delete(host);
      }
    }
    if (tabId === undefined) {
      const tab = await createWorkTab(`https://${host}/`);
      tabId = tab.id;
      workTabs.set(host, tabId);
      injectBanner(tabId, 'Aurora is controlling this tab — no action needed');
      await waitTabComplete(tabId);
    }

    const extractViaXhr = async () => {
      const html = await tabFetch(tabId, paheUrl, { cache: 'no-store' });
      if (html.status === 429) {
        await sleep(4000);
        return null;
      }
      if (html.status === 0) return null;
      const m = html.text && html.text.match(/https?:\/\/kwik\.cx\/[ef]\/([A-Za-z0-9]+)/);
      return m ? `https://kwik.cx/f/${m[1]}` : null;
    };

    const quick = await extractViaXhr();
    if (quick) return quick;

    stage('Security check on pahe.win — bringing the tab to you');
    await chrome.tabs.update(tabId, { url: paheUrl }).catch(() => undefined);
    await waitTabComplete(tabId);
    injectBanner(
      tabId,
      'Aurora needs ONE click — solve the checkbox below, then leave this tab alone.',
      true
    );
    await focusTab(tabId, true);
    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: clickTurnstileInFrame,
      }).catch(() => undefined);
    }, 2500);

    let handedOff = true;
    let recreations = 0;
    let waited = 0;
    for (let i = 0; i < 150; i++) {
      if (activeJob?.cancelled) throw new Error('Cancelled');
      const probe = await probePaheDom(tabId);
      if (probe?.navigating) {
        await waitTabComplete(tabId);
        continue;
      }
      if (probe?.gone) {
        recreations++;
        if (recreations > 3) throw new Error('The pahe.win tab keeps getting closed');
        const tab = await createWorkTab(paheUrl);
        tabId = tab.id;
        workTabs.set(host, tabId);
        handedOff = true;
        await waitTabComplete(tabId);
        await focusTab(tabId, true);
        continue;
      }
      if (probe?.challenged) {
        // Keep the window in front while they solve it.
        if (++waited % 3 === 0) await focusTab(tabId, true);
        await sleep(2000);
        continue;
      }
      if (probe?.host && probe.host !== host) {
        await waitTabComplete(tabId);
        const recheck = await probePaheDom(tabId);
        if (recheck?.host && recheck.host !== host && !recheck.challenged) {
          await chrome.tabs.update(tabId, { url: paheUrl }).catch(() => undefined);
          injectBanner(tabId, 'Aurora is controlling this tab — no action needed');
          await waitTabComplete(tabId);
        }
        continue;
      }
      if (handedOff) {
        handedOff = false;
        stage('Security check passed — continuing');
        injectBanner(tabId, 'Solved — Aurora is continuing. You can leave this alone.');
        await focusAuroraBack();
      }
      const kwik = await extractViaXhr();
      if (kwik) {
        await chrome.tabs.update(tabId, { url: `https://${host}/` }).catch(() => undefined);
        return kwik;
      }
      if (probe?.kwikHref) {
        await chrome.tabs.update(tabId, { url: `https://${host}/` }).catch(() => undefined);
        return probe.kwikHref;
      }
      await sleep(800);
    }
    throw new Error('Could not find the download link on the redirect page');
  }

  /* ── kwik work tab ─────────────────────────────────────────── */

  function probeKwikDom(tabId) {
    return chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title || '';
        const body = document.body ? document.body.innerText.slice(0, 3000) : '';
        // kwik serves its challenge with HTTP 200 and no "Just a moment" title,
        // so title-only detection misses it. Look for the widget itself.
        const hasTurnstile = !!document.querySelector(
          'iframe[src*="challenges.cloudflare.com"], .cf-turnstile, #cf-turnstile, [name="cf-turnstile-response"], #challenge-form, #challenge-stage'
        );
        const challengeText = /just a moment|checking your browser|verify you are human|needs to review the security/i.test(
          title + ' ' + body
        );
        return {
          host: location.hostname,
          challenged: hasTurnstile || challengeText,
          hasTurnstile,
          action: (() => {
            const f = document.querySelector('form[action*="/d/"]');
            return f ? f.action : null;
          })(),
          token: (() => {
            const i = document.querySelector('form[action*="/d/"] input[name="_token"]');
            return i ? i.value : null;
          })(),
          title,
        };
      },
    }).then(([r]) => r?.result ?? null).catch(async () => {
      if (await tabExists(tabId)) return { navigating: true };
      return { gone: true };
    });
  }

  function tabFetchFormPost(tabId, url, token) {
    return chrome.scripting.executeScript({
      target: { tabId },
      func: async (u, t) => {
        try {
          await fetch(u, {
            method: 'POST',
            credentials: 'include',
            redirect: 'manual',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ _token: t }).toString(),
          });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: String((e && e.message) || e) };
        }
      },
      args: [url, token],
    }).then(([r]) => r?.result || { ok: false }).catch(() => ({ ok: false }));
  }

  async function extractKwikForm(kwikUrl) {
    if (kwikTabId !== null) {
      try {
        await chrome.tabs.get(kwikTabId);
        await chrome.tabs.update(kwikTabId, { url: kwikUrl }).catch(() => undefined);
      } catch {
        const tab = await createWorkTab(kwikUrl);
        kwikTabId = tab.id;
      }
    } else {
      const tab = await createWorkTab(kwikUrl);
      kwikTabId = tab.id;
    }
    const tabId = kwikTabId;
    injectBanner(tabId, 'Aurora is controlling this tab — no action needed');

    await waitTabComplete(tabId);
    let handedOff = false;
    for (let i = 0; i < 90; i++) {
      if (activeJob?.cancelled) throw new Error('Cancelled');
      const probe = await probeKwikDom(tabId);
      if (probe?.navigating) {
        await waitTabComplete(tabId);
        continue;
      }
      if (probe?.gone) {
        throw new Error('Download tab was closed — it will reopen for the next episode');
      }
      if (probe?.host && probe.host !== 'kwik.cx') {
        await waitTabComplete(tabId);
        const recheck = await probeKwikDom(tabId);
        if (recheck?.host && recheck.host !== 'kwik.cx' && !recheck.challenged) {
          await chrome.tabs.update(tabId, { url: kwikUrl }).catch(() => undefined);
          injectBanner(tabId, 'Aurora is controlling this tab — no action needed');
          await waitTabComplete(tabId);
        }
        continue;
      }
      if (probe?.challenged) {
        if (!handedOff) {
          stage('Security check on kwik — bringing the tab to you');
          // Force the window forward, then try the auto-click. If the widget
          // yields to a synthetic click the user never has to touch it; if not,
          // the tab is already in front of them with a pulsing banner.
          await focusTab(tabId, true);
          injectBanner(
            tabId,
            'Aurora needs ONE click — solve the checkbox below, then leave this tab alone. It continues on its own.',
            true
          );
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId, allFrames: true },
              func: clickTurnstileInFrame,
            }).catch(() => undefined);
          }, 2500);
          handedOff = true;
        } else {
          // Keep it in front — some pages steal focus back on reload.
          await focusTab(tabId, true);
        }
        await sleep(2500);
        continue;
      }
      if (handedOff) {
        handedOff = false;
        stage('Security check passed — continuing');
        injectBanner(tabId, 'Solved — Aurora is continuing. You can leave this alone.');
        await focusEngineAfterHandoff();
      }
      if (probe?.token && probe?.action) {
        const captureP = captureRedirect(['https://kwik.cx/d/*']);
        await tabFetchFormPost(tabId, probe.action, probe.token);
        const cdnUrl = await captureP;
        await chrome.tabs.update(tabId, { url: 'about:blank' }).catch(() => undefined);
        return {
          action: probe.action,
          token: probe.token,
          filename: (probe.title || '').replace(/\s*::\s*Kwik\s*$/i, '').trim(),
          cdnUrl,
        };
      }
      await sleep(500);
    }
    throw new Error('The download form did not appear in time');
  }

  /* ── capture final CDN URL from the kwik POST redirect ─────── */

  function captureRedirect(captureUrls) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (url) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          chrome.webRequest.onBeforeRedirect.removeListener(onRedirect);
          chrome.webRequest.onResponseStarted.removeListener(onStarted);
          chrome.webRequest.onCompleted.removeListener(onCompleted);
        } catch {}
        resolve(url);
      };
      const extract = (details) => {
        const loc = (details.responseHeaders || []).find((h) => h.name.toLowerCase() === 'location');
        if (loc && loc.value) finish(loc.value);
      };
      const onRedirect = (details) => {
        if (details.redirectUrl && !details.redirectUrl.startsWith('data:')) finish(details.redirectUrl);
        else extract(details);
      };
      const onStarted = extract;
      const onCompleted = extract;
      const timer = setTimeout(() => finish(null), 30000);
      try {
        chrome.webRequest.onBeforeRedirect.addListener(onRedirect, { urls: captureUrls }, ['responseHeaders']);
        chrome.webRequest.onResponseStarted.addListener(onStarted, { urls: captureUrls }, ['responseHeaders']);
        chrome.webRequest.onCompleted.addListener(onCompleted, { urls: captureUrls }, ['responseHeaders']);
      } catch {
        finish(null);
      }
    });
  }

  async function setRefererRule(hostname) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [REFERRER_RULE_ID],
        addRules: [{
          id: REFERRER_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://kwik.cx/' }],
          },
          condition: { requestDomains: [hostname], resourceTypes: ['xmlhttprequest'] },
        }],
      });
    } catch {}
  }

  async function clearRefererRule() {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [REFERRER_RULE_ID] });
    } catch {}
  }

  /* ── episode processing ────────────────────────────────────── */

  async function processEpisode(payload, signal) {
    stage('Resolving...');
    await sleep(350);

    const results = await searchAnime(payload.animeTitle);
    const hit = results[0];
    if (!hit?.session) throw new Error(`"${payload.animeTitle}" not found on the source`);

    stage('Finding episode...');
    const eps = await getEpisodes(hit.session);
    const ep = eps.find((e) => e.num === Number(payload.episodeNumber));
    if (!ep) throw new Error(`Episode ${payload.episodeNumber} not found`);

    stage('Reading quality options...');
    const playHtml = await fetchText(`${BASE}/play/${hit.session}/${ep.session}`);
    const links = parsePlayLinks(playHtml);
    if (!links.length) throw new Error('No download links found on the episode page');

    const chosen = pickLink(links, payload.quality || '720p');
    if (!chosen) throw new Error('No download links found on the episode page');

    stage(`Fetching ${chosen.quality} link...`);
    const kwikUrl = await resolveKwik(chosen.href);

    stage('Starting download...');
    const info = await extractKwikForm(kwikUrl);
    if (!info || !info.token) throw new Error('Could not read the download form');

    let filename = info.filename || `${payload.animeTitle} - Ep ${padNum(ep.num)} ${chosen.quality}`.replace(/\s+/g, '_') + '.mp4';
    if (!/\.[a-z0-9]{2,4}$/i.test(filename)) filename += '.mp4';

    let res = null;
    if (info.cdnUrl) {
      await setRefererRule(new URL(info.cdnUrl).hostname);
      try {
        const r = await fetch(info.cdnUrl, { credentials: 'omit', signal });
        if (r.ok && r.body) res = r;
      } catch {
        if (signal.aborted) throw new Error('Cancelled');
      }
    }

    if (!res) {
      try {
        const r = await fetch(info.action, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ _token: info.token }).toString(),
          signal,
        });
        if (r.ok && r.body) res = r;
      } catch {
        if (signal.aborted) throw new Error('Cancelled');
      }
    }

    if (!res || !res.ok || !res.body) throw new Error('Could not start the download stream');

    const disp = res.headers.get('content-disposition') || '';
    const dm = disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (dm && dm[1]) filename = decodeURIComponent(dm[1]);

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
        const pct = total ? Math.round((received / total) * 100) : 0;
        stage(`Downloading... ${total ? pct + '% — ' : ''}${(received / 1048576).toFixed(0)}MB`);
        await sendChunk(toB64(merged), received, total, false, filename);
      }
    }
    if (pending.length) {
      const merged = new Uint8Array(pendingBytes);
      let off = 0;
      for (const p of pending) {
        merged.set(p, off);
        off += p.byteLength;
      }
      await sendChunk(toB64(merged), received, total, true, filename);
    } else {
      await sendChunk('', received, total, true, filename);
    }

    await clearRefererRule();
    return { bytes: received, filename };
  }

  /* ── source inspection (no download — just list what's available) ── */

  async function inspect(payload) {
    const results = await searchAnime(payload.animeTitle);
    const hit = results[0];
    if (!hit?.session) throw new Error(`"${payload.animeTitle}" not found on the source`);

    const eps = await getEpisodes(hit.session);
    const ep = eps.find((e) => e.num === Number(payload.episodeNumber));
    if (!ep) throw new Error(`Episode ${payload.episodeNumber} not found`);

    const playHtml = await fetchText(`${BASE}/play/${hit.session}/${ep.session}`);
    const links = parsePlayLinks(playHtml);
    if (!links.length) throw new Error('No download sources found for this episode');

    // de-duplicate by quality+group+audio, keep the first of each
    const seen = new Set();
    const sources = [];
    for (const l of links) {
      const key = `${l.quality}|${l.group}|${l.dub ? 'dub' : 'sub'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        quality: l.quality,
        group: l.group,
        sizeMB: l.sizeMB,
        audio: l.dub ? 'dub' : 'sub',
      });
    }

    // highest quality first, sub before dub
    const qNum = (q) => parseInt(q, 10) || 0;
    sources.sort((a, b) => qNum(b.quality) - qNum(a.quality) || (a.audio === b.audio ? 0 : a.audio === 'sub' ? -1 : 1));

    return { title: hit.title || payload.animeTitle, episode: ep.num, sources };
  }

  /* ── job orchestration ─────────────────────────────────────── */

  function run(payload, sourceTabId) {
    if (activeJob && !activeJob.finished) {
      return Promise.resolve({ ok: false, error: 'A download is already running' });
    }
    auroraTab = sourceTabId;

    const controller = new AbortController();
    activeJob = { cancelled: false, finished: false, controller };

    (async () => {
      try {
        stage(`Opening source for "${payload.animeTitle}"...`);
        const r = await processEpisode(payload, controller.signal);
        stage(`Downloaded: ${r.filename} (${(r.bytes / 1048576).toFixed(0)}MB)`);
        chrome.runtime.sendMessage({ type: 'PROGRESS', progress: { stage: 'complete', message: `Downloaded: ${r.filename} (${(r.bytes / 1048576).toFixed(0)}MB)` } }).catch(() => undefined);
      } catch (err) {
        const msg = String((err && err.message) || err).slice(0, 220);
        chrome.runtime.sendMessage({ type: 'PROGRESS', progress: { stage: 'error', message: msg } }).catch(() => undefined);
      } finally {
        await clearRefererRule().catch(() => undefined);
        await closeWorkTabs().catch(() => undefined);
        activeJob.finished = true;
        setStatus('idle', 'Idle');
      }
    })();

    return Promise.resolve({ ok: true });
  }

  function cancel() {
    if (activeJob && !activeJob.finished) {
      activeJob.cancelled = true;
      activeJob.controller.abort();
      closeWorkTabs().catch(() => undefined);
    }
  }

  /* Fire-and-forget, like run(): ack immediately and push the result back via
     INSPECT_RESULT. Holding the sendResponse port open across the whole
     inspection lets the MV3 service worker die mid-flight, which the page sees
     as "The message port closed before a response was received." */
  function runInspect(payload) {
    if (activeJob && !activeJob.finished) {
      return Promise.resolve({ ok: false, error: 'A download is already running — try again when it finishes' });
    }

    const controller = new AbortController();
    activeJob = { cancelled: false, finished: false, controller };

    (async () => {
      let result;
      try {
        setStatus('busy', 'Inspecting sources…');
        const data = await inspect(payload);
        result = { ok: true, ...data };
      } catch (err) {
        result = { ok: false, error: String((err && err.message) || err).slice(0, 220) };
      } finally {
        await closeWorkTabs().catch(() => undefined);
        activeJob.finished = true;
        setStatus('idle', 'Idle');
      }
      chrome.runtime.sendMessage({ type: 'INSPECT_RESULT', result }).catch(() => undefined);
    })();

    return Promise.resolve({ ok: true });
  }

  return {
    run,
    runInspect,
    cancel,
    isBusy: () => activeJob && !activeJob.finished,
  };
})();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'PIPE_RUN') {
    Pipeline.run(msg.payload || {}, sender.tab?.id ?? null).then(sendResponse);
    return true;
  }
  if (msg.type === 'PIPE_INSPECT') {
    Pipeline.runInspect(msg.payload || {}).then(sendResponse);
    return true;
  }
  if (msg.type === 'PIPE_BUSY') {
    sendResponse({ busy: Pipeline.isBusy() });
    return;
  }
  if (msg.type === 'PIPE_CANCEL') {
    Pipeline.cancel();
    sendResponse({ ok: true });
    return;
  }
});
