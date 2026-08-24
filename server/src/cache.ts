import type { StreamSource } from './types.js';

interface CacheEntry {
  sources: StreamSource[];
  availableQualities: string[];
  expiresAt: number;
}

const TTL_MS = (() => {
  const min = parseInt(process.env.CACHE_TTL_MINUTES || '45', 10);
  return Math.max(30, Math.min(90, min)) * 60 * 1000;
})();

const store = new Map<string, CacheEntry>();

function key(animeTitle: string, episodeNumber: number, quality: string): string {
  return `${animeTitle.toLowerCase().trim()}::${episodeNumber}::${quality}`;
}

export function cacheGet(
  animeTitle: string,
  episodeNumber: number,
  quality: string
): { sources: StreamSource[]; availableQualities: string[] } | null {
  const entry = store.get(key(animeTitle, episodeNumber, quality));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key(animeTitle, episodeNumber, quality));
    return null;
  }
  return { sources: entry.sources, availableQualities: entry.availableQualities };
}

export function cacheSet(
  animeTitle: string,
  episodeNumber: number,
  quality: string,
  sources: StreamSource[],
  availableQualities: string[]
): void {
  store.set(key(animeTitle, episodeNumber, quality), {
    sources,
    availableQualities,
    expiresAt: Date.now() + TTL_MS,
  });
  prune();
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now > v.expiresAt) store.delete(k);
  }
}

export function cacheSize(): number {
  prune();
  return store.size;
}
