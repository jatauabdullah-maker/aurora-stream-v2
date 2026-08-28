# Aurora Stream

A premium, installable anime streaming PWA — polished UI, watch progress, a
watchlist, **real episode downloads for offline viewing**, and an AniList-powered
catalog that works with no API key.

**Live:** https://aurora-anime.vercel.app

> Aurora is a **personal media interface**. Catalog metadata comes from AniList,
> streaming from embed sources, and downloads run through the **Aurora
> Downloader** browser extension — entirely on your own machine, no servers.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

No `.env` needed. With an empty `VITE_API_BASE_URL` the app uses AniList for the
catalog and embed sources for streaming.

```bash
npm run build      # typecheck + production build -> dist/ (PWA + service worker)
npm run preview    # serve the production build on :4173
npm run lint       # oxlint
```

### Extension helpers

```bash
npm run ext:check  # syntax-check the extension JS (not covered by the app build)
npm run ext:zip    # repackage public/aurora-downloader.zip after editing it
```

---

## Deploying

> **Pushing to GitHub does not deploy.** The Vercel project has no Git
> integration, so deploys are manual.

```bash
npm run build
npx vercel deploy --prod --yes --token <VERCEL_TOKEN>
```

Look for `Aliased https://aurora-anime.vercel.app` in the output — without that
line the production domain was not updated.

Agents: see `AURORA-AGENT-HANDBOOK.md` (kept outside the repo, in `Downloads`)
for credentials, the burner git identity, and the full pre-ship checklist.

---

## Repo layout

| Path | What it is |
|---|---|
| `src/` | The PWA — React 19 + Vite 8 + Tailwind 4 |
| `src/pages/` | Home, Search, AnimeDetails, Watch, Downloads, Library, Settings |
| `src/components/` | `layout/`, `anime/`, `home/`, `player/`, `common/` |
| `src/services/` | AniList, catalog API, download engine, extension bridge, IndexedDB, storage |
| `src/index.css` | Design system — aurora background, glass, shimmer, card hover |
| `extension/aurora-downloader/` | The MV3 download extension (see below) |
| `public/aurora-downloader.zip` | Packaged extension served from Settings. Rebuild with `npm run ext:zip` |
| `server/` | **Unused.** Old standalone resolver, replaced by the extension. Kept for reference |

### Design tokens

Violet `#a678ff` / `#6b46ff`, cyan accent `#4cc3f0`, near-black `#0b0e1a`. Inter
for body, Space Grotesk for headings. Reusable classes: `.glass`, `.card-ring`,
`.btn-shimmer`, `.text-gradient`, `.aurora-bg`, `.wind-streaks`.

Two CSS rules that look redundant but are not:

- In `.glass`, `-webkit-backdrop-filter` must come **before** the unprefixed
  `backdrop-filter`, or the minifier drops the unprefixed one and the blur
  silently stops working in production.
- `.plyr--video` and its wrapper are pinned to `height: 100%`. Without it the
  `<video>` has no intrinsic size before metadata loads, the wrapper collapses,
  and the play button sits high in the frame until playback starts.

---

## Downloads — the Aurora Downloader extension

A companion Chrome extension (MV3, `extension/aurora-downloader/`). Everything
runs locally: your browser, your IP, your cookies, no servers.

```
Aurora (PWA)
   │  Download -> inspect sources -> pick quality -> progress
   ▼
Extension: hidden engine page + minimized per-host work tabs
   1. animepahe search API           (first-party fetch from a parked tab)
   2. release API -> episode session
   3. play page HTML -> quality links (Group · 720p (138MB))
   4. pahe.win XHR snipe -> kwik link (no countdown wait)
   5. kwik tab -> form + _token -> POST -> webRequest captures the CDN URL
   6. DNR rule sets Referer: kwik.cx -> stream the MP4
   ▼
Chunked back into Aurora -> IndexedDB -> offline playback in the app player
```

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker — message router only |
| `bridge.js` | Content script on the Aurora origin; `postMessage` <-> `chrome.runtime` |
| `pipeline.html` | Branded engine page with live status and guidance |
| `pipeline.js` | The download + inspection engine |

The engine is a **page**, not the service worker: MV3 workers are short-lived and
have no `DOMParser`.

### Two rules if you touch the extension

**1. Never hold `sendResponse` open across a long operation.** The service worker
gets torn down mid-await and the page sees *"The message port closed before a
response was received."* Ack immediately, then push the result back as its own
message — `DOWNLOAD`, `INSPECT`, `PROGRESS` and `CHUNK` all work this way.

**2. Challenge handoff is order-sensitive.** Chrome ignores `focused: true` if it
arrives in the same call that is still un-minimizing the window, so the state
change must land first, then focus, then tab activation. Also: never detect a
challenge by page **title** — kwik and pahe.win both serve challenges with HTTP
200 and an ordinary title. Detect the Turnstile widget itself.

### Install (end users)

1. Aurora → **Settings → Downloads** → download the ZIP
2. Unzip → `chrome://extensions` → enable **Developer mode** → **Load unpacked**
3. Back in Aurora → **Re-check**

Chrome, Edge and Brave on desktop. Cloudflare protection is never auto-bypassed:
each protected domain needs **one trusted click, once**, then the clearance
cookie lasts about a year. Aurora brings the tab forward when a click is needed
and returns you to the engine page afterwards.

Device MP4s listed on the Downloads page play **inside Aurora's player** via the
File System Access API, and the file handle is remembered.

---

## Streaming

Embed sources keyed by AniList ID (`al-<id>-e<num>`). Completely independent of
the download system.

## PWA

Installable on desktop and Android. Downloaded episodes live in IndexedDB and
play back offline in the app's own player.

---

## Known constraints

- **Downloads are desktop-only** — they need the extension. Mobile shows an
  explanation at every download entry point; that copy is deliberate, don't
  replace it by hiding the buttons.
- **Main JS bundle is ~630 KB.** Vite warns. Not addressed; code-splitting would
  fix it.
- **Extension toolbar icons** are upscaled copies of the 192px PWA icon, so they
  look slightly soft. Real 48/128 exports would be better.
- **No test suite.** Verification is: build passes, lint clean, then check the
  pages at desktop and mobile widths.
- Bump `manifest.json` version on every extension change so testers can confirm
  they are running new code.
