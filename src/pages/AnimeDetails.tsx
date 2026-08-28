import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { getAnime, getRelated } from '../services/api'
import { useApp } from '../context/AppContext'
import { useDownloads } from '../hooks/useDownloads'
import { getProgress } from '../services/storage'
import { formatDuration, classNames } from '../utils/helpers'
import AnimeRow from '../components/anime/AnimeRow'
import { BatchDownloadDialog } from '../components/common/BatchDownloadDialog'
import { DownloadDialog, DownloadFailureDialog } from '../components/common/DownloadDialog'
import { startBatchDownload, startSingleDownload, lowerQuality } from '../services/downloadOrchestrator'
import { isMobileDevice } from '../services/extension'
import {
  IconPlay, IconPlus, IconCheck, IconStar, IconDownload,
  IconChevronDown, IconBack, IconClock,
} from '../components/common/Icons'
import type { AnimeDetails as Details, Episode, AnimeSummary } from '../types'

export default function AnimeDetails() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [anime, setAnime] = useState<Details | null>(null)
  const [related, setRelated] = useState<AnimeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openSeason, setOpenSeason] = useState<number | null>(1)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchSeason, setBatchSeason] = useState<number | null>(null)
  const [batchProgress, setBatchProgress] = useState<{
    done: number
    failed: number
    total: number
    current?: { episode: number; message: string }
  } | null>(null)
  const [dlEpisode, setDlEpisode] = useState<Episode | null>(null)
  const [failure, setFailure] = useState<{ episode: Episode; quality: string; error: string } | null>(null)
  const { isInWatchlist, toggleWatchlist } = useApp()
  const { items: downloads } = useDownloads()

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    setRelated([])
    getAnime(id)
      .then((d) => {
        setAnime(d)
        const seasons = [...new Set(d.episodes.map((e) => e.season ?? 1))]
        setOpenSeason(seasons[0] ?? 1)
      })
      .catch(() => setError('Failed to load this title. Check your API connection.'))
      .finally(() => setLoading(false))
    getRelated(id).then(setRelated).catch(() => setRelated([]))
  }, [id])

  const seasons = useMemo(() => {
    if (!anime) return new Map<number, Episode[]>()
    const map = new Map<number, Episode[]>()
    for (const ep of anime.episodes) {
      const s = ep.season ?? 1
      if (!map.has(s)) map.set(s, [])
      map.get(s)!.push(ep)
    }
    for (const list of map.values()) list.sort((a, b) => a.number - b.number)
    return map
  }, [anime])

  if (loading) {
    return (
      <div className="-mt-16">
        <div className="skeleton h-[46vh] w-full" />
        <div className="px-4 md:px-10 mt-6 max-w-5xl mx-auto grid md:grid-cols-[220px_1fr] gap-8">
          <div className="skeleton aspect-[2/3] rounded-xl -mt-28 relative z-10" />
          <div className="space-y-3 pt-4">
            <div className="skeleton h-8 w-2/3 rounded" />
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-24 w-full rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !anime) {
    return (
      <div className="px-4 md:px-10 pt-24 max-w-xl mx-auto text-center">
        <div className="glass rounded-2xl p-10">
          <p className="text-muted text-sm">{error ?? 'Not found'}</p>
          <button onClick={() => navigate(-1)} className="mt-5 text-brand text-sm font-semibold">← Go back</button>
        </div>
      </div>
    )
  }

  const inList = isInWatchlist(anime.id)

  // Opens the quality/source picker for a single episode.
  const openEpisodeDownload = (ep: Episode) => {
    if (isMobileDevice()) {
      toast(
        'Streaming works great here — downloads need the Aurora Downloader on a desktop browser',
        { icon: '💻', duration: 4500 }
      )
      return
    }
    const existing = downloads.find((d) => d.id === ep.id)
    if (existing && ['pending', 'downloading', 'resolving', 'completed'].includes(existing.status)) {
      return toast(existing.status === 'completed' ? 'Already downloaded' : 'Already in your downloads', {
        icon: existing.status === 'completed' ? '✅' : '⏳',
      })
    }
    setDlEpisode(ep)
  }

  const runEpisodeDownload = async (ep: Episode, quality: string) => {
    setDlEpisode(null)
    setFailure(null)
    const result = await startSingleDownload(
      {
        episodeId: ep.id,
        animeId: anime.id,
        animeTitle: anime.title,
        episodeNumber: ep.number,
        poster: anime.poster,
      },
      quality
    )
    if (result.ok) {
      toast.success(`EP ${ep.number} downloaded — ready for offline watching`)
    } else {
      setFailure({ episode: ep, quality, error: result.error ?? 'Download failed' })
    }
  }

  const downloadSeason = (season: number) => {
    const eps = seasons.get(season) ?? []
    if (!eps.length) return
    setBatchSeason(season)
    setBatchOpen(true)
  }

  const startBatch = async (epNumbers: number[], quality: string) => {
    setBatchOpen(false)
    setDownloadingAll(true)
    setBatchProgress({ done: 0, failed: 0, total: epNumbers.length })

    const epIdMap = new Map<number, string>()
    for (const eps of seasons.values()) {
      for (const ep of eps) epIdMap.set(ep.number, ep.id)
    }

    try {
      await startBatchDownload(
        {
          animeId: anime.id,
          animeTitle: anime.title,
          poster: anime.poster,
          episodeIdFor: (n) => epIdMap.get(n) ?? `al-${anime.id.replace(/\D/g, '')}-e${n}`,
        },
        epNumbers,
        quality,
        (epNum, ok, error) => {
          setBatchProgress((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              done: prev.done + (ok ? 1 : 0),
              failed: prev.failed + (ok ? 0 : 1),
            }
          })
          if (!ok) toast.error(`EP ${epNum}: ${error ?? 'failed'}`, { duration: 3000 })
        },
        (state) => {
          if (state.current) {
            setBatchProgress((prev) => (prev ? { ...prev, current: state.current } : prev))
          } else if (['completed', 'failed', 'cancelled'].includes(state.status)) {
            setDownloadingAll(false)
            toast.success(
              `Batch finished: ${state.completedCount} downloaded${state.failedCount ? `, ${state.failedCount} failed` : ''}`,
              { duration: 5000 }
            )
            setTimeout(() => setBatchProgress(null), 4000)
          }
        }
      )
      toast.success(`Batch started: ${epNumbers.length} episodes at ${quality}`)
    } catch (err) {
      setDownloadingAll(false)
      setBatchProgress(null)
      toast.error(err instanceof Error ? err.message : 'Batch failed to start')
    }
  }

  const firstUnwatched = anime.episodes.find((e) => {
    const p = getProgress(e.id)
    return !p || p.positionSec < p.durationSec * 0.9
  })

  return (
    <div className="-mt-16">
      {/* Backdrop */}
      <div className="relative h-[46vh] min-h-[320px] w-full overflow-hidden">
        <img src={anime.banner || anime.poster} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 hero-fade" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/25 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 via-black/30 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 md:top-6 md:left-10 glass rounded-full p-2.5 hover:bg-white/15 z-10"
          aria-label="Back"
        >
          <IconBack width={18} height={18} />
        </button>
      </div>

      <div className="px-4 md:px-10 max-w-6xl mx-auto grid md:grid-cols-[230px_1fr] gap-6 md:gap-10">
        {/* Poster */}
        <div className="-mt-24 md:-mt-32 relative z-10 w-40 md:w-full">
          <img
            src={anime.poster}
            alt={anime.title}
            className="w-full aspect-[2/3] object-cover rounded-xl ring-1 ring-line shadow-2xl shadow-black/60"
          />
        </div>

        {/* Info */}
        <div className="pt-2 md:pt-4 min-w-0">
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">{anime.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-medium">
            {anime.score != null && (
              <span className="glass px-2 py-1 rounded-md flex items-center gap-1">
                <IconStar width={11} height={11} className="text-yellow-400" /> {anime.score.toFixed(1)}
              </span>
            )}
            {anime.year && <span className="glass px-2 py-1 rounded-md">{anime.year}</span>}
            {anime.type && <span className="glass px-2 py-1 rounded-md text-brand">{anime.type}</span>}
            {anime.status && <span className="glass px-2 py-1 rounded-md">{anime.status}</span>}
            {anime.episodeCount != null && (
              <span className="glass px-2 py-1 rounded-md flex items-center gap-1">
                <IconClock width={11} height={11} /> {anime.episodeCount} episodes
              </span>
            )}
          </div>
          {anime.genres && (
            <div className="flex flex-wrap gap-2 mt-3">
              {anime.genres.map((g) => (
                <Link
                  key={g}
                  to={`/search?genre=${encodeURIComponent(g)}`}
                  className="text-xs bg-surface2 border border-line rounded-full px-3 py-1 hover:border-brand/60 hover:text-brand transition-colors"
                >
                  {g}
                </Link>
              ))}
            </div>
          )}
          {anime.synopsis && <p className="text-sm text-muted leading-relaxed mt-4 max-w-3xl">{anime.synopsis}</p>}

          <div className="flex flex-wrap gap-3 mt-6">
            {firstUnwatched && (
              <Link
                to={`/watch/${anime.id}/${firstUnwatched.id}`}
                className="flex items-center gap-2 bg-gradient-to-r from-brand2 to-brand px-6 py-3 rounded-xl font-bold shadow-lg shadow-brand2/40 hover:scale-[1.03] transition-transform"
              >
                <IconPlay width={18} height={18} />
                {firstUnwatched.number === 1 ? 'Start Watching' : `Resume EP ${firstUnwatched.number}`}
              </Link>
            )}
            <button
              onClick={() => {
                const added = toggleWatchlist({ id: anime.id, title: anime.title, poster: anime.poster, addedAt: Date.now() })
                toast.success(added ? 'Added to My List' : 'Removed from My List')
              }}
              className="flex items-center gap-2 glass px-5 py-3 rounded-xl font-semibold hover:bg-white/15"
            >
              {inList ? <IconCheck width={18} height={18} /> : <IconPlus width={18} height={18} />}
              {inList ? 'In My List' : 'My List'}
            </button>
          </div>
        </div>
      </div>

      {/* Episodes */}
      <div className="px-4 md:px-10 max-w-6xl mx-auto mt-14">
        <h2 className="text-xl font-bold mb-4">Episodes</h2>
        <div className="space-y-3">
          {[...seasons.keys()].map((season) => {
            const eps = seasons.get(season) ?? []
            const open = openSeason === season
            return (
              <div key={season} className="glass rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <button
                    onClick={() => setOpenSeason(open ? null : season)}
                    className="flex items-center gap-3 font-semibold text-left"
                  >
                    <IconChevronDown
                      width={18} height={18}
                      className={classNames('transition-transform', open ? 'rotate-180' : '')}
                    />
                    {seasons.size > 1 ? `Season ${season}` : 'Episodes'}
                    <span className="text-muted text-xs font-normal">({eps.length})</span>
                  </button>
                  <button
                    onClick={() => downloadSeason(season)}
                    disabled={downloadingAll}
                    className="flex items-center gap-2 text-sm font-semibold text-brand hover:text-white glass px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
                  >
                    <IconDownload width={15} height={15} />
                    {downloadingAll ? 'Queueing...' : 'Download All'}
                  </button>
                </div>

                <AnimatePresence>
                  {open && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-t border-line"
                    >
                      {eps.map((ep) => {
                        const p = getProgress(ep.id)
                        const pct = p && p.durationSec > 0 ? Math.round((p.positionSec / p.durationSec) * 100) : 0
                        const dl = downloads.find((d) => d.id === ep.id)
                        return (
                          <li key={ep.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors border-b border-line/50 last:border-0">
                            <span className="text-muted text-sm font-mono w-8 shrink-0">{String(ep.number).padStart(2, '0')}</span>
                            {ep.thumbnail && (
                              <img src={ep.thumbnail} alt="" loading="lazy" className="hidden sm:block w-24 aspect-video object-cover rounded-lg" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{ep.title ?? `Episode ${ep.number}`}</p>
                              <div className="flex items-center gap-2 text-[11px] text-muted">
                                {ep.duration != null && <span>{formatDuration(ep.duration)}</span>}
                                {pct > 0 && <span className="text-brand">• {pct}% watched</span>}
                                {dl?.status === 'completed' && <span className="text-emerald-400">• {dl.external ? 'In Downloads folder' : 'Downloaded'}</span>}
                                {dl?.status === 'downloading' && <span className="text-brand">• {dl.progress}%</span>}
                              </div>
                              {pct > 0 && (
                                <div className="w-24 h-0.5 bg-white/10 rounded mt-1">
                                  <div className="h-full bg-brand rounded" style={{ width: `${pct}%` }} />
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => openEpisodeDownload(ep)}
                              className="text-muted hover:text-brand p-2 transition-colors"
                              aria-label={`Download episode ${ep.number}`}
                            >
                              <IconDownload width={17} height={17} />
                            </button>
                            <Link
                              to={`/watch/${anime.id}/${ep.id}`}
                              className="shrink-0 glass rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                            >
                              Play
                            </Link>
                          </li>
                        )
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>

      {related.length > 0 && (
        <div className="max-w-6xl mx-auto">
          <AnimeRow title="Related Titles" items={related} />
        </div>
      )}

      {batchProgress && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-40 glass rounded-2xl px-5 py-4 shadow-2xl min-w-[260px] max-w-[300px] border border-white/10 ring-1 ring-white/5 backdrop-blur-xl">
          <p className="text-sm font-bold flex items-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
            Batch download
          </p>
          <p className="text-xs text-brand mt-1 truncate">
            {batchProgress.current?.message ?? `${batchProgress.done} ready · ${batchProgress.failed} failed`}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            {batchProgress.done} done · {batchProgress.failed} failed · {batchProgress.total} total
          </p>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-brand2 to-brand rounded-full transition-all"
              style={{
                width: `${Math.round(((batchProgress.done + batchProgress.failed) / Math.max(1, batchProgress.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <BatchDownloadDialog
        open={batchOpen}
        animeTitle={anime.title}
        poster={anime.poster}
        episodeNumbers={(batchSeason != null ? seasons.get(batchSeason) : anime.episodes)?.map((e) => e.number) ?? []}
        onClose={() => setBatchOpen(false)}
        onStart={(eps, q) => void startBatch(eps, q)}
      />

      <DownloadDialog
        open={!!dlEpisode}
        animeTitle={anime.title}
        episodeLabel={dlEpisode ? `Episode ${dlEpisode.number}` : ''}
        episodeNumber={dlEpisode?.number}
        poster={anime.poster}
        onClose={() => setDlEpisode(null)}
        onStart={(q) => {
          if (dlEpisode) void runEpisodeDownload(dlEpisode, q)
        }}
      />

      <DownloadFailureDialog
        open={!!failure}
        animeTitle={anime.title}
        episodeLabel={failure ? `Episode ${failure.episode.number}` : ''}
        quality={failure?.quality ?? ''}
        error={failure?.error ?? ''}
        onClose={() => setFailure(null)}
        onRetry={() => {
          if (!failure) return
          const { episode, quality } = failure
          setFailure(null)
          void runEpisodeDownload(episode, quality)
        }}
        onLowerQuality={
          failure && lowerQuality(failure.quality)
            ? () => {
                if (!failure) return
                const lower = lowerQuality(failure.quality)
                const { episode } = failure
                setFailure(null)
                if (lower) void runEpisodeDownload(episode, lower)
              }
            : null
        }
      />
    </div>
  )
}
