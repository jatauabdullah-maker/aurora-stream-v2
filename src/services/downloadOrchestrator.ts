import { checkExtension, startExtensionDownload } from './extension'
import { downloadEngine } from './downloads'

const QUALITY_ORDER = ['1080p', '720p', '360p']

export function lowerQuality(q: string): string | null {
  const idx = QUALITY_ORDER.indexOf(q)
  if (idx < 0 || idx >= QUALITY_ORDER.length - 1) return null
  return QUALITY_ORDER[idx + 1]
}

export interface SingleDownloadTarget {
  episodeId: string
  animeId: string
  animeTitle: string
  episodeNumber: number
  poster: string
}

export async function startSingleDownload(
  target: SingleDownloadTarget,
  quality: string,
  onProgress?: (stage: string, message: string) => void
): Promise<{ ok: boolean; error?: string; noMethod?: boolean }> {
  // clean up a previous failed attempt so retry starts fresh
  const existing = downloadEngine.getSnapshot().find((d) => d.id === target.episodeId)
  if (existing && existing.status === 'error') {
    await downloadEngine.remove(target.episodeId)
  }

  // Downloads run through the Aurora Downloader extension — in the user's
  // browser, with their IP, saved into Aurora for offline playback.
  const ext = await checkExtension()
  if (!ext.installed) {
    return { ok: false, noMethod: true, error: 'No download source available on this device' }
  }

  downloadEngine.addResolving({
    id: target.episodeId,
    animeId: target.animeId,
    animeTitle: target.animeTitle,
    episodeNumber: target.episodeNumber,
    poster: target.poster,
    quality,
    url: '',
  })
  const result = await startExtensionDownload(
    { animeTitle: target.animeTitle, episodeNumber: target.episodeNumber, quality },
    (p) => {
      downloadEngine.updateResolverProgress(target.episodeId, { stage: p.stage, message: p.message })
      onProgress?.(p.stage, p.message)
    }
  )
  if (result.ok && result.blob) {
    await downloadEngine.markCompletedWithBlob(target.episodeId, result.blob)
    return { ok: true }
  }
  if (result.ok) {
    downloadEngine.markCompletedExternal(target.episodeId)
    return { ok: true }
  }
  downloadEngine.markResolveError(target.episodeId, result.error ?? 'Extension download failed')
  return { ok: false, error: result.error }
}

export interface BatchTarget {
  animeId: string
  animeTitle: string
  poster: string
  episodeIdFor: (epNumber: number) => string
}

export interface BatchHandle {
  jobId: string
  cancel: () => Promise<void>
}

export interface BatchUpdateState {
  status: 'running' | 'completed' | 'cancelled'
  completedCount: number
  failedCount: number
  current?: { episode: number; message: string }
}

const PACE_MS = 6000

export async function startBatchDownload(
  target: BatchTarget,
  episodes: number[],
  quality: string,
  onEpisodeDone: (epNumber: number, ok: boolean, error?: string) => void,
  onBatchUpdate: (state: BatchUpdateState) => void
): Promise<BatchHandle> {
  const ext = await checkExtension()
  if (!ext.installed) {
    throw new Error('Install the Aurora Downloader first (Settings → Downloads)')
  }

  let cancelled = false
  const handle: BatchHandle = {
    jobId: `ext_${Date.now()}`,
    cancel: async () => {
      cancelled = true
    },
  }

  void (async () => {
    let completed = 0
    let failed = 0

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i]
      if (cancelled) break

      onBatchUpdate({
        status: 'running',
        completedCount: completed,
        failedCount: failed,
        current: { episode: ep, message: `Episode ${ep} — starting...` },
      })

      const result = await startSingleDownload(
        {
          episodeId: target.episodeIdFor(ep),
          animeId: target.animeId,
          animeTitle: target.animeTitle,
          episodeNumber: ep,
          poster: target.poster,
        },
        quality,
        (_stage, message) => {
          onBatchUpdate({
            status: 'running',
            completedCount: completed,
            failedCount: failed,
            current: { episode: ep, message: `Episode ${ep} — ${message}` },
          })
        }
      )
      if (result.ok) completed++
      else failed++
      onEpisodeDone(ep, result.ok, result.error)

      onBatchUpdate({
        status: 'running',
        completedCount: completed,
        failedCount: failed,
        current: undefined,
      })

      if (!cancelled && i < episodes.length - 1) {
        onBatchUpdate({
          status: 'running',
          completedCount: completed,
          failedCount: failed,
          current: { episode: episodes[i + 1], message: `Pacing before episode ${episodes[i + 1]}...` },
        })
        await new Promise((r) => setTimeout(r, PACE_MS))
      }
    }

    onBatchUpdate({
      status: cancelled ? 'cancelled' : 'completed',
      completedCount: completed,
      failedCount: failed,
      current: undefined,
    })
  })()

  return handle
}
