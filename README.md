# Aurora Stream

A premium, installable anime streaming PWA — Netflix-grade UI with watch progress, a watchlist, episode downloads for offline viewing, and **AniList-powered catalog** that works out of the box (no API key needed).

> Aurora is a **personal media interface**. It ships with AniList for metadata (trending, search, details). Stream sources come from embed fallbacks or your own backend via `VITE_API_BASE_URL` — you're responsible for the sources you connect.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

No `.env` needed — with an empty `VITE_API_BASE_URL` the app uses **AniList** for all catalog data (trending, popular, new releases, search, genres, anime details, episodes) and **embed sources** for streaming. Every feature works: browsing, search, player, continue-watching, downloads, PWA install.

```bash
npm run build      # production build → dist/ (PWA + service worker included)
npm run preview    # serve the production build locally
```

## Install as an app (PWA)

1. Run `npm run build && npm run preview` (or deploy `dist/` anywhere static).
2. Open in Chrome/Edge (desktop or Android) — an install banner appears after ~5s.
3. Or: browser menu → "Install app" / "Add to Home Screen".

Downloaded episodes are stored in IndexedDB — they play back offline inside the app.

## Features

- **Home**: Hero carousel, trending/popular/new releases rows, continue-watching rail, just-aired rail
- **Search**: URL-backed with genre/year/status filters (shareable links)
- **Anime Details**: Expandable seasons, episode list, watch state, bulk "Download All", related anime
- **Player (Plyr)**: Quality selector, subtitles, resume position, autoplay-next, trailer fallback
- **Download Engine**: Queue, pause/resume, concurrent limits (1-4), storage meter, IndexedDB blobs
- **Library**: Watchlist, continue watching, history tabs
- **Settings**: Preferred quality, autoplay, concurrent downloads, subtitle merge flag
- **PWA**: Installable, offline shell, image caching, install prompt
- **Responsive**: Bottom nav on mobile, top nav on desktop, RTL-ready

## Architecture

| Layer | Source | Notes |
|-------|--------|-------|
| **Catalog / Search / Details / Episodes** | **AniList** (GraphQL) | Free, legal, no key. `src/services/anilist.ts` |
| **Stream sources** | **Your backend** (`VITE_API_BASE_URL`) **or** embed fallbacks | Embeds: `tryembed.us.cc` (sub/dub). See `src/services/api.ts` |
| **Persistence** | localStorage + IndexedDB | Settings, watchlist, progress, downloads |

**Data flow**:
1. App loads → `api.ts` checks `VITE_API_BASE_URL`
2. If set: calls your backend for catalog + streams
3. If empty: uses AniList for catalog, embeds for streams
4. Backend can override any endpoint; AniList is always the fallback

## Connecting your own content source

Create `.env.local`:

```
VITE_API_BASE_URL=https://your-backend.example.com
```

Implement these endpoints on your backend (JSON):

| Endpoint | Returns |
|---|---|
| `GET /trending` | `AnimeSummary[]` |
| `GET /popular` | `AnimeSummary[]` |
| `GET /recent` | `AnimeSummary[]` |
| `GET /search?q=&genre=&year=&status=&page=` | `{ items: AnimeSummary[]; page: number; totalPages: number }` |
| `GET /genres` | `string[]` |
| `GET /anime/:id` | `AnimeDetails` (includes `episodes: Episode[]`) |
| `GET /anime/:id/episodes` | `Episode[]` |
| `GET /stream/:episodeId` | `{ sources: [{url, quality, type?, sizeMB?}], subtitles: [{url, lang, label, default?}] }` |
| `GET /session` (optional) | `{ ok: true }` for auth-gated sources |

Type shapes are in `src/types/index.ts`. The mapping layer lives in `src/services/api.ts` — adapt it to whatever your source actually returns. If your backend is unreachable, the app transparently falls back to AniList + embeds.

## Project structure

```
src/
  components/
    anime/     AnimeCard, AnimeGrid, AnimeRow
    common/    Icons, Skeletons, InstallPrompt, PageWrapper
    home/      HeroCarousel, ContinueWatchingRow
    layout/    Header, Footer, MobileNav
    player/    VideoPlayer (Plyr wrapper)
  context/     AppContext (settings, watchlist, progress, history)
  data/        mock.ts (legacy demo catalog, unused)
  hooks/       usePlayer (progress tracking), useDownloads, usePWA
  pages/       Home, Search, AnimeDetails, Watch, Downloads, Library, Settings
  services/
    api.ts         Main facade (AniList + backend + embeds)
    anilist.ts     Full AniList GraphQL client + mappers
    downloads.ts   Download engine (queue, concurrency, IndexedDB)
    idb.ts         IndexedDB wrapper
    storage.ts     localStorage helpers
  types/       TypeScript contracts
  utils/       helpers (formatTime, cn, etc.)
```

## Key files to know

- `src/services/anilist.ts` — All AniList queries, mappers, related/airing logic
- `src/services/api.ts` — Unified API facade with backend-first / AniList-fallback strategy
- `src/services/downloads.ts` — Download engine with pause/resume/concurrency
- `src/context/AppContext.tsx` — Global state (settings, watchlist, progress)
- `vite.config.ts` — PWA config (Workbox, manifest, image caching)

## Tech stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** (via `@tailwindcss/vite`)
- **React Router 7** (file-based routing not used; manual routes)
- **Plyr** for video player
- **Framer Motion** for animations
- **Axios** for HTTP
- **oxlint** for fast linting
- **vite-plugin-pwa** (Workbox) for service worker + manifest

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (port 5173) |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | Run oxlint |

## Deployment

Any static host works (Vercel, Netlify, Cloudflare Pages, GitHub Pages, nginx, Caddy). The `dist/` folder is self-contained with the service worker.

```bash
npm run build
# deploy dist/
```

For Vite's `base` config, the app assumes root (`/`). If deploying to a subpath, set `base: '/your-path/'` in `vite.config.ts` and rebuild.

## License

MIT — use freely for personal projects. Respect content licensing.