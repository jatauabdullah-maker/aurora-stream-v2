import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { resolveStream, closeBrowser, getBrowser } from './resolver.js';
import type { ResolveRequest, ResolveResponse, HealthResponse } from './types.js';

const app = express();
const PORT = process.env.PORT || 3000;

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

app.post('/api/resolve-stream', async (req: Request<{}, {}, ResolveRequest>, res: Response<ResolveResponse>) => {
  const { animeTitle, episodeNumber, preferredQuality } = req.body;
  
  if (!animeTitle || !episodeNumber) {
    return res.status(400).json({
      success: false,
      error: 'animeTitle and episodeNumber are required',
      progress: {
        stage: 'error',
        message: 'Missing required parameters',
        animeTitle: animeTitle || '',
        episodeNumber: episodeNumber || 0
      }
    });
  }
  
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[${new Date().toISOString()}] Resolve request from ${clientIp}: "${animeTitle}" EP ${episodeNumber} (${preferredQuality || '1080p'})`);
  
  const sseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  };
  
  const wantsSSE = req.headers.accept?.includes('text/event-stream');
  
  let sseResponse: Response | null = null;
  
  const sendProgress = (progress: ResolveResponse['progress']) => {
    if (wantsSSE && sseResponse && !sseResponse.writableEnded) {
      sseResponse.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
  };
  
  if (wantsSSE) {
    res.writeHead(200, sseHeaders);
    sseResponse = res;
    res.write(`data: ${JSON.stringify({ stage: 'searching', message: 'Starting...', animeTitle, episodeNumber })}\n\n`);
  }
  
  try {
    const result = await resolveStream(
      { animeTitle, episodeNumber, preferredQuality },
      sendProgress
    );
    
    if (wantsSSE && sseResponse && !sseResponse.writableEnded) {
      sseResponse.write(`data: ${JSON.stringify(result.progress)}\n\n`);
      sseResponse.end();
    } else {
      res.json(result);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Resolve error:', error);
    
    const errorResponse: ResolveResponse = {
      success: false,
      error: errorMessage,
      progress: {
        stage: 'error',
        message: errorMessage,
        animeTitle,
        episodeNumber
      }
    };
    
    if (wantsSSE && sseResponse && !sseResponse.writableEnded) {
      sseResponse.write(`data: ${JSON.stringify(errorResponse.progress)}\n\n`);
      sseResponse.end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    progress: { stage: 'error', message: 'Internal server error', animeTitle: '', episodeNumber: 0 }
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Aurora Resolver running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Resolve: POST http://localhost:${PORT}/api/resolve-stream`);
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