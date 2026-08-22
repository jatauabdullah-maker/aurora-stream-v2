import { Link } from 'react-router-dom'
import type { WatchProgress } from '../../types'
import { IconPlay, IconX } from '../common/Icons'
import { clearProgress } from '../../services/storage'
import { useApp } from '../../context/AppContext'
import { formatDuration } from '../../utils/helpers'

export default function ContinueWatchingRow({ items }: { items: WatchProgress[] }) {
  const { refreshProgress } = useApp()

  return (
    <section className="mt-10 px-4 md:px-10">
      <h2 className="text-lg md:text-xl font-bold tracking-tight mb-3">Continue Watching</h2>
      <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x">
        {items.map((p) => {
          const pct = p.durationSec > 0 ? Math.min(100, (p.positionSec / p.durationSec) * 100) : 0
          return (
            <div key={p.episodeId} className="snap-start shrink-0 w-64 sm:w-72 group relative">
              <Link to={`/watch/${p.animeId}/${p.episodeId}`} className="block">
                <div className="card-ring relative aspect-video rounded-xl overflow-hidden bg-surface2">
                  <img src={p.poster} alt={p.animeTitle} loading="lazy" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-brand/90 rounded-full p-2.5 shadow-lg">
                      <IconPlay width={18} height={18} />
                    </span>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                    <div className="h-full bg-gradient-to-r from-brand2 to-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="absolute bottom-2 right-2 glass rounded px-1.5 py-0.5 text-[10px] font-medium">
                    {formatDuration(p.durationSec - p.positionSec)} left
                  </div>
                </div>
              </Link>
              <div className="flex items-center justify-between mt-2 pr-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.animeTitle}</p>
                  <p className="text-[11px] text-muted">Episode {p.episodeNumber}</p>
                </div>
                <button
                  onClick={() => {
                    clearProgress(p.episodeId)
                    refreshProgress()
                  }}
                  className="text-muted hover:text-white p-1"
                  aria-label="Remove"
                >
                  <IconX width={14} height={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
