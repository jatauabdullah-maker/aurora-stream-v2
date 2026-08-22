import { chromium, type Browser, type Page, type Frame } from 'playwright';
import type { ResolveRequest, ResolveResponse, ResolveProgress, StreamSource } from './types.js';

const ANIMEPAHE_BASE = 'https://animepahe.pw';
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
      '--single-process',
      '--disable-gpu',
    ],
  });
  const page = await browser.newPage({ userAgent: USER_AGENT });
  page.setDefaultTimeout(60000);
  browserInstance = { browser, page };
  return browserInstance;
}

async function solveTurnstile(page: Page, context: string = 'page'): Promise<boolean> {
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.waitForTimeout(3000);
      
      const frames = page.frames();
      const turnstileFrame = frames.find(f => f.url().includes('challenges.cloudflare.com') && f.url().includes('turnstile'));
      
      if (!turnstileFrame) {
        const title = await page.title();
        if (title !== 'Just a moment...') {
          return true;
        }
        if (attempt === maxRetries) return false;
        await page.waitForTimeout(2000);
        continue;
      }
      
      const frameElement = await turnstileFrame.frameElement();
      if (!frameElement) {
        if (attempt === maxRetries) return false;
        await page.waitForTimeout(2000);
        continue;
      }
      
      const box = await frameElement.boundingBox();
      if (!box) {
        if (attempt === maxRetries) return false;
        await page.waitForTimeout(2000);
        continue;
      }
      
      const clickX = box.x + 32;
      const clickY = box.y + box.height / 2;
      
      await page.mouse.move(clickX, clickY, { steps: 10 });
      await page.waitForTimeout(500);
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(6000);
      
      const newTitle = await page.title();
      if (newTitle !== 'Just a moment...') {
        return true;
      }
      
      if (attempt < maxRetries) {
        await page.waitForTimeout(2000);
      }
    } catch (error) {
      console.error(`Turnstile solve attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) return false;
      await page.waitForTimeout(2000);
    }
  }
  
  return false;
}

async function searchAnime(page: Page, title: string): Promise<string | null> {
  await page.goto(ANIMEPAHE_BASE, { waitUntil: 'domcontentloaded' });
  
  const turnstileSolved = await solveTurnstile(page, 'search');
  if (!turnstileSolved) {
    throw new Error('Failed to solve Turnstile on animepahe homepage');
  }
  
  await page.waitForSelector('input[name="q"].input-search', { timeout: 10000 });
  await page.fill('input[name="q"].input-search', title);
  await page.waitForTimeout(1000);
  
  const autocompleteSelectors = [
    '[role="listbox"] [role="option"]',
    '.autocomplete-results a',
    '.search-results a'
  ];
  
  let resultLink: string | null = null;
  
  for (const selector of autocompleteSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const links = await page.$$eval(selector, (els, baseUrl) => 
        els.map(el => (el as HTMLAnchorElement).href).filter(href => href.includes('/anime/'))
      , ANIMEPAHE_BASE);
      
      if (links.length > 0) {
        resultLink = links[0];
        break;
      }
    } catch {
      continue;
    }
  }
  
  if (!resultLink) {
    try {
      await page.waitForSelector('a[href*="/anime/"]', { timeout: 5000 });
      const links = await page.$$eval('a[href*="/anime/"]', (els) => 
        els.map(el => (el as HTMLAnchorElement).href)
      );
      if (links.length > 0) {
        resultLink = links[0];
      }
    } catch {
      throw new Error(`No anime found for "${title}"`);
    }
  }
  
  return resultLink;
}

async function findEpisode(page: Page, episodeNumber: number): Promise<string | null> {
  let currentPage = page;
  
  for (let pageNum = 1; pageNum <= 50; pageNum++) {
    await currentPage.waitForTimeout(1000);
    
    const turnstileSolved = await solveTurnstile(currentPage, 'anime-page');
    if (!turnstileSolved) {
      throw new Error('Failed to solve Turnstile on anime page');
    }
    
    try {
      await currentPage.waitForSelector('a.play[href*="/play/"]', { timeout: 10000 });
    } catch {
      break;
    }
    
    const episodeLinks = await currentPage.$$eval('a.play[href*="/play/"]', (els, targetEp) => {
      return els
        .map(el => ({
          href: (el as HTMLAnchorElement).href,
          text: el.textContent?.trim() || ''
        }))
        .filter(item => item.text.includes(`Watch - ${targetEp} Online`) || item.text.includes(`Episode ${targetEp}`));
    }, episodeNumber);
    
    if (episodeLinks.length > 0) {
      return episodeLinks[0].href;
    }
    
    try {
      const nextPageLink = await currentPage.$('nav[aria-label="Page navigation"] a[rel="next"], nav.pagination a:last-child');
      if (nextPageLink) {
        const href = await nextPageLink.getAttribute('href');
        if (href) {
          await currentPage.goto(href, { waitUntil: 'domcontentloaded' });
          continue;
        }
      }
      const pageLinks = await currentPage.$$eval('nav[aria-label="Page navigation"] a', (els) => 
        els.map(el => (el as HTMLAnchorElement).href)
      );
      const nextPageUrl = pageLinks.find(url => url.includes(`page=${pageNum + 1}`) || url.includes(`/page/${pageNum + 1}`));
      if (nextPageUrl) {
        await currentPage.goto(nextPageUrl, { waitUntil: 'domcontentloaded' });
        continue;
      }
    } catch {
      break;
    }
    
    break;
  }
  
  return null;
}

async function getPlayPageInfo(page: Page): Promise<{ session: string; provider: string; kwikUrl: string; qualityLinks: { quality: string; url: string }[] } | null> {
  await page.waitForTimeout(1000);
  
  const turnstileSolved = await solveTurnstile(page, 'play-page');
  if (!turnstileSolved) {
    throw new Error('Failed to solve Turnstile on play page');
  }
  
  await page.waitForTimeout(2000);
  
  const scriptContent = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    return scripts.map(s => s.textContent || '').join('\n');
  });
  
  const sessionMatch = scriptContent.match(/let session\s*=\s*["']([^"']+)["']/);
  const providerMatch = scriptContent.match(/let provider\s*=\s*["']([^"']+)["']/);
  const urlMatch = scriptContent.match(/let url\s*=\s*["']([^"']+)["']/);
  
  const qualityLinks = await page.$$eval('a[href*="pahe.win"]', (els) => 
    els.map(el => ({
      quality: el.textContent?.trim() || 'Unknown',
      url: (el as HTMLAnchorElement).href
    }))
  );
  
  if (!sessionMatch || !providerMatch || !urlMatch) {
    return null;
  }
  
  return {
    session: sessionMatch[1],
    provider: providerMatch[1],
    kwikUrl: urlMatch[1],
    qualityLinks
  };
}

async function navigatePaheWin(page: Page, paheWinUrl: string): Promise<string | null> {
  await page.goto(paheWinUrl, { waitUntil: 'domcontentloaded' });
  
  const turnstileSolved = await solveTurnstile(page, 'pahe.win');
  if (!turnstileSolved) {
    throw new Error('Failed to solve Turnstile on pahe.win');
  }
  
  await page.waitForTimeout(1000);
  
  const redirectLink = await page.$('a.redirect');
  if (!redirectLink) {
    const allLinks = await page.$$eval('a[href*="kwik.cx"]', (els) => 
      els.map(el => (el as HTMLAnchorElement).href)
    );
    if (allLinks.length > 0) {
      return allLinks[0];
    }
    throw new Error('No redirect link found on pahe.win');
  }
  
  const href = await redirectLink.getAttribute('href');
  return href;
}

async function submitKwikForm(page: Page, kwikFUrl: string): Promise<{ url: string; filename: string } | null> {
  await page.goto(kwikFUrl, { waitUntil: 'domcontentloaded' });
  
  const turnstileSolved = await solveTurnstile(page, 'kwik.cx/f');
  if (!turnstileSolved) {
    throw new Error('Failed to solve Turnstile on kwik.cx/f');
  }
  
  await page.waitForTimeout(1000);
  
  const form = await page.$('form[action*="kwik.cx/d/"]');
  if (!form) {
    throw new Error('Download form not found on kwik.cx/f page');
  }
  
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  
  await form.evaluate((f: HTMLFormElement) => f.submit());
  
  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  
  const downloadUrl = download.url();
  
  return { url: downloadUrl, filename: suggestedFilename };
}

async function resolveStream(request: ResolveRequest, onProgress?: (progress: ResolveProgress) => void): Promise<ResolveResponse> {
  const { animeTitle, episodeNumber, preferredQuality = '1080p' } = request;
  
  const emitProgress = (stage: ResolveProgress['stage'], message: string) => {
    const progress: ResolveProgress = {
      stage,
      message,
      animeTitle,
      episodeNumber
    };
    onProgress?.(progress);
  };
  
  emitProgress('searching', `Searching for "${animeTitle}"...`);
  
  const { browser, page } = await getBrowser();
  
  try {
    const animeUrl = await searchAnime(page, animeTitle);
    if (!animeUrl) {
      return { success: false, error: `Anime "${animeTitle}" not found on animepahe`, progress: { stage: 'error', message: `Anime "${animeTitle}" not found on animepahe`, animeTitle, episodeNumber } };
    }
    
    emitProgress('found_anime', `Found anime page`);
    
    await page.goto(animeUrl, { waitUntil: 'domcontentloaded' });
    
    emitProgress('finding_episode', `Finding episode ${episodeNumber}...`);
    
    const episodeUrl = await findEpisode(page, episodeNumber);
    if (!episodeUrl) {
      return { success: false, error: `Episode ${episodeNumber} not found for "${animeTitle}"`, progress: { stage: 'error', message: `Episode ${episodeNumber} not found for "${animeTitle}"`, animeTitle, episodeNumber } };
    }
    
    emitProgress('on_play_page', `Found episode, navigating to play page...`);
    
    await page.goto(episodeUrl, { waitUntil: 'domcontentloaded' });
    
    emitProgress('solving_turnstile_animepahe', 'Solving Turnstile on play page...');
    
    const playInfo = await getPlayPageInfo(page);
    if (!playInfo) {
      return { success: false, error: 'Could not extract play page information', progress: { stage: 'error', message: 'Could not extract play page information', animeTitle, episodeNumber } };
    }
    
    let selectedQualityLink = playInfo.qualityLinks.find(q => q.quality.includes(preferredQuality.replace('p', ''))) 
      || playInfo.qualityLinks.find(q => q.quality.includes('1080'))
      || playInfo.qualityLinks[0];
    
    if (!selectedQualityLink) {
      return { success: false, error: 'No quality links found on play page', progress: { stage: 'error', message: 'No quality links found on play page', animeTitle, episodeNumber } };
    }
    
    emitProgress('on_pahewin', `Navigating to pahe.win for ${selectedQualityLink.quality}...`);
    
    const kwikFUrl = await navigatePaheWin(page, selectedQualityLink.url);
    if (!kwikFUrl) {
      return { success: false, error: 'Failed to navigate pahe.win redirect', progress: { stage: 'error', message: 'Failed to navigate pahe.win redirect', animeTitle, episodeNumber } };
    }
    
    emitProgress('solving_turnstile_kwik', 'Solving Turnstile on kwik.cx...');
    
    emitProgress('submitting_download', 'Submitting download form...');
    
    const downloadResult = await submitKwikForm(page, kwikFUrl);
    if (!downloadResult) {
      return { success: false, error: 'Failed to submit download form on kwik.cx', progress: { stage: 'error', message: 'Failed to submit download form on kwik.cx', animeTitle, episodeNumber } };
    }
    
    const source: StreamSource = {
      url: downloadResult.url,
      quality: selectedQualityLink.quality,
      type: 'mp4',
      referer: 'https://kwik.cx/',
      sizeMB: undefined
    };
    
    emitProgress('complete', `Ready: ${selectedQualityLink.quality}`);
    
    return {
      success: true,
      sources: [source],
      subtitles: [],
      progress: { stage: 'complete', message: `Ready: ${selectedQualityLink.quality}`, animeTitle, episodeNumber }
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    emitProgress('error', errorMessage);
    return {
      success: false,
      error: errorMessage,
      progress: { stage: 'error', message: errorMessage, animeTitle, episodeNumber }
    };
  }
}

async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.browser.close();
    browserInstance = null;
  }
}

export { resolveStream, closeBrowser, getBrowser };