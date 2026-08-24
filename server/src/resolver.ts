import type { ResolveRequest, ResolveProgress, EpisodeResult, ResolverContext } from './types.js';
import { withPage } from './browser.js';
import { solveTurnstile } from './turnstile.js';
import { askBrain } from './mistral.js';
import { cacheGet, cacheSet } from './cache.js';
import { getSources } from './sources/index.js';

export async function resolveEpisode(
  request: ResolveRequest,
  onProgress: (p: ResolveProgress) => void
): Promise<EpisodeResult> {
  const quality = request.preferredQuality ?? '720p';

  const cached = cacheGet(request.animeTitle, request.episodeNumber, quality);
  if (cached) {
    onProgress({
      stage: 'complete',
      message: `Ready: ${quality} (cached)`,
      animeTitle: request.animeTitle,
      episodeNumber: request.episodeNumber,
    });
    return {
      episodeNumber: request.episodeNumber,
      success: true,
      sources: cached.sources,
      availableQualities: cached.availableQualities,
      fromCache: true,
    };
  }

  const log = (msg: string) =>
    console.log(
      `[${new Date().toISOString()}] [resolve] "${request.animeTitle}" EP${request.episodeNumber}: ${msg}`
    );

  return withPage(async (page) => {
    const ctx: ResolverContext = { page, solveTurnstile, askBrain, log };

    let lastError = 'All sources failed';
    for (const source of getSources()) {
      try {
        log(`trying source: ${source.name}`);
        const result = await source.resolve(ctx, request, onProgress);
        if (result.success && result.sources?.length) {
          cacheSet(
            request.animeTitle,
            request.episodeNumber,
            quality,
            result.sources,
            result.availableQualities ?? []
          );
          log(`resolved via ${source.name}: ${result.sources[0].url.slice(0, 80)}`);
          return result;
        }
        lastError = result.error ?? lastError;
        log(`source ${source.name} failed: ${result.error}`);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        log(`source ${source.name} crashed: ${lastError}`);
      }
    }

    return { episodeNumber: request.episodeNumber, success: false, error: lastError };
  });
}
