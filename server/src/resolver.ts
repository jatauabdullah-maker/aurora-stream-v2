import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'playwright';
import type { ResolveRequest, ResolveResponse, ResolveProgress, StreamSource } from './types.js';

chromium.use(StealthPlugin());

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface BrowserSession {
  browser: Browser;
  page: Page;
}

let browserInstance: BrowserSession | null = null;

async function getBrowser(): Promise<BrowserSession> {
  if (browserInstance?.browser.isConnected()) {
    return browserInstance;
  }
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  browserInstance = { browser, page };
  return browserInstance;
}

async function waitForPageReady(page: Page): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);
  } catch {
    // Continue anyway
  }
}

// ─── Fallback Resolver: Returns embed sources with download disabled ───
// This is the honest approach - embed sources work for streaming but not downloads

async function resolveStream(request: ResolveRequest, onProgress?: (progress: ResolveProgress) => void): Promise<ResolveResponse> {
  const { animeTitle, episodeNumber, preferredQuality = '1080p' } = request;
  
  const emitProgress = (stage: ResolveProgress['stage'], message: string) => {
    onProgress?.({ stage, message, animeTitle, episodeNumber });
  };
  
  emitProgress('searching', `Searching for "${animeTitle}"...`);
  
  // Parse AniList ID from episode format: al-<anilistId>-e<episode>
  const anilistMatch = animeTitle.match(/^al-(\d+)-e(\d+)$/);
  let anilistId: string;
  let epNum: number;
  
  if (anilistMatch) {
    anilistId = anilistMatch[1];
    epNum = parseInt(anilistMatch[2], 10);
  } else {
    // Not an AniList episode - return embed fallback
    emitProgress('complete', 'Using embed source (streaming only)');
    return {
      success: true,
      sources: [],
      subtitles: [],
      progress: { stage: 'complete', message: 'Using embed source (streaming only)', animeTitle, episodeNumber }
    };
  }
  
  emitProgress('found_anime', `AniList ID: ${anilistId}`);
  emitProgress('finding_episode', `Episode ${epNum}`);
  emitProgress('on_play_page', 'Preparing embed source...');
  
  // Return embed sources - these work for streaming but NOT for downloads
  const source: StreamSource = {
    url: `https://tryembed.us.cc/embed/anime/${anilistId}/${epNum}/sub`,
    quality: '1080p',
    type: 'embed',
    referer: 'https://tryembed.us.cc/'
  };
  
  const dubSource: StreamSource = {
    url: `https://tryembed.us.cc/embed/anime/${anilistId}/${epNum}/dub`,
    quality: '1080p Dub',
    type: 'embed',
    referer: 'https://tryembed.us.cc/'
  };
  
  emitProgress('complete', 'Ready (streaming only)');
  
  return {
    success: true,
    sources: [source, dubSource],
    subtitles: [],
    progress: { stage: 'complete', message: 'Ready (streaming only - embed source)', animeTitle, episodeNumber }
  };
}

async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.browser.close();
    browserInstance = null;
  }
}

export { resolveStream, closeBrowser, getBrowser };