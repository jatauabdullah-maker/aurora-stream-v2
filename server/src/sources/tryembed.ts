import type { Page } from 'patchright';
import { openSync, appendFileSync, closeSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SourceAdapter, ResolveRequest, ResolveProgress, StreamSource, Quality } from '../types.js';
import { safeGoto, DOWNLOADS_DIR } from '../browser.js';

const EMBED_BASE = 'https://tryembed.us.cc';

function emit(
  onProgress: (p: ResolveProgress) => void,
  stage: ResolveProgress['stage'],
  message: string,
  req: ResolveRequest
) {
  onProgress({ stage, message, animeTitle: req.animeTitle, episodeNumber: req.episodeNumber });
}

async function capturePlaylistUrl(page: Page, embedUrl: string, timeoutMs = 25000): Promise<string | null> {
  const found: string[] = [];
  const listener = (req: { url(): string }) => {
    const u = req.url();
    if (/\.m3u8/i.test(u) && !found.includes(u)) found.push(u);
  };
  page.on('request', listener);
  try {
    if (!(await safeGoto(page, embedUrl))) return null;
    await page.waitForTimeout(4000);
    await page
      .evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null;
        if (v) v.play().catch(() => undefined);
        const btn = document.querySelector('.plyr__control--overlaid, .jw-display-icon-container, [class*="play"]');
        if (btn) (btn as HTMLElement).click();
      })
      .catch(() => undefined);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && found.length === 0) {
      await page.waitForTimeout(1000);
    }
    if (found.length === 0) return null;

    // prefer the CDN-proxied playlist (segments resolve against the proxy origin)
    return (
      found.find((u) => /anixx\.cloud/.test(u)) ??
      found.find((u) => /premilkyway/i.test(u)) ??
      found[0]
    );
  } finally {
    page.off('request', listener);
  }
}

function parseSegments(playlist: string, baseUrl: string): string[] {
  const lines = playlist.split('\n');
  const segs: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith('#')) {
        try {
          segs.push(new URL(next, baseUrl).toString());
        } catch {
          // skip malformed
        }
      }
    }
  }
  return segs;
}

function isMasterPlaylist(playlist: string): boolean {
  return playlist.includes('#EXT-X-STREAM-INF') && !playlist.includes('#EXTINF');
}

