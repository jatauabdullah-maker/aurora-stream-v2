import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { resolveEpisode } from './resolver.js';
import { enqueue, queueDepth } from './queue.js';
import { isBrowserConnected, closeBrowser, withPage } from './browser.js';
import { cacheSize } from './cache.js';
import { availableKeyCount } from './mistral.js';
import { serveFileHandler, cleanupFiles } from './fileproxy.js';
import type {
  ResolveRequest,
  BatchResolveRequest,
  SingleJobState,
  BatchJobState,
  HealthResponse,
  ResolveResponse,
} from './types.js';

const app = express();
const PORT = process.env.PORT || 3000;
const startedAt = Date.now();

const singleJobs = new Map<string, SingleJobState>();
const batchJobs = new Map<string, BatchJobState>();

function jobId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    status: isBrowserConnected() ? 'ok' : 'degraded',
    browserConnected: isBrowserConnected(),
    queueDepth: queueDepth(),
    cacheSize: cacheSize(),
    mistralKeysAvailable: availableKeyCount(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  });
});

app.get('/api/debug/check', (_req: Request, res: Response) => {
  enqueue(async () => {
    try {
      const out = await withPage(async (page) => {
        await page.goto('https://animepahe.pw', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined);
        const samples: { t: number; title: string; frame: boolean; bodyLen: number }[] = [];
        for (const wait of [4000, 5000, 5000, 6000]) {
          await page.waitForTimeout(wait);
          const title = await page.title().catch(() => '');
          const frame = page.frames().find((f) => f.url().includes('challenges.cloudflare.com'));
          const bodyLen = frame
            ? await frame.evaluate(() => document.body?.innerHTML?.length ?? -1).catch(() => -1)
            : -1;
          samples.push({ t: samples.reduce((a, s) => a + 0, 0) + wait, title: title.slice(0, 40), frame: !!frame, bodyLen });
          if (!/just a moment/i.test(title)) break;
        }
        const finalTitle = await page.title().catch(() => '');
        const hasSearch = !!(await page.$('input[name="q"]').catch(() => null));
        return { url: page.url().slice(0, 80), finalTitle: finalTitle.slice(0, 50), passed: !/just a moment/i.test(finalTitle), hasSearch, samples };
      });
      res.json({ ok: true, ...out });
    } catch (e) {
      res.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
});

app.get('/api/file/:fileId', serveFileHandler);

app.post('/api/resolve-stream', (req: Request<{}, {}, ResolveRequest>, res: Response) => {
  const { animeTitle, anilistId, episodeNumber, preferredQuality } = req.body ?? {};

  if (!animeTitle || typeof episodeNumber !== 'number') {
    return res.status(400).json({ success: false, error: 'animeTitle (string) and episodeNumber (number) are required' });
  }

  const id = jobId('job');
  singleJobs.set(id, { status: 'pending' });
  console.log(`[${new Date().toISOString()}] single job ${id}: "${animeTitle}" (al:${anilistId ?? '?'}) EP${episodeNumber} ${preferredQuality ?? '720p'}`);

  enqueue(async () => {
    const job = singleJobs.get(id);
    if (!job) return;
    job.status = 'running';
    try {
      const result = await resolveEpisode({ animeTitle, anilistId, episodeNumber, preferredQuality }, (progress) => {
        const j = singleJobs.get(id);
        if (j) j.progress = progress;
      });
      const j = singleJobs.get(id);
      if (!j) return;
      const response: ResolveResponse = {
        success: result.success,
        sources: result.sources,
        availableQualities: result.availableQualities,
        error: result.error,
        fromCache: result.fromCache,
        progress: j.progress ?? {
          stage: result.success ? 'complete' : 'error',
          message: result.success ? 'Ready' : result.error ?? 'Failed',
          animeTitle,
          episodeNumber,
        },
      };
      j.status = result.success ? 'completed' : 'failed';
      j.result = response;
      if (!result.success) j.error = result.error;
    } catch (err) {
      const j = singleJobs.get(id);
      if (!j) return;
      j.status = 'failed';
      j.error = err instanceof Error ? err.message : 'Internal error';
    }
  });

  res.json({ jobId: id, status: 'pending' });
});

app.get('/api/resolve-stream/:jobId', (req: Request<{ jobId: string }>, res: Response) => {
  const job = singleJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ jobId: req.params.jobId, ...job });
});

app.post('/api/resolve-batch', (req: Request<{}, {}, BatchResolveRequest & { anilistId?: number }>, res: Response) => {
  const { animeTitle, anilistId, episodes, preferredQuality } = req.body ?? {};

  if (!animeTitle || !Array.isArray(episodes) || episodes.length === 0) {
    return res.status(400).json({ success: false, error: 'animeTitle (string) and episodes (number[]) are required' });
  }
  if (episodes.length > 200) {
    return res.status(400).json({ success: false, error: 'Max 200 episodes per batch' });
  }

  const nums = [...new Set(episodes.filter((n) => typeof n === 'number'))].sort((a, b) => a - b);
  const id = jobId('batch');

  const state: BatchJobState = {
    status: 'pending',
    episodes: nums.map((n) => ({ episodeNumber: n, status: 'pending' })),
    completedCount: 0,
    failedCount: 0,
  };
  batchJobs.set(id, state);
  console.log(`[${new Date().toISOString()}] batch job ${id}: "${animeTitle}" EPs ${nums.join(',')} ${preferredQuality ?? '720p'}`);

  enqueue(async () => {
    const job = batchJobs.get(id);
    if (!job) return;
    job.status = 'running';

    for (const ep of job.episodes) {
      const current = batchJobs.get(id);
      if (!current || current.cancelled) {
        ep.status = 'cancelled';
        continue;
      }

      ep.status = 'resolving';
      try {
        const result = await resolveEpisode(
          { animeTitle, anilistId, episodeNumber: ep.episodeNumber, preferredQuality },
          (progress) => {
            ep.progress = progress;
          }
        );
        ep.result = result;
        ep.status = result.success ? 'completed' : 'failed';
        if (result.success) job.completedCount++;
        else job.failedCount++;
      } catch (err) {
        ep.status = 'failed';
        ep.result = {
          episodeNumber: ep.episodeNumber,
          success: false,
          error: err instanceof Error ? err.message : 'Internal error',
        };
        job.failedCount++;
      }
    }

    const final = batchJobs.get(id);
    if (!final) return;
    final.status = final.cancelled ? 'cancelled' : final.failedCount === final.episodes.length ? 'failed' : 'completed';
  });

  res.json({ jobId: id, status: 'pending', total: nums.length });
});

app.get('/api/resolve-batch/:jobId', (req: Request<{ jobId: string }>, res: Response) => {
  const job = batchJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ jobId: req.params.jobId, ...job });
});

app.post('/api/resolve-batch/:jobId/cancel', (req: Request<{ jobId: string }>, res: Response) => {
  const job = batchJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  job.cancelled = true;
  res.json({ success: true, message: 'Batch will stop after the current episode' });
});

setInterval(() => {
  const now = Date.now();
  for (const [id] of singleJobs) {
    const ts = parseInt(id.split('_')[1] ?? '0', 10);
    if (now - ts > 30 * 60 * 1000) singleJobs.delete(id);
  }
  for (const [id] of batchJobs) {
    const ts = parseInt(id.split('_')[1] ?? '0', 10);
    if (now - ts > 60 * 60 * 1000) batchJobs.delete(id);
  }
  cleanupFiles();
}, 60_000);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Aurora Resolver v2 running on port ${PORT}`);
  console.log(`  Health:  GET  /api/health`);
  console.log(`  Single:  POST /api/resolve-stream`);
  console.log(`  Batch:   POST /api/resolve-batch`);
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    console.log(`${sig} received, shutting down...`);
    await closeBrowser();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

export { app };
