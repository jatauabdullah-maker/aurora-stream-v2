import type { Request, Response } from 'express';
import { createReadStream, statSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DOWNLOADS_DIR } from './browser.js';

function findFile(fileId: string): { path: string; filename: string; size: number } | null {
  if (!/^[\w-]+$/.test(fileId)) return null;
  try {
    const match = readdirSync(DOWNLOADS_DIR).find((f) => f.startsWith(`${fileId}__`));
    if (!match) return null;
    const path = join(DOWNLOADS_DIR, match);
    const filename = match.split('__').slice(1).join('__') || 'video.mp4';
    return { path, filename, size: statSync(path).size };
  } catch {
    return null;
  }
}

export function serveFileHandler(req: Request, res: Response): void {
  const file = findFile(req.params.fileId ?? '');
  if (!file || !existsSync(file.path)) {
    res.status(404).json({ success: false, error: 'File not found or expired' });
    return;
  }

  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/"/g, '')}"`);

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), file.size - 1) : file.size - 1;
      if (start >= file.size || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${file.size}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      createReadStream(file.path, { start, end }).pipe(res);
      return;
    }
  }

  res.setHeader('Content-Length', String(file.size));
  createReadStream(file.path).pipe(res);
}

const FILE_TTL_MS = (() => {
  const min = parseInt(process.env.FILE_TTL_MINUTES || '120', 10);
  return Math.max(15, min) * 60 * 1000;
})();

export function cleanupFiles(): void {
  try {
    const now = Date.now();
    for (const f of readdirSync(DOWNLOADS_DIR)) {
      const path = join(DOWNLOADS_DIR, f);
      try {
        if (now - statSync(path).mtimeMs > FILE_TTL_MS) unlinkSync(path);
      } catch {
        // file may be in use — skip
      }
    }
  } catch {
    // dir may not exist yet
  }
}
