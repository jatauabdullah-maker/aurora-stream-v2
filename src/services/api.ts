import axios from 'axios'
import type {
  AnimeSummary,
  AnimeDetails,
  Episode,
  StreamResponse,
  SearchFilters,
  PagedResult,
  StreamSource,
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

export async function getStream(episodeId: string, options?: { animeTitle?: string; preferredQuality?: string }): Promise<StreamResponse> {
  if (http) {
    try {
      const { data } = await http.get(`/stream/${episodeId}`)
      if (data?.sources?.length) return data
    } catch {
      // fall through to resolver/embed fallback
    }
  }
  
  const parsed = parseEpisodeId(episodeId)
  if (parsed && resolverConfigured() && options?.animeTitle) {
    try {
      return await resolveStreamViaResolver(
        options.animeTitle,
        parsed.episode,
        options.preferredQuality || '1080p'
      )
    } catch {
      // fall through to embed fallback
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

export interface ResolveRequest {
  animeTitle: string
  episodeNumber: number
  preferredQuality?: string
}

export interface ResolveProgress {
  stage: 'searching' | 'found_anime' | 'finding_episode' | 'on_play_page' |
         'solving_turnstile_animepahe' | 'on_pahewin' | 'solving_turnstile_kwik' |
         'submitting_download' | 'complete' | 'error'
  message: string
  animeTitle: string
  episodeNumber: number
}

export interface ResolveResponse {
  success: boolean
  sources?: StreamSource[]
  subtitles?: { url: string; lang: string; label: string; default?: boolean }[]
  error?: string
  progress: ResolveProgress
}

export async function resolveStreamViaResolver(
  animeTitle: string,
  episodeNumber: number,
  preferredQuality: string,
  onProgress?: (progress: ResolveProgress) => void
): Promise<StreamResponse> {
  if (!resolverConfigured()) {
    throw Object.assign(new Error('NO_RESOLVER'), { code: 'NO_RESOLVER' })
  }
  
  // Start the resolve job
  const startResponse = await fetch(RESOLVER_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ animeTitle, episodeNumber, preferredQuality }),
  })
  
  if (!startResponse.ok) {
    throw Object.assign(new Error('RESOLVER_ERROR'), { code: 'RESOLVER_ERROR', status: startResponse.status })
  }
  
  const startData = await startResponse.json()
  const jobId = startData.jobId
  
  if (!jobId) {
    throw Object.assign(new Error('Invalid resolver response: no jobId'), { code: 'RESOLVER_NO_JOB_ID' })
  }
  
  // Poll for job completion
  const maxPolls = 120 // 10 minutes at 5s intervals
  let polls = 0
  
  while (polls < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, 5000))
    polls++
    
    const pollResponse = await fetch(`${RESOLVER_API}/${jobId}`)
    if (!pollResponse.ok) {
      throw Object.assign(new Error('RESOLVER_POLL_ERROR'), { code: 'RESOLVER_POLL_ERROR', status: pollResponse.status })
    }
    
    const jobData = await pollResponse.json()
    
    if (jobData.progress && onProgress) {
      onProgress(jobData.progress)
    }
    
    if (jobData.status === 'completed' && jobData.result) {
      const result = jobData.result
      if (!result.success || !result.sources?.length) {
        throw Object.assign(new Error(result.error || 'Resolver returned no sources'), { code: 'RESOLVER_NO_SOURCES' })
      }
      return {
        sources: result.sources,
        subtitles: result.subtitles || [],
      }
    }
    
    if (jobData.status === 'failed') {
      throw Object.assign(new Error(jobData.error || 'Resolver job failed'), { code: 'RESOLVER_JOB_FAILED' })
    }
  }
  
  throw Object.assign(new Error('Resolver timed out'), { code: 'RESOLVER_TIMEOUT' })
}

export function parseEpisodeIdForResolver(episodeId: string): { anilistId: string; episode: number } | null {
  const m = episodeId.match(/^al-(\d+)-e(\d+)$/)
  if (!m) return null
  return { anilistId: m[1], episode: Number(m[2]) }
}
