# Aurora Stream

A premium, installable anime streaming PWA — Netflix-grade UI with watch progress, a watchlist, **real episode downloads for offline viewing**, and an AniList-powered catalog that works out of the box (no API key needed).

> Aurora is a **personal media interface**. It ships with AniList for metadata (trending, search, details). Streaming comes from embed sources; downloads run through the **Aurora Downloader** browser extension — entirely on the user's own machine, no servers involved.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

No `.env` needed — with an empty `VITE_API_BASE_URL` the app uses **AniList** for all catalog data and **embed sources** for streaming.

```bash
npm run build      # production build → dist/ (PWA + service worker included)
npm run preview    # serve the production build locally
```

## Downloads — the Aurora Downloader extension

Downloads are powered by a companion Chrome extension (`extension/aurora-downloader/`, **v2.0+**). Everything runs locally in the user's browser: their IP, their cookies, no servers, no rate-limit pain.

### How it works

```
Aurora (Vercel PWA)
   │  click Download → quality picker → progress banner
   ▼
Aurora Downloader extension (hidden engine page + minimized work tabs)
   1. animepahe search API          (first-party fetch from a parked tab)
   2. release API → episode session
   3. play page HTML → quality links (Group · 720p (138MB))
   4. pahe.win XHR snipe → kwik link (no countdown waits)
   5. kwik tab → form + _token → POST → webRequest captures CDN URL
   6. DNR rule sets Referer: kwik.cx → CDN stream
   ▼
Streamed in chunks back into Aurora → IndexedDB → offline playback in the app player
```

- **Cloudflare Turnstile**: never auto-bypassed. Each protected domain (animepahe, pahe.win, kwik) needs **one trusted click, once** — the clearance cookie then lasts ~a year and every later download is fully invisible. The tab comes forward with a banner when a click is needed and hides again after.
- **Anti-ad / anti-hijack**: all site requests run inside parked per-host tabs in a minimized window (first-party cookie context). Work tabs self-heal from ad redirects and park on safe pages when idle.
- **Rate limits**: sequential episodes with pacing, HTTP 429 backoff honoring `Retry-After`.

### Install (end users)

1. Aurora → **Settings → Downloads** → download the ZIP
2. Unzip → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the folder
3. Back in Aurora → **Re-check** → download anything

Works on Chrome/Edge/Brave (desktop). Device MP4s listed on the Downloads page can be played **inside Aurora's player** via the File System Access API (the file handle is remembered).

## Repo layout

| Path | What it is |
|---|---|
| `src/` | Aurora PWA (React + Vite + Tailwind). Catalog/streaming/downloads UI. |
| `extension/aurora-downloader/` | The download engine extension (MV3). `background.js` = message router; `pipeline.js` + `pipeline.html` = hidden engine page; `bridge.js` = Aurora page bridge. |
| `public/aurora-downloader.zip` | The packaged extension served by the app (Settings → Downloads). **Rebuild after changing the extension**: `Compress-Archive extension/aurora-downloader/* → public/aurora-downloader.zip`. |
| `server/` | Optional standalone resolver service (Render). **Not required** — the extension replaced it. Kept for reference/future use. |

## Streaming

Streaming uses embed sources keyed by AniList ID (`al-<id>-e<num>`) — untouched by the download system. Downloads and streaming are fully independent.

## PWA

Installable on desktop and Android. Downloaded episodes live in IndexedDB and play back offline inside the app's player.

## Scripts

```bash
npm run dev        # dev server
npm run build      # typecheck + production build
npm run lint       # oxlint
```

Server (optional): `cd server && npm install && npm run build && npm start`

## Notes

- Bump `extension/aurora-downloader/manifest.json` version on every extension change so testers can verify they're running new code.
- After changing the extension: re-zip into `public/` and reload it in `chrome://extensions`.
- The extension is sideloaded (Load unpacked). Chrome 137+ ignores `--load-extension`, so automated tests must use Playwright's bundled Chromium.
