import { Link } from 'react-router-dom'
import type { AnimeSummary } from '../../types'
import { IconStar, IconPlay, IconPlus, IconCheck } from '../common/Icons'
import { useApp } from '../../context/AppContext'
import toast from 'react-hot-toast'

export default function AnimeCard({ anime, overlayList = true }: { anime: AnimeSummary; overlayList?: boolean }) {
  const { isInWatchlist, toggleWatchlist } = useApp()
  const inList = isInWatchlist(anime.id)
  const showOverlay = overlayList

  return (
    <div className="group relative w-full">
      <Link to={`/anime/${anime.id}`} className="block">
        <div className="card-ring relative aspect-[2/3] rounded-xl overflow-hidden bg-surface2">
          <img
            src={anime.poster}
            alt={anime.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {showOverlay && (
              <span className="bg-brand/90 rounded-full p-3 shadow-lg shadow-brand/40">
                <IconPlay width={22} height={22} />
              </span>
            )}
          </div>
          {anime.rating != null && (
            <div className="absolute top-2 left-2 glass rounded-md px-1.5 py-0.5 flex items-center gap-1 text-[11px] font-semibold">
              <IconStar width={11} height={11} className="text-yellow-400" />
              {anime.rating.toFixed(1)}
            </div>
          )}
          {anime.type && (
            <div className="absolute top-2 right-2 glass rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-brand">
              {anime.type}
            </div>
          )}
        </div>
      </Link>
      <div className="flex items-start justify-between gap-1 mt-2">
        <div className="min-w-0">
          <Link to={`/anime/${anime.id}`} className="block text-sm font-medium truncate hover:text-brand transition-colors">
            {anime.title}
          </Link>
          <p className="text-[11px] text-muted truncate">
            {[anime.year, anime.episodeCount ? `${anime.episodeCount} eps` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          onClick={() => {
            const added = toggleWatchlist({ id: anime.id, title: anime.title, poster: anime.poster, addedAt: Date.now() })
            toast.success(added ? 'Added to My List' : 'Removed from My List')
          }}
          className="mt-0.5 shrink-0 text-muted hover:text-white transition-colors"
          aria-label={inList ? 'Remove from list' : 'Add to list'}
        >
          {inList ? <IconCheck width={16} height={16} className="text-brand" /> : <IconPlus width={16} height={16} />}
        </button>
      </div>
    </div>
  )
}
