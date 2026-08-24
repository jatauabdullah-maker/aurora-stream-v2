import type { Page } from 'patchright';
import type {
  SourceAdapter,
  ResolverContext,
  ResolveRequest,
  ResolveProgress,
  StreamSource,
  Quality,
} from '../types.js';
import { ensureNotChallenged } from '../turnstile.js';
import { safeGoto, DOWNLOADS_DIR } from '../browser.js';
import { join } from 'node:path';

const BASE = 'https://animepahe.pw';

const animeUuidCache = new Map<string, { uuid: string; expiresAt: number }>();
const UUID_TTL_MS = 6 * 60 * 60 * 1000;

interface QualityLink {
  quality: Quality;
  href: string;
  sizeMB?: number;
}

function emit(
  onProgress: (p: ResolveProgress) => void,
  stage: ResolveProgress['stage'],
  message: string,
  req: ResolveRequest
) {
  onProgress({ stage, message, animeTitle: req.animeTitle, episodeNumber: req.episodeNumber });
}

async function findAnimeUuid(ctx: ResolverContext, page: Page, title: string): Promise<string | null> {
  const cached = animeUuidCache.get(title.toLowerCase().trim());
  if (cached && Date.now() < cached.expiresAt) return cached.uuid;

  if (!(await safeGoto(page, BASE))) return null;
  if (!(await ensureNotChallenged(page))) throw new Error('TURNSTILE_FAILED_HOME');
  if (!/animepahe/i.test(await page.title().catch(() => ''))) {
    throw new Error('TURNSTILE_FAILED_HOME');
  }

  const input = await page.$('input[name="q"]');
  if (!input) return null;

  await input.click();
  await input.fill('');
  await input.type(title, { delay: 60 });
  await page.waitForTimeout(2500);

  let href = await page
    .$eval(
      '[role="listbox"] [role="option"] a[href*="/anime/"], .autocomplete-results a[href*="/anime/"], .search-results a[href*="/anime/"], [role="option"][href*="/anime/"]',
      (el) => el.getAttribute('href')
    )
    .catch(() => null);

  if (!href) {
    const options = await page
      .$$eval('a[href*="/anime/"]', (els) =>
        els.map((e) => e.getAttribute('href')).filter(Boolean)
      )
      .catch(() => [] as (string | null)[]);
    href = options.find((h) => h && h.includes('/anime/')) ?? null;
  }

  if (!href) {
    if (!(await safeGoto(page, `${BASE}/?q=${encodeURIComponent(title)}`))) return null;
    if (!(await ensureNotChallenged(page))) return null;
    href = await page
      .$eval('a[href*="/anime/"]', (el) => el.getAttribute('href'))
      .catch(() => null);
  }

  if (!href) return null;

  const uuid = href.split('/anime/')[1]?.split(/[?#]/)[0];
  if (!uuid) return null;

  animeUuidCache.set(title.toLowerCase().trim(), { uuid, expiresAt: Date.now() + UUID_TTL_MS });
  return uuid;
}

async function findEpisodePlayUrl(
  ctx: ResolverContext,
  page: Page,
  uuid: string,
  episodeNumber: number
): Promise<string | null> {
  if (!(await safeGoto(page, `${BASE}/anime/${uuid}`))) return null;
  if (!(await ensureNotChallenged(page))) return null;

  for (let pageNum = 1; pageNum <= 40; pageNum++) {
    const links = await page.$$eval('a.play[href*="/play/"]', (els) =>
      els.map((e) => {
        const text = e.textContent ?? '';
        const m = text.match(/(\d+(?:\.\d+)?)/);
        return { href: e.getAttribute('href'), num: m ? parseFloat(m[1]) : NaN };
      })
    );

    const match = links.find((l) => l.num === episodeNumber && l.href);
    if (match?.href) return match.href.startsWith('http') ? match.href : BASE + match.href;

    const nums = links.map((l) => l.num).filter((n) => !Number.isNaN(n));
    const minOnPage = Math.min(...nums);
    if (Number.isFinite(minOnPage) && minOnPage < episodeNumber) return null;

    const nextHref = await page
      .$eval('nav[aria-label="Page navigation"] a[aria-label="Next"], nav[aria-label="Page navigation"] a:last-child', (el) =>
        el.getAttribute('href')
      )
      .catch(() => null);

    if (!nextHref) return null;
    if (!(await safeGoto(page, nextHref.startsWith('http') ? nextHref : BASE + nextHref))) return null;
    if (!(await ensureNotChallenged(page))) return null;
    await page.waitForTimeout(800);
  }
  return null;
}

async function extractQualityLinks(page: Page): Promise<QualityLink[]> {
  const raw = await page.$$eval('a[href*="pahe.win"]', (els) =>
    els.map((e) => ({ text: e.textContent ?? '', href: e.getAttribute('href') ?? '' }))
  );

  const out: QualityLink[] = [];
  for (const r of raw) {
    const qm = r.text.match(/(360|720|1080)p/);
    if (!qm || !r.href) continue;
    const sm = r.text.match(/\((\d+(?:\.\d+)?)\s*MB\)/i);
    out.push({
      quality: `${qm[1]}p` as Quality,
      href: r.href,
      sizeMB: sm ? parseFloat(sm[1]) : undefined,
    });
  }
  return out;
}

async function followPahewin(ctx: ResolverContext, page: Page, pahewinUrl: string): Promise<string | null> {
  if (!(await safeGoto(page, pahewinUrl))) return null;
  if (!(await ensureNotChallenged(page))) return null;

  let kwikUrl = await page
    .waitForSelector('a.redirect[href*="kwik"], a[href*="kwik.cx/f/"]', { timeout: 15000 })
    .then((el) => el?.getAttribute('href'))
    .catch(() => null);

  if (!kwikUrl) {
    kwikUrl = await page
      .$eval('a[href*="kwik.cx/f/"]', (el) => el.getAttribute('href'))
      .catch(() => null);
  }

  if (!kwikUrl) {
    const clicked = await page
      .$eval('a.redirect', (el) => {
        (el as HTMLAnchorElement).click();
        return true;
      })
      .catch(() => false);
    if (clicked) {
      await page.waitForURL(/kwik\.cx/, { timeout: 20000 }).catch(() => undefined);
      if (/kwik\.cx/.test(page.url())) return page.url();
    }
  }

  if (!kwikUrl) {
    const brain = await ctx.askBrain({
      situation: 'On pahe.win redirect page but a.redirect selector not found',
      url: page.url(),
      title: await page.title().catch(() => ''),
      htmlSnippet: await page.evaluate(() => document.body.innerHTML.slice(0, 4000)).catch(() => ''),
      goal: 'Find the kwik.cx/f/ download URL',
    });
    if (brain?.action === 'extract' && brain.extracted) kwikUrl = brain.extracted;
    else if (brain?.action === 'click' && brain.selector) {
      const href = await page.$eval(brain.selector, (el) => el.getAttribute('href')).catch(() => null);
      if (href?.includes('kwik.cx')) kwikUrl = href;
    }
  }

  return kwikUrl?.includes('kwik.cx') ? kwikUrl : null;
}

async function submitKwikDownload(ctx: ResolverContext, page: Page, kwikUrl: string): Promise<{ url: string; filename: string } | null> {
  if (!(await safeGoto(page, kwikUrl))) return null;
  if (!(await ensureNotChallenged(page))) return null;
  await page.waitForTimeout(1000);

  const hasForm = await page.$('form[action*="/d/"]');
  if (!hasForm) {
    const brain = await ctx.askBrain({
      situation: 'On kwik.cx/f/ page but download form not found',
      url: page.url(),
      title: await page.title().catch(() => ''),
      htmlSnippet: await page.evaluate(() => document.body.innerHTML.slice(0, 4000)).catch(() => ''),
      goal: 'Find and submit the download form to get the direct MP4',
    });
    if (brain?.action === 'give_up') return null;
    if (brain?.action === 'wait' && brain.waitMs) {
      await page.waitForTimeout(Math.min(brain.waitMs, 10000));
    }
    if (!(await page.$('form[action*="/d/"]'))) return null;
  }

  try {
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.evaluate(() => {
      const form = document.querySelector('form[action*="/d/"]') as HTMLFormElement | null;
      form?.submit();
    });
    const download = await downloadPromise;

    ctx.log(`download started: ${download.suggestedFilename()}`);
    const fileId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const safeName = (download.suggestedFilename() || 'video.mp4').replace(/[^a-zA-Z0-9._ -]/g, '_');
    await download.saveAs(join(DOWNLOADS_DIR, `${fileId}__${safeName}`));
    ctx.log(`download saved: ${fileId} (${safeName})`);

    return { url: `/api/file/${fileId}`, filename: safeName };
  } catch (e) {
    ctx.log(`download failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export const animepaheSource: SourceAdapter = {
  name: 'animepahe',

  async resolve(ctx, request, onProgress) {
    const { animeTitle, episodeNumber, preferredQuality = '720p' } = request;
    const page = ctx.page;

    emit(onProgress, 'searching', `Searching for "${animeTitle}"...`, request);
    let uuid: string | null = null;
    try {
      uuid = await findAnimeUuid(ctx, page, animeTitle);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('TURNSTILE_FAILED')) {
        return {
          episodeNumber,
          success: false,
          error: 'Cloudflare protection could not be passed from this server IP. A cf_clearance cookie bootstrap (CF_COOKIES_JSON) or a different IP may be required.',
        };
      }
      throw e;
    }
    if (!uuid) {
      return { episodeNumber, success: false, error: `Anime "${animeTitle}" not found on animepahe` };
    }

    emit(onProgress, 'found_anime', `Found "${animeTitle}"`, request);
    const playUrl = await findEpisodePlayUrl(ctx, page, uuid, episodeNumber);
    if (!playUrl) {
      return { episodeNumber, success: false, error: `Episode ${episodeNumber} not found on animepahe` };
    }

    emit(onProgress, 'finding_episode', `Opening episode ${episodeNumber}...`, request);
    if (!(await safeGoto(page, playUrl))) {
      return { episodeNumber, success: false, error: 'Could not open play page' };
    }
    if (!(await ensureNotChallenged(page))) {
      return { episodeNumber, success: false, error: 'Could not pass protection on play page' };
    }
    await page.waitForTimeout(1000);

    emit(onProgress, 'on_play_page', 'Reading quality options...', request);
    const qualityLinks = await extractQualityLinks(page);
    if (qualityLinks.length === 0) {
      return { episodeNumber, success: false, error: 'No download links found on play page' };
    }

    const availableQualities = qualityLinks.map((q) => q.quality);
    const chosen =
      qualityLinks.find((q) => q.quality === preferredQuality) ??
      qualityLinks.find((q) => q.quality === '720p') ??
      qualityLinks[qualityLinks.length - 1];

    emit(onProgress, 'solving_protection', `Following ${chosen.quality} link...`, request);
    const kwikUrl = await followPahewin(ctx, page, chosen.href);
    if (!kwikUrl) {
      return {
        episodeNumber,
        success: false,
        error: 'Could not reach kwik download page',
        availableQualities,
      };
    }

    emit(onProgress, 'resolving_link', 'Resolving direct MP4 link...', request);
    const dl = await submitKwikDownload(ctx, page, kwikUrl);
    if (!dl) {
      return {
        episodeNumber,
        success: false,
        error: 'Could not resolve direct download link',
        availableQualities,
      };
    }

    const source: StreamSource = {
      url: dl.url,
      quality: chosen.quality,
      type: 'mp4',
      referer: 'https://kwik.cx/',
      filename: dl.filename,
      sizeMB: chosen.sizeMB,
    };

    emit(onProgress, 'complete', `Ready: ${chosen.quality}`, request);
    return {
      episodeNumber,
      success: true,
      sources: [source],
      availableQualities,
    };
  },
};
