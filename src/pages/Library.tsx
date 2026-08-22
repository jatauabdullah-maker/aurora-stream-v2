import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatDuration } from '../utils/helpers'
import { IconLibrary, IconClock, IconStar, IconX } from '../components/common/Icons'
import toast from 'react-hot-toast'

type Tab = 'list' | 'continue' | 'history'

export default function Library() {
  const { watchlist, toggleWatchlist, continueWatching, history, refreshProgress } = useApp()
  const [tab, setTab] = useState<Tab>('list')

  useEffect(() => {
    refreshProgress()
  }, [refreshProgress])

  return (
    <div className="px-4 md:px-10 pt-24 max-w-[1400px] mx-auto">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">My Library</h1>

      <div className="flex gap-2 mt-5">
        {(
          [
            { key: 'list', label: `My List (${watchlist.length})` },
            { key: 'continue', label: `Continue (${continueWatching.length})` },
            { key: 'history', label: 'History' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'bg-gradient-to-r from-brand2 to-brand px-4 py-2 rounded-full text-sm font-bold'
                : 'glass px-4 py-2 rounded-full text-sm font-semibold text-muted hover:text-white transition-colors'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === 'list' &&
          (watchlist.length === 0 ? (
            <Empty icon={<IconLibrary width={40} height={40} />} text="Your list is empty. Add anime from the home page or search." />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {watchlist.map((w) => (
                <div key={w.id} className="group relative">
                  <Link to={`/anime/${w.id}`}>
                    <div className="card-ring aspect-[2/3] rounded-xl overflow-hidden bg-surface2">
                      <img src={w.poster} alt={w.title} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-sm font-medium truncate mt-2">{w.title}</p>
                  </Link>
                  <button
                    onClick={() => {
                      toggleWatchlist(w)
                      toast.success('Removed from My List')
                    }}
                    className="absolute top-2 right-2 glass rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-accent"
                    aria-label="Remove"
                  >
                    <IconX width={13} height={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}

        {tab === 'continue' &&
          (continueWatching.length === 0 ? (
            <Empty icon={<IconClock width={40} height={40} />} text="Nothing in progress. Start watching something!" />
          ) : (
            <ul className="space-y-2">
              {continueWatching.map((p) => {
                const pct = p.durationSec > 0 ? Math.round((p.positionSec / p.durationSec) * 100) : 0
                return (
                  <li key={p.episodeId}>
                    <Link to={`/watch/${p.animeId}/${p.episodeId}`} className="glass rounded-xl p-3 flex items-center gap-4 hover:bg-white/10 transition-colors">
                      <img src={p.poster} alt="" className="w-14 aspect-[2/3] object-cover rounded-md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{p.animeTitle}</p>
                        <p className="text-xs text-muted mt-0.5">
                          Episode {p.episodeNumber} · {pct}% watched · {formatDuration(p.durationSec - p.positionSec)} left
                        </p>
                        <div className="h-1 bg-white/10 rounded-full mt-2 max-w-sm">
                          <div className="h-full bg-gradient-to-r from-brand2 to-brand rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ))}

        {tab === 'history' &&
          (history.length === 0 ? (
            <Empty icon={<IconStar width={40} height={40} />} text="No watch history yet." />
          ) : (
            <ul className="space-y-2">
              {history.map((p) => (
                <li key={p.episodeId}>
                  <Link to={`/watch/${p.animeId}/${p.episodeId}`} className="glass rounded-xl p-3 flex items-center gap-4 hover:bg-white/10 transition-colors">
                    <img src={p.poster} alt="" className="w-14 aspect-[2/3] object-cover rounded-md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{p.animeTitle} · EP {p.episodeNumber}</p>
                      <p className="text-xs text-muted mt-0.5">{new Date(p.updatedAt).toLocaleString()}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  )
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="glass rounded-2xl p-14 text-center">
      <div className="mx-auto w-fit text-muted opacity-50">{icon}</div>
      <p className="text-muted text-sm mt-4">{text}</p>
    </div>
  )
}
