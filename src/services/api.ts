import axios from 'axios'
import type {
  AnimeSummary,
  AnimeDetails,
  Episode,
  StreamResponse,
  SearchFilters,
  PagedResult,
} from '../types'
import {
  alTrending,
  alPopular,
  alNewReleases,
  alSearch,
  alGenres,
  alAnime,
  alEpisodes,
  alJustAired,
  alRelated,
} from './anilist'

/**
 * Architecture:
 *   - Catalog / search / anime details / episodes come from AniList (free, legal,
 *     no API key). Always works.
 *   - Stream sources come from YOUR backend via VITE_API_BASE_URL.
 *     If no backend is set, getStream() rejects and the Watch page shows a
 *     graceful trailer fallback instead.
 */

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export const http = BASE
  ? axios.create({ baseURL: BASE, timeout: 15000 })
  : null

export function backendConfigured(): boolean {
  return BASE.trim() !== ''
}

// ─── Catalog (AniList-first; can be overridden by your backend) ────────────

async function maybeBackend<T>(path: string): Promise<T | null> {
  if (!http) return null
  try {
    return (await http.get(path)).data as T
  } catch {
    return null
  }
}

export async function getTrending(): Promise<AnimeSummary[]> {
  return (await maybeBackend('/trending')) ?? (await alTrending())
}
export async function getPopular(): Promise<AnimeSummary[]> {
  return (await maybeBackend('/popular')) ?? (await alPopular())
}
export async function getRecent(): Promise<AnimeSummary[]> {
  return (await maybeBackend('/recent')) ?? (await alNewReleases())
}

export async function getJustAired(): Promise<AnimeSummary[]> {
  return alJustAired()
}

export async function getRelated(id: string): Promise<AnimeSummary[]> {
  return alRelated(id)
}

export async function searchAnime(filters: SearchFilters): Promise<PagedResult<AnimeSummary>> {
  const viaBackend = await maybeBackend<{ items: AnimeSummary[]; page: number; totalPages: number } | AnimeSummary[]>(
    `/search?${new URLSearchParams(
      Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
      ) as Record<string, string>
    )}`
  )
  if (viaBackend) {
    if (Array.isArray(viaBackend)) return { items: viaBackend, page: 1, totalPages: 1 }
    return viaBackend
  }
  return alSearch(filters)
}

export async function getGenres(): Promise<string[]> {
  return (await maybeBackend('/genres')) ?? (await alGenres())
}

export async function getAnime(id: string): Promise<AnimeDetails> {
  const viaBackend = await maybeBackend<AnimeDetails>(`/anime/${id}`)
  if (viaBackend) return viaBackend
  return alAnime(id)
}

export async function getEpisodes(id: string): Promise<Episode[]> {
  const viaBackend = await maybeBackend<Episode[]>(`/anime/${id}/episodes`)
  if (viaBackend) return viaBackend
  return alEpisodes(id)
}

// ─── Streams (backend first, embed fallback) ────────────────────────────────

/**
 * Episode IDs from the AniList layer look like `al-<anilistId>-e<num>`.
 * Those map deterministically to third-party embed players that need no
 * scraping, no keys, and work inside an iframe.
 */
export function parseEpisodeId(episodeId: string): { anilistId: string; episode: number } | null {
  const m = episodeId.match(/^al-(\d+)-e(\d+)$/)
  if (!m) return null
  return { anilistId: m[1], episode: Number(m[2]) }
}

export function embedSourceForEpisode(episodeId: string): StreamResponse | null {
  const parsed = parseEpisodeId(episodeId)
  if (!parsed) return null
  const { anilistId, episode } = parsed
  return {
    sources: [
      {
        url: `https://tryembed.us.cc/embed/anime/${anilistId}/${episode}/sub`,
        quality: '1080p',
        type: 'embed',
      },
      {
        url: `https://tryembed.us.cc/embed/anime/${anilistId}/${episode}/dub`,
        quality: '1080p Dub',
        type: 'embed',
      },
    ],
    subtitles: [],
  }
}

export async function getStream(episodeId: string, _options?: { animeTitle?: string; preferredQuality?: string }): Promise<StreamResponse> {
  if (http) {
    try {
      const { data } = await http.get(`/stream/${episodeId}`)
      if (data?.sources?.length) return data
    } catch {
      // fall through to resolver/embed fallback
    }
  }
  
  const embed = embedSourceForEpisode(episodeId)
  if (embed) return embed
  throw Object.assign(new Error('NO_BACKEND'), { code: 'NO_BACKEND' })
}

/**
 * Optional hook for sources that legitimately require user sign-in / consent.
 */
export async function verifySession(): Promise<boolean> {
  if (!http) return true
  try {
    const { data } = await http.get('/session')
    return data?.ok === true
  } catch {
    return true
  }
}

// ─── Resolver Integration (AnimePahe → direct MP4) ────────────────────────────

const RESOLVER_API = (import.meta.env.VITE_RESOLVER_API as string | undefined) ?? ''

export function resolverConfigured(): boolean {
  return RESOLVER_API.trim() !== ''
}

function resolverBase(): string {
  return RESOLVER_API.replace(/\/api\/resolve-stream\/?$/, '').replace(/\/$/, '')
}

export interface ResolveRequest {
  animeTitle: string
  anilistId?: number
  episodeNumber: number
  preferredQuality?: string
}

