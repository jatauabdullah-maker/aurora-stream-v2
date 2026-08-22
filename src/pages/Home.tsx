import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeroCarousel from '../components/home/HeroCarousel'
import AnimeRow from '../components/anime/AnimeRow'
import ContinueWatchingRow from '../components/home/ContinueWatchingRow'
import { HeroSkeleton, RowSkeleton } from '../components/common/Skeletons'
import { getTrending, getPopular, getRecent } from '../services/api'
import { useApp } from '../context/AppContext'
import { uniqBy } from '../utils/helpers'
import type { AnimeSummary } from '../types'

export default function Home() {
  const [trending, setTrending] = useState<AnimeSummary[]>([])
  const [popular, setPopular] = useState<AnimeSummary[]>([])
  const [recent, setRecent] = useState<AnimeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { continueWatching, refreshProgress } = useApp()

  useEffect(() => {
    refreshProgress()
    let live = true
    ;(async () => {
      try {
        const [t, p, r] = await Promise.allSettled([getTrending(), getPopular(), getRecent()])
        if (!live) return
        setTrending(t.status === 'fulfilled' ? t.value : [])
        setPopular(p.status === 'fulfilled' ? p.value : [])
        setRecent(r.status === 'fulfilled' ? r.value : [])
        const allFailed = [t, p, r].every((x) => x.status === 'rejected')
        if (allFailed) {
          setError('Could not load the anime catalog. Check your internet connection — AniList should be reachable.')
        }
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [refreshProgress])

  const heroItems = uniqBy(trending, (a) => a.id).filter((a) => a.banner || a.poster).slice(0, 6)

  if (loading) {
    return (
      <div className="-mt-16">
        <HeroSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  }

  return (
    <div className="-mt-16">
      {error ? (
        <div className="pt-32 px-4 md:px-10 max-w-2xl mx-auto text-center">
          <div className="glass rounded-2xl p-10">
            <h2 className="text-2xl font-bold mb-3">No source connected</h2>
            <p className="text-muted text-sm leading-relaxed">{error}</p>
            <Link to="/settings" className="inline-block mt-6 bg-gradient-to-r from-brand2 to-brand px-6 py-3 rounded-xl font-semibold">
              Open Settings
            </Link>
          </div>
        </div>
      ) : (
        <>
          {heroItems.length > 0 && <HeroCarousel items={heroItems} />}
          <div className="relative z-10 -mt-2">
            {continueWatching.length > 0 && <ContinueWatchingRow items={continueWatching} />}
            <AnimeRow title="Trending Now" items={trending} />
            <AnimeRow title="Popular" items={popular} />
            <AnimeRow title="New Releases" items={recent} />
          </div>
        </>
      )}
    </div>
  )
}
