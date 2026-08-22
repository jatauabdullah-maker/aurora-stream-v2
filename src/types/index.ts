export interface AnimeSummary {
  id: string
  title: string
  poster: string
  banner?: string
  rating?: number
  year?: number
  type?: string // TV, Movie, OVA...
  status?: string // Ongoing, Completed
  genres?: string[]
  episodeCount?: number
  relationType?: string // SEQUEL, PREQUEL... (related titles only)
  justAiredEpisode?: number // latest aired episode (Just Aired row only)
}

export interface Episode {
  id: string
  number: number
  title?: string
  thumbnail?: string
  duration?: number // seconds
  season?: number
  airedAt?: string
}

export interface AnimeDetails extends AnimeSummary {
  synopsis?: string
  score?: number
  studio?: string
  trailerUrl?: string
  episodes: Episode[]
}

export interface StreamSource {
  url: string
  quality: string // "1080p" | "720p" ...
  type?: string // "mp4" | "hls" | "embed"
  sizeMB?: number
  referer?: string
}

export interface SubtitleTrack {
  url: string
  lang: string
  label: string
  default?: boolean
}

export interface StreamResponse {
  sources: StreamSource[]
  subtitles: SubtitleTrack[]
}

export interface SearchFilters {
  q?: string
  genre?: string
  year?: number
  status?: string
  page?: number
}

export interface PagedResult<T> {
  items: T[]
  page: number
  totalPages: number
}

export interface WatchProgress {
  episodeId: string
  animeId: string
  animeTitle: string
  poster: string
  episodeNumber: number
  positionSec: number
  durationSec: number
  updatedAt: number
}

export interface WatchlistItem {
  id: string
  title: string
  poster: string
  addedAt: number
}

export interface DownloadItem {
  id: string // episodeId
  animeId: string
  animeTitle: string
  episodeNumber: number
  poster: string
  quality: string
  url: string
  progress: number // 0-100
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'resolving'
  bytesTotal?: number
  bytesDone?: number
  blobId?: string
  error?: string
  createdAt: number
  resolverProgress?: {
    stage: 'searching' | 'found_anime' | 'finding_episode' | 'on_play_page' | 
           'solving_turnstile_animepahe' | 'on_pahewin' | 'solving_turnstile_kwik' | 
           'submitting_download' | 'complete' | 'error'
    message: string
  }
}

export interface Settings {
  preferredQuality: string
  autoplayNext: boolean
  downloadSubtitlesMerged: boolean
  maxConcurrentDownloads: number
}
