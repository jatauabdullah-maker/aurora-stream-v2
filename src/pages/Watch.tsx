import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import VideoPlayer from '../components/player/VideoPlayer'
import { getAnime, getStream, getEpisodes, backendConfigured } from '../services/api'
import { useApp } from '../context/AppContext'
import { useProgressTracker } from '../hooks/usePlayer'
import { formatDuration, formatBytes, classNames } from '../utils/helpers'
import { IconBack, IconChevronLeft, IconChevronRight, IconDownload } from '../components/common/Icons'
import { DownloadDialog, DownloadFailureDialog, NoDownloadMethodDialog } from '../components/common/DownloadDialog'
import { useDownloads } from '../hooks/useDownloads'
import { downloadEngine } from '../services/downloads'
import { startSingleDownload, lowerQuality } from '../services/downloadOrchestrator'
import { isMobileDevice, checkExtension } from '../services/extension'
import toast from 'react-hot-toast'
import type { AnimeDetails, Episode, StreamResponse } from '../types'

export default function Watch() {
  const { id, episodeId } = useParams<{ id: string; episodeId: string }>()
  const navigate = useNavigate()
  const [anime, setAnime] = useState<AnimeDetails | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [stream, setStream] = useState<StreamResponse | null>(null)
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { settings } = useApp()
  const { items: downloads } = useDownloads()
  const [dlDialogOpen, setDlDialogOpen] = useState(false)
  const [failure, setFailure] = useState<{ quality: string; error: string } | null>(null)
  const [noMethod, setNoMethod] = useState(false)
  
  const episode = useMemo(() => episodes.find((e) => e.id === episodeId), [episodes, episodeId])
  const { track, getInitialPosition } = useProgressTracker(anime, episode ?? null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    Promise.all([getAnime(id), getEpisodes(id)])
      .then(([a, eps]) => {
        setAnime(a)
        const sorted = [...eps].sort((x, y) => (x.season ?? 1) - (y.season ?? 1) || x.number - y.number)
        setEpisodes(sorted)
      })
      .catch(() => setError('Failed to load this title.'))
      .finally(() => setLoading(false))
  }, [id])

  const animeTitle = anime?.title
  const preferredQuality = settings.preferredQuality

  useEffect(() => {
    if (!episodeId) return
    // Wait for the title — resolvers match episodes by anime title, so firing
    // before it loads produces a wrong (or failed) lookup.
    if (!animeTitle) return

    let live = true
    setStream(null)
    setOfflineUrl(null)
    setError(null)

    const dl = downloadEngine.getSnapshot().find((d) => d.id === episodeId && d.status === 'completed')
    if (dl) {
      downloadEngine.getBlob(dl.id).then((blob) => {
        if (live && blob) setOfflineUrl(URL.createObjectURL(blob))
      })
    }

    getStream(episodeId, { animeTitle, preferredQuality })
      .then((s) => {
        if (live) setStream(s)
      })
      .catch((err) => {
        if (!live || dl) return
        if (err?.code === 'NO_BACKEND' || err?.code === 'NO_RESOLVER' || !backendConfigured()) {
          setError('NO_SOURCE')
        } else {
          setError('Stream unavailable for this episode.')
        }
      })

    return () => {
      live = false
    }
  }, [episodeId, animeTitle, preferredQuality])

  useEffect(() => {
    return () => {
      if (offlineUrl) URL.revokeObjectURL(offlineUrl)
    }
  }, [offlineUrl])

  const idx = episodes.findIndex((e) => e.id === episodeId)
  const prev = idx > 0 ? episodes[idx - 1] : null
  const next = idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : null

  const effectiveStream: StreamResponse | null = offlineUrl
    ? { sources: [{ url: offlineUrl, quality: 'offline' }], subtitles: stream?.subtitles ?? [] }
    : stream

  const runDownload = async (quality: string) => {
    if (!anime || !episode) return
    setDlDialogOpen(false)
    setFailure(null)

    const result = await startSingleDownload(
      {
        episodeId: episode.id,
        animeId: anime.id,
        animeTitle: anime.title,
        episodeNumber: episode.number,
        poster: anime.poster,
      },
      quality
    )

    if (result.ok) {
      toast.success(`EP ${episode.number} downloaded — ready for offline watching`)
    } else if (result.noMethod) {
      setNoMethod(true)
    } else {
      setFailure({ quality, error: result.error ?? 'Download failed' })
    }
  }

  const downloadCurrent = async () => {
    if (!anime || !episode) return
    if (isMobileDevice()) {
      toast(
        'Streaming works great here — downloads need the Aurora Downloader on a desktop browser',
        { icon: '💻', duration: 4500 }
      )
      return
    }
    const existing = downloads.find((d) => d.id === episode.id)
    if (existing?.status === 'completed') {
      return toast('Already downloaded', { icon: '✅' })
    }
    if (existing && ['pending', 'downloading', 'resolving'].includes(existing.status)) {
      return toast('Already in your downloads', { icon: '⏳' })
    }

    // Surface the setup dialog before opening the picker — otherwise inspection
    // fails with a low-level error and never explains what's actually missing.
    const ext = await checkExtension()
    if (!ext.installed) return setNoMethod(true)

    setDlDialogOpen(true)
  }

  const retryFailure = () => {
    if (!failure) return
    const q = failure.quality
    setFailure(null)
    void runDownload(q)
  }

  const tryLowerQuality = () => {
    if (!failure) return
    const lower = lowerQuality(failure.quality)
    setFailure(null)
    if (lower) void runDownload(lower)
  }

  if (loading) {
    return (
      <div className="px-4 md:px-10 pt-24 max-w-6xl mx-auto">
        <div className="skeleton aspect-video w-full rounded-xl" />
        <div className="skeleton h-7 w-1/2 rounded mt-4" />
      </div>
    )
  }

  return (
    <div className="px-4 md:px-10 pt-24 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <button
          onClick={() => navigate(`/anime/${id}`)}
          className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
        >
          <IconBack width={16} height={16} /> Back to {anime?.title ?? 'details'}
        </button>
        {error === 'NO_SOURCE' && (
          <Link to="/settings" className="text-xs text-brand hover:text-white transition-colors">
            Configure source →
          </Link>
        )}
      </div>

      {effectiveStream && (effectiveStream.sources?.length ?? 0) > 0 ? (
        <VideoPlayer
          sources={effectiveStream.sources}
          subtitles={effectiveStream.subtitles}
          poster={episode?.thumbnail ?? anime?.banner ?? anime?.poster}
          startAt={getInitialPosition()}
          preferredQuality={settings.preferredQuality}
          onTimeUpdate={track}
          onEnded={() => {
            if (settings.autoplayNext && next && id) navigate(`/watch/${id}/${next.id}`)
          }}
        />
      ) : error === 'NO_SOURCE' ? (
        <div className="glass rounded-xl overflow-hidden">
          {anime?.trailerUrl ? (
            <div className="aspect-video w-full bg-black">
              <iframe
                src={`${anime.trailerUrl}?rel=0&modestbranding=1`}
                title="Trailer"
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="aspect-video flex flex-col items-center justify-center p-8 text-center bg-surface2">
              <p className="text-muted text-sm max-w-md leading-relaxed">
                No streaming source is connected for this title.
                <br />
                <span className="text-xs mt-2 block">
                  Episodes play from your own backend — set <code className="text-brand">VITE_API_BASE_URL</code> to enable playback.
                </span>
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="glass rounded-xl aspect-video flex items-center justify-center">
          <p className="text-muted text-sm px-6 text-center">{error ?? 'Loading stream…'}</p>
        </div>
      )}

      {error === 'NO_SOURCE' && anime?.trailerUrl && (
        <p className="text-xs text-muted mt-2">
          Showing official trailer — connect your content backend (<code>VITE_API_BASE_URL</code>) for full episodes.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">
            {anime?.title}
            {episode && <span className="text-brand"> · EP {episode.number}</span>}
          </h1>
          {episode?.title && <p className="text-sm text-muted truncate mt-1">{episode.title}</p>}
        </div>
        <div className="flex items-center gap-2">
          {prev && (
            <Link to={`/watch/${id}/${prev.id}`} className="flex items-center gap-1.5 glass px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/15">
              <IconChevronLeft width={16} height={16} /> Prev
            </Link>
          )}
          <button
            onClick={() => void downloadCurrent()}
            disabled={!anime || !episode}
            className="flex items-center gap-1.5 glass px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
          >
            <IconDownload width={16} height={16} />
            {downloads.find((d) => d.id === episodeId)?.status === 'completed' ? 'Downloaded' : 'Download'}
          </button>
          {next && (
            <Link to={`/watch/${id}/${next.id}`} className="flex items-center gap-1.5 bg-gradient-to-r from-brand2 to-brand px-4 py-2.5 rounded-xl text-sm font-bold">
              Next <IconChevronRight width={16} height={16} />
            </Link>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts hint — desktop only */}
      <div className="hidden md:block mt-3 text-center">
        <p className="text-[11px] text-muted/60 select-none">
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono">Space</kbd> play/pause{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono">←</kbd>{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono">→</kbd> seek 10s
        </p>
      </div>

      {stream && (stream.sources?.length ?? 0) > 0 && !offlineUrl && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          {stream.sources.map((s) => (
            <span key={s.url} className={classNames('glass px-2 py-1 rounded-md', s.quality === settings.preferredQuality && 'text-brand')}>
              {s.quality}
              {s.sizeMB ? ` · ${formatBytes(s.sizeMB * 1024 * 1024)}` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Episode rail */}
      {episodes.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold mb-3">All Episodes</h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {episodes.map((ep) => (
              <Link
                key={ep.id}
                to={`/watch/${id}/${ep.id}`}
                title={ep.title ?? `Episode ${ep.number}`}
                className={classNames(
                  'rounded-lg py-3 text-center text-sm font-semibold transition-colors border',
                  ep.id === episodeId
                    ? 'bg-gradient-to-br from-brand2 to-brand border-transparent'
                    : 'bg-surface2 border-line hover:border-brand/60'
                )}
              >
                {ep.duration != null && ep.id === episodeId
                  ? formatDuration(ep.duration)
                  : ep.number}
              </Link>
            ))}
          </div>
        </div>
      )}

      <DownloadDialog
        open={dlDialogOpen}
        animeTitle={anime?.title ?? ''}
        episodeLabel={episode ? `Episode ${episode.number}` : ''}
        episodeNumber={episode?.number}
        poster={anime?.poster}
        onClose={() => setDlDialogOpen(false)}
        onStart={(q) => void runDownload(q)}
      />

      <DownloadFailureDialog
        open={!!failure}
        animeTitle={anime?.title ?? ''}
        episodeLabel={episode ? `Episode ${episode.number}` : ''}
        quality={failure?.quality ?? ''}
        error={failure?.error ?? ''}
        onClose={() => setFailure(null)}
        onRetry={retryFailure}
        onLowerQuality={failure && lowerQuality(failure.quality) ? tryLowerQuality : null}
      />

      <NoDownloadMethodDialog
        open={noMethod}
        isMobile={isMobileDevice()}
        onClose={() => setNoMethod(false)}
        onOpenSettings={() => navigate('/settings')}
      />

      {(() => {
        const active = downloads.find(
          (d) => d.id === episodeId && (d.status === 'resolving' || d.status === 'downloading' || d.status === 'pending')
        )
        if (!active) return null
        return (
          <div className="fixed bottom-20 md:bottom-6 right-4 z-40 glass rounded-2xl px-5 py-4 shadow-2xl min-w-[240px] border border-white/10 ring-1 ring-white/5 backdrop-blur-xl">
            <p className="text-sm font-bold flex items-center gap-2">
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              Downloading EP {active.episodeNumber}
            </p>
            <p className="text-xs text-muted mt-1 truncate max-w-[220px]">
              {active.resolverProgress?.message ?? (active.status === 'downloading' ? `${active.progress}%` : 'Preparing...')}
            </p>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-gradient-to-r from-brand2 to-brand rounded-full transition-all"
                style={{ width: `${Math.max(4, active.progress)}%` }}
              />
            </div>
          </div>
        )
      })()}
    </div>
  )
}