function firstVariantUrl(playlist: string, baseUrl: string): string | null {
  const lines = playlist.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#EXT-X-STREAM-INF')) {
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (candidate && !candidate.startsWith('#')) {
          try {
            return new URL(candidate, baseUrl).toString();
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

async function fetchPlaylist(page: Page, url: string): Promise<string | null> {
  return page
    .evaluate(async (u: string) => {
      const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`playlist ${res.status}`);
      return await res.text();
    }, url)
    .catch(() => null);
}

async function downloadSegmentsInPage(
  page: Page,
  segments: string[],
  tsPath: string,
  req: ResolveRequest,
  onProgress: (p: ResolveProgress) => void
): Promise<void> {
  const fd = openSync(tsPath, 'w');
  const BATCH = 4;
  const fetchBatch = (urls: string[]) =>
    page.evaluate(async (batch: string[]) => {
      const parts: string[] = [];
      for (const u of batch) {
        const res = await fetch(u, { signal: AbortSignal.timeout(60000) });
        if (!res.ok) throw new Error(`segment ${res.status}`);
        const buf = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        parts.push(btoa(binary));
      }
      return parts;
    }, urls);

  try {
    for (let i = 0; i < segments.length; i += BATCH) {
      const slice = segments.slice(i, i + BATCH);
      let b64s: string[];
      try {
        b64s = await fetchBatch(slice);
      } catch {
        b64s = await fetchBatch(slice);
      }
      for (const b64 of b64s) appendFileSync(fd, Buffer.from(b64, 'base64'));
      const done = Math.min(i + BATCH, segments.length);
      if (done % 20 === 0 || done === segments.length) {
        emit(onProgress, 'downloading', `Fetched ${done}/${segments.length} segments...`, req);
      }
    }
  } finally {
    closeSync(fd);
  }
}

function remuxToMp4(tsPath: string, mp4Path: string): void {
  execFileSync('ffmpeg', ['-y', '-i', tsPath, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', mp4Path], {
    timeout: 300000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

export const tryembedSource: SourceAdapter = {
  name: 'tryembed',

  async resolve(ctx, request, onProgress) {
    const { episodeNumber } = request;
    const anilistId = request.anilistId;
    if (!anilistId) {
      return { episodeNumber, success: false, error: 'tryembed source requires anilistId' };
    }

    const embedUrl = `${EMBED_BASE}/embed/anime/${anilistId}/${episodeNumber}/sub`;
    emit(onProgress, 'searching', `Opening embed for episode ${episodeNumber}...`, request);

    let playlistUrl: string | null = null;
    let playlist: string | null = null;

    for (let attempt = 1; attempt <= 3 && !playlist; attempt++) {
      if (attempt > 1) emit(onProgress, 'searching', `Retrying embed extraction (${attempt}/3)...`, request);
      playlistUrl = await capturePlaylistUrl(ctx.page, embedUrl);
      if (!playlistUrl) continue;

      emit(onProgress, 'on_play_page', 'Reading stream playlist...', request);
      let text = await fetchPlaylist(ctx.page, playlistUrl);
      if (!text) continue;

      // master playlist → follow to the first variant
      if (isMasterPlaylist(text)) {
        const variant = firstVariantUrl(text, playlistUrl);
        if (variant) {
          text = await fetchPlaylist(ctx.page, variant);
          playlistUrl = variant;
        }
      }

      if (text && text.includes('#EXTINF')) playlist = text;
    }

    if (!playlist || !playlistUrl) {
      return { episodeNumber, success: false, error: 'Stream playlist unavailable (blocked or expired)' };
    }

    const segments = parseSegments(playlist, playlistUrl);
    if (segments.length === 0) {
      return { episodeNumber, success: false, error: 'No segments found in playlist' };
    }

    // stop the player so it doesn't compete for bandwidth
    await ctx.page
      .evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null;
        if (v) {
          v.pause();
          v.removeAttribute('src');
          v.load();
        }
      })
      .catch(() => undefined);

    const fileId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const safeName = `${request.animeTitle.replace(/[^a-zA-Z0-9._ -]/g, '')} - EP${String(episodeNumber).padStart(2, '0')}.mp4`;
    const tsPath = join(DOWNLOADS_DIR, `${fileId}.ts`);
    const mp4Path = join(DOWNLOADS_DIR, `${fileId}__${safeName}`);

    emit(onProgress, 'downloading', `Downloading ${segments.length} segments...`, request);
    try {
      await downloadSegmentsInPage(ctx.page, segments, tsPath, request, onProgress);
      emit(onProgress, 'resolving_link', 'Converting to MP4...', request);
      remuxToMp4(tsPath, mp4Path);
    } catch (e) {
      for (const p of [tsPath, mp4Path]) {
        try {
          if (existsSync(p)) unlinkSync(p);
        } catch {
          // ignore
        }
      }
      return {
        episodeNumber,
        success: false,
        error: `HLS download failed: ${e instanceof Error ? e.message.slice(0, 120) : 'unknown'}`,
      };
    } finally {
      try {
        if (existsSync(tsPath)) unlinkSync(tsPath);
      } catch {
        // ignore
      }
    }

    const sizeMB = statSync(mp4Path).size / (1024 * 1024);
    emit(onProgress, 'complete', `Ready: ${sizeMB.toFixed(0)}MB`, request);
    const source: StreamSource = {
      url: `/api/file/${fileId}`,
      quality: String(request.preferredQuality ?? '720p'),
      type: 'mp4',
      referer: EMBED_BASE + '/',
      filename: safeName,
      sizeMB: Math.round(sizeMB),
    };
    return { episodeNumber, success: true, sources: [source], availableQualities: [source.quality] };
  },
};

export type { Quality };
