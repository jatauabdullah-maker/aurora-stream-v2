import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import VideoPlayer from '../components/player/VideoPlayer'
import { getAnime, getStream, getEpisodes, backendConfigured } from '../services/api'
import { useApp } from '../context/AppContext'
import { useProgressTracker } from '../hooks/usePlayer'
import { formatDuration, formatBytes, classNames } from '../utils/helpers'
import { IconBack, IconChevronLeft, IconChevronRight, IconDownload } from '../components/common/Icons'
import { DownloadDialog, DownloadFailureDialog } from '../components/common/DownloadDialog'
import { useDownloads } from '../hooks/useDownloads'
import { downloadEngine } from '../services/downloads'
import { startSingleDownload, lowerQuality } from '../services/downloadOrchestrator'
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

  useEffect(() => {
    if (!episodeId) return
    setStream(null)
    setOfflineUrl(null)

    const dl = downloadEngine.getSnapshot().find((d) => d.id === episodeId && d.status === 'completed')
    if (dl) {
      downloadEngine.getBlob(dl.id).then((blob) => {
        if (blob) setOfflineUrl(URL.createObjectURL(blob))
      })
    }

    getStream(episodeId, { animeTitle: anime?.title, preferredQuality: settings.preferredQuality })
      .then(setStream)
      .catch((err) => {
        if (!dl) {
          if (err?.code === 'NO_BACKEND' || !backendConfigured()) {
            setError('NO_SOURCE')
          } else if (err?.code === 'NO_RESOLVER') {
            setError('NO_SOURCE')
          } else {
            setError('Stream unavailable for this episode.')
          }
        }
      })
  }, [episodeId])

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
      toast.success(`EP ${episode.number}: ${result.source?.filename ?? 'saved to Downloads'}`)
    } else {
      setFailure({ quality, error: result.error ?? 'Download failed' })
    }
  }

  const downloadCurrent = () => {
    if (!anime || !episode) return
    const existing = downloads.find((d) => d.id === episode.id)
    if (existing?.status === 'completed') {
      return toast('Already downloaded', { icon: '✅' })
    }
    if (existing && ['pending', 'downloading', 'resolving'].includes(existing.status)) {
      return toast('Already in your downloads', { icon: '⏳' })
    }
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
            onClick={downloadCurrent}
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
    </div>
  )
}
