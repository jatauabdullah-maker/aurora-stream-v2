import {
  resolveStreamViaResolver,
  startBatchResolve,
  pollBatchJob,
  cancelBatchJob,
  toDownloadUrl,
  resolverConfigured,
  type ResolvedSource,
  type BatchJobState,
} from './api'
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

function anilistIdFrom(id: string): number | undefined {
  const m = id.match(/(\d+)/)
  return m ? Number(m[1]) : undefined
}

export async function startSingleDownload(
  target: SingleDownloadTarget,
  quality: string,
  onProgress?: (stage: string, message: string) => void
): Promise<{ ok: boolean; error?: string; source?: ResolvedSource; noMethod?: boolean }> {
  // clean up a previous failed attempt so retry starts fresh
  const existing = downloadEngine.getSnapshot().find((d) => d.id === target.episodeId)
  if (existing && existing.status === 'error') {
    await downloadEngine.remove(target.episodeId)
  }

  // 1. Aurora Downloader extension (runs in the user's browser — no server needed)
  const ext = await checkExtension()
  if (ext.installed) {
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

  // 2. Server-side resolver
  if (!resolverConfigured()) {
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

  try {
    const resolved = await resolveStreamViaResolver(
      target.animeTitle,
      anilistIdFrom(target.animeId),
      target.episodeNumber,
      quality,
      (p) => {
        downloadEngine.updateResolverProgress(target.episodeId, { stage: p.stage, message: p.message })
        onProgress?.(p.stage, p.message)
      }
    )
    const source = resolved.sources[0]
    downloadEngine.markResolved(target.episodeId, toDownloadUrl(source), source.quality)
    return { ok: true, source }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resolve failed'
    downloadEngine.markResolveError(target.episodeId, msg)
    return { ok: false, error: msg }
  }
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

export async function startBatchDownload(
  target: BatchTarget,
  episodes: number[],
  quality: string,
  onEpisodeResolved: (epNumber: number, ok: boolean, error?: string) => void,
  onBatchUpdate: (state: BatchJobState) => void
): Promise<BatchHandle> {
  if (!resolverConfigured()) {
    throw new Error('Download service not configured. Set VITE_RESOLVER_API.')
  }

  const jobId = await startBatchResolve(target.animeTitle, anilistIdFrom(target.animeId), episodes, quality)
  const reported = new Set<number>()

  const poll = async () => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 4000))
      let state: BatchJobState
      try {
        state = await pollBatchJob(jobId)
      } catch {
        continue
      }
      onBatchUpdate(state)

      for (const ep of state.episodes) {
        if (reported.has(ep.episodeNumber)) continue
        if (ep.status === 'completed' && ep.result?.sources?.length) {
          reported.add(ep.episodeNumber)
          const source = ep.result.sources[0]
          const epId = target.episodeIdFor(ep.episodeNumber)
          const exists = downloadEngine.getSnapshot().some((d) => d.id === epId)
          if (!exists) {
            downloadEngine.add({
              id: epId,
              animeId: target.animeId,
              animeTitle: target.animeTitle,
              episodeNumber: ep.episodeNumber,
              poster: target.poster,
              quality: source.quality,
              url: toDownloadUrl(source),
            })
          }
          onEpisodeResolved(ep.episodeNumber, true)
        } else if (ep.status === 'failed') {
          reported.add(ep.episodeNumber)
          onEpisodeResolved(ep.episodeNumber, false, ep.result?.error)
        }
      }

      if (['completed', 'failed', 'cancelled'].includes(state.status)) break
    }
  }

  void poll()

  return {
    jobId,
    cancel: () => cancelBatchJob(jobId),
  }
}
