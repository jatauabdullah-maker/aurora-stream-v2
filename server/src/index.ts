import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { resolveStream, closeBrowser, getBrowser } from './resolver.js';
import type { ResolveRequest, ResolveResponse, HealthResponse, ResolveProgress } from './types.js';

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory job store (use Redis in production)
const jobs = new Map<string, { status: 'pending' | 'running' | 'completed' | 'failed'; progress?: ResolveProgress; result?: ResolveResponse; error?: string }>();

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req: Request, res: Response<HealthResponse>) => {
  try {
    const { browser } = await getBrowser();
    res.json({ 
      status: 'ok', 
      browserConnected: browser.isConnected() 
    });
  } catch {
    res.json({ status: 'ok', browserConnected: false });
  }
});

// Start a resolve job
app.post('/api/resolve-stream', async (req: Request<{}, {}, ResolveRequest>, res: Response) => {
  const { animeTitle, episodeNumber, preferredQuality } = req.body;
  
  if (!animeTitle || !episodeNumber) {
    return res.status(400).json({
      success: false,
      error: 'animeTitle and episodeNumber are required',
    });
  }
  
  const jobId = generateJobId();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[${new Date().toISOString()}] Resolve job ${jobId} from ${clientIp}: "${animeTitle}" EP ${episodeNumber} (${preferredQuality || '1080p'})`);
  
  jobs.set(jobId, { status: 'pending' });
  
  // Start resolution in background
  (async () => {
    const job = jobs.get(jobId);
    if (!job) return;
    
    job.status = 'running';
    job.progress = { stage: 'searching', message: `Searching for "${animeTitle}"...`, animeTitle, episodeNumber };
    
    try {
      const sendProgress = (progress: ResolveProgress) => {
        const currentJob = jobs.get(jobId);
        if (currentJob) currentJob.progress = progress;
      };
      
      const result = await resolveStream(
        { animeTitle, episodeNumber, preferredQuality },
        sendProgress
      );
      
      const finalJob = jobs.get(jobId);
      if (finalJob) {
        finalJob.status = result.success ? 'completed' : 'failed';
        finalJob.result = result;
        if (!result.success) finalJob.error = result.error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      console.error('Resolve error:', error);
      
      const finalJob = jobs.get(jobId);
      if (finalJob) {
        finalJob.status = 'failed';
        finalJob.error = errorMessage;
        finalJob.progress = { stage: 'error', message: errorMessage, animeTitle, episodeNumber };
      }
    }
  })();
  
  // Return job ID immediately
  res.json({ jobId, status: 'pending' });
});

// Poll for job status
app.get('/api/resolve-stream/:jobId', (req: Request<{ jobId: string }>, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  
  res.json({
    jobId,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
  });
});

// Clean up old jobs periodically
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    // Extract timestamp from jobId
    const match = jobId.match(/job_(\d+)_/);
    if (match) {
      const timestamp = parseInt(match[1], 10);
      if (now - timestamp > 10 * 60 * 1000) { // 10 minutes
        jobs.delete(jobId);
      }
    }
  }
}, 60000);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error'
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Aurora Resolver running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Start resolve: POST http://localhost:${PORT}/api/resolve-stream`);
  console.log(`   Poll status: GET http://localhost:${PORT}/api/resolve-stream/:jobId`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing browser...');
  await closeBrowser();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing browser...');
  await closeBrowser();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app };