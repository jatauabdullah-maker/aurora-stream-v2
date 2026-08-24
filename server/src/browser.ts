import { chromium } from 'patchright';
import type { BrowserContext, Page } from 'patchright';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';

const USER_DATA_DIR = process.env.USER_DATA_DIR || join(tmpdir(), 'aurora-resolver-profile');
const HEADLESS = process.env.HEADLESS === 'true';
const CHANNEL = process.env.CHROME_CHANNEL || 'chrome';

export const DOWNLOADS_DIR = process.env.DOWNLOAD_DIR || join(tmpdir(), 'aurora-downloads');

interface Session {
  context: BrowserContext;
  page: Page;
  busy: boolean;
  connected: boolean;
}

let session: Session | null = null;
let launching: Promise<Session> | null = null;

const ALLOWED_HOSTS =
  /(^|\.)(animepahe\.pw|pahe\.win|kwik\.cx|owocdn\.top)$/i;

async function createSession(): Promise<Session> {
  mkdirSync(USER_DATA_DIR, { recursive: true });
  mkdirSync(DOWNLOADS_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS,
    channel: CHANNEL,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const cfCookies = process.env.CF_COOKIES_JSON;
  if (cfCookies) {
    try {
      await context.addCookies(JSON.parse(cfCookies));
      console.log('[browser] injected CF_COOKIES_JSON bootstrap cookies');
    } catch {
      console.error('[browser] invalid CF_COOKIES_JSON, ignoring');
    }
  }

  context.on('page', (popup) => {
    popup.close().catch(() => undefined);
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(45000);

  await page.addInitScript(() => {
    window.open = () => null;
  });

  return { context, page, busy: false, connected: true };
}

export async function getPage(): Promise<Page> {
  if (session?.connected && !session.busy) return session.page;
  if (!launching) {
    launching = createSession().finally(() => {
      launching = null;
    });
  }
  session = await launching;
  return session.page;
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const page = await getPage();
  const s = session!;
  s.busy = true;
  try {
    return await fn(page);
  } finally {
    s.busy = false;
  }
}

/**
 * Navigate and recover if an ad script hijacks the top-level navigation.
 * Retries up to 3 times, verifying we landed on an allowed host.
 */
export async function safeGoto(page: Page, url: string, timeoutMs = 45000): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(800);
    const currentUrl = page.url();
    try {
      const host = new URL(currentUrl).hostname;
      if (ALLOWED_HOSTS.test(host)) return true;
    } catch {
      // fall through to retry
    }
  }
  return false;
}

export function isBrowserConnected(): boolean {
  return !!session?.connected;
}

export async function closeBrowser(): Promise<void> {
  if (session) {
    session.connected = false;
    await session.context.close().catch(() => undefined);
    session = null;
  }
}