export type ResolverStage =
  | 'queued' | 'searching' | 'found_anime' | 'finding_episode' | 'on_play_page'
  | 'solving_protection' | 'on_redirect' | 'resolving_link' | 'downloading' | 'complete' | 'error'

export interface ResolveProgress {
  stage: ResolverStage
  message: string
  animeTitle: string
  episodeNumber: number
}

export interface ResolvedSource {
  url: string
  quality: string
  type: string
  referer?: string
  filename?: string
  sizeMB?: number
}

export interface ResolveResponse {
  success: boolean
  sources?: ResolvedSource[]
  availableQualities?: string[]
  subtitles?: { url: string; lang: string; label: string; default?: boolean }[]
  error?: string
  fromCache?: boolean
  progress: ResolveProgress
}

export interface BatchEpisodeStatus {
  episodeNumber: number
  status: 'pending' | 'resolving' | 'completed' | 'failed' | 'cancelled'
  progress?: ResolveProgress
  result?: {
    episodeNumber: number
    success: boolean
    sources?: ResolvedSource[]
    availableQualities?: string[]
    error?: string
    fromCache?: boolean
  }
}

export interface BatchJobState {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  episodes: BatchEpisodeStatus[]
  completedCount: number
  failedCount: number
  error?: string
}

const IP_LOCKED_HOSTS = /owocdn\.top|uwocdn\.top|uwucdn\.top|kwik\.cx|pahe\.win/i

export function toDownloadUrl(source: ResolvedSource): string {
  if (source.url.startsWith('/')) {
    return `${resolverBase()}${source.url}`
  }
  if (resolverConfigured() && IP_LOCKED_HOSTS.test(source.url)) {
    const base = resolverBase()
    const params = new URLSearchParams({ url: source.url })
    if (source.referer) params.set('referer', source.referer)
    return `${base}/api/file?${params.toString()}`
  }
  return source.url
}

export function directReferer(source: ResolvedSource): string | undefined {
  return IP_LOCKED_HOSTS.test(source.url) ? undefined : source.referer
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${resolverBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw Object.assign(new Error(data.error || `Resolver error ${res.status}`), {
      code: 'RESOLVER_ERROR',
      status: res.status,
    })
  }
  return (await res.json()) as T
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${resolverBase()}${path}`)
  if (!res.ok) {
    throw Object.assign(new Error(`Resolver error ${res.status}`), {
      code: 'RESOLVER_POLL_ERROR',
      status: res.status,
    })
  }
  return (await res.json()) as T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function resolveStreamViaResolver(
  animeTitle: string,
  anilistId: number | undefined,
  episodeNumber: number,
  preferredQuality: string,
  onProgress?: (progress: ResolveProgress) => void,
  signal?: AbortSignal
): Promise<{ sources: ResolvedSource[]; availableQualities: string[]; fromCache?: boolean }> {
  if (!resolverConfigured()) {
    throw Object.assign(new Error('NO_RESOLVER'), { code: 'NO_RESOLVER' })
  }

  const { jobId } = await postJson<{ jobId: string }>('/api/resolve-stream', {
    animeTitle,
    anilistId,
    episodeNumber,
    preferredQuality,
  })

  const maxPolls = 120
  for (let i = 0; i < maxPolls; i++) {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' })
    await sleep(3000)

    const job = await getJson<{
      status: string
      progress?: ResolveProgress
      result?: ResolveResponse
      error?: string
    }>(`/api/resolve-stream/${jobId}`)

    if (job.progress && onProgress) onProgress(job.progress)

    if (job.status === 'completed' && job.result) {
      if (!job.result.success || !job.result.sources?.length) {
        throw Object.assign(new Error(job.result.error || 'No sources found'), {
          code: 'RESOLVER_NO_SOURCES',
          availableQualities: job.result.availableQualities,
        })
      }
      return {
        sources: job.result.sources,
        availableQualities: job.result.availableQualities ?? [],
        fromCache: job.result.fromCache,
      }
    }
    if (job.status === 'failed') {
      throw Object.assign(new Error(job.error || 'Resolver failed'), { code: 'RESOLVER_JOB_FAILED' })
    }
  }
  throw Object.assign(new Error('Resolver timed out'), { code: 'RESOLVER_TIMEOUT' })
}

export async function startBatchResolve(
  animeTitle: string,
  anilistId: number | undefined,
  episodes: number[],
  preferredQuality: string
): Promise<string> {
  if (!resolverConfigured()) {
    throw Object.assign(new Error('NO_RESOLVER'), { code: 'NO_RESOLVER' })
  }
  const { jobId } = await postJson<{ jobId: string }>('/api/resolve-batch', {
    animeTitle,
    anilistId,
    episodes,
    preferredQuality,
  })
  return jobId
}

export async function pollBatchJob(jobId: string): Promise<BatchJobState> {
  return getJson<BatchJobState>(`/api/resolve-batch/${jobId}`)
}

export async function cancelBatchJob(jobId: string): Promise<void> {
  await postJson(`/api/resolve-batch/${jobId}/cancel`, {})
}

export function parseEpisodeIdForResolver(episodeId: string): { anilistId: string; episode: number } | null {
  const m = episodeId.match(/^al-(\d+)-e(\d+)$/)
  if (!m) return null
  return { anilistId: m[1], episode: Number(m[2]) }
}
