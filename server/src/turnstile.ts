import type { Page } from 'patchright';

const MAX_ATTEMPTS = 3;

export function isChallengePage(title: string): boolean {
  return /just a moment/i.test(title);
}

export async function solveTurnstile(page: Page): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const title = await page.title().catch(() => '');
    if (!isChallengePage(title)) return true;

    await page.waitForTimeout(3000);

    const frame = page
      .frames()
      .find((f) => f.url().includes('challenges.cloudflare.com'));

    if (!frame) {
      const newTitle = await page.title().catch(() => '');
      if (!isChallengePage(newTitle)) return true;
      if (attempt === MAX_ATTEMPTS) return false;
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      continue;
    }

    try {
      const el = await frame.frameElement();
      const box = await el.boundingBox();
      if (!box) continue;

      const x = box.x + 32;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: 10 });
      await page.waitForTimeout(500);
      await page.mouse.click(x, y);
      await page.waitForTimeout(6000);

      const newTitle = await page.title().catch(() => '');
      if (!isChallengePage(newTitle)) return true;
    } catch {
      // frame may have been destroyed during navigation — retry
    }
  }

  const finalTitle = await page.title().catch(() => '');
  return !isChallengePage(finalTitle);
}

export async function ensureNotChallenged(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => '');
  if (!isChallengePage(title)) return true;
  return solveTurnstile(page);
}
