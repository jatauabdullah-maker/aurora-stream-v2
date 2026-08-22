# Aurora Stream

A premium, installable anime streaming PWA — Netflix-grade UI with watch progress, a
watchlist, episode downloads for offline viewing, and a demo catalog that works out
of the box with public-domain films.

> Aurora is a **personal media interface**. It ships with no content source. Plug in
> your own licensed backend via `VITE_API_BASE_URL` — you're responsible for the
> sources you connect.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

No `.env` needed for the demo — with an empty `VITE_API_BASE_URL` the app serves a
built-in demo catalog (Blender Foundation open movies + placeholder art) so every
feature works: browsing, search, player, continue-watching, downloads, PWA install.

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

- Hero carousel, trending/popular/recent rows, continue-watching rail
- Search with genre/year/status filters (URL-backed, shareable)
- Anime details: expandable seasons, episode list, watch state, bulk "Download All"
- Plyr-based player: quality selector, subtitles, resume position, autoplay-next
- Download engine: queue, pause/resume, concurrent limits, storage meter, IndexedDB blobs
- Library: watchlist, continue watching, history tabs
- Settings: preferred quality, autoplay, concurrent downloads, subtitle merge flag
- PWA: installable, offline shell, image caching, install prompt
- Fully responsive: bottom nav on mobile, top nav on desktop

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
| `GET /search?q=&genre=&year=&status=` | `AnimeSummary[]` or `{ items, page, totalPages }` |
| `GET /genres` | `string[]` |
| `GET /anime/:id` | `AnimeDetails` (includes `episodes: Episode[]`) |
| `GET /anime/:id/episodes` | `Episode[]` |
| `GET /stream/:episodeId` | `{ sources: [{url, quality, type?, sizeMB?}], subtitles: [{url, lang, label, default?}] }` |

Type shapes are in `src/types/index.ts`. The mapping layer lives in
`src/services/api.ts` — adapt it to whatever your source actually returns. If your
backend is unreachable, the app transparently falls back to the demo catalog.

## Project structure

```
src/
  components/
    anime/     AnimeCard, AnimeGrid, AnimeRow
    common/    Icons, Skeletons, InstallPrompt, PageWrapper
    home/      HeroCarousel, ContinueWatchingRow
    layout/    Header, Footer, MobileNav
    player/    VideoPlayer (Plyr wrapper)
  context/     AppContext (settings, watchlist, progress)
  data/        mock.ts (demo catalog)
  hooks/       usePlayer (progress tracking), useDownloads, usePWA
  pages/       Home, Search, AnimeDetails, Watch, Downloads, Library, Settings
  services/    api.ts, storage.ts (localStorage), idb.ts (IndexedDB), downloads.ts (queue engine)
  utils/       helpers
  types/       TypeScript contracts
```

## Roadmap ideas

- Code-splitting (bundle currently ~590 kB — lazy-load routes/player to shrink)
- MAL/AniList list sync (AniList GraphQL is free, no key needed)
- Watch-together rooms via WebSocket (the Go server in the StrawVerse repo you
  have is content-agnostic and can be reused as-is)
- Capacitor wrapper → native Android/iOS shell reusing this exact codebase
