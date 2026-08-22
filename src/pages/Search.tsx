import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import AnimeGrid from '../components/anime/AnimeGrid'
import { CardSkeleton } from '../components/common/Skeletons'
import { searchAnime, getGenres } from '../services/api'
import { debounce } from '../utils/helpers'
import { IconSearch } from '../components/common/Icons'
import type { AnimeSummary } from '../types'

const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i)
const STATUSES = ['Ongoing', 'Completed', 'Upcoming']

export default function Search() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [genre, setGenre] = useState(params.get('genre') ?? '')
  const [year, setYear] = useState(params.get('year') ?? '')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [genres, setGenres] = useState<string[]>([])
  const [results, setResults] = useState<AnimeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getGenres().then(setGenres).catch(() => setGenres([]))
  }, [])

  const runSearch = useMemo(
    () =>
      debounce(async (query: string, g: string, y: string, s: string) => {
        setLoading(true)
        setError(null)
        try {
          const res = await searchAnime({
            q: query || undefined,
            genre: g || undefined,
            year: y ? Number(y) : undefined,
            status: s || undefined,
          })
          setResults(res.items)
        } catch {
          setError('Search is temporarily unavailable. Check your internet connection.')
          setResults([])
        } finally {
          setLoading(false)
        }
      }, 350),
    []
  )

  useEffect(() => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (genre) sp.set('genre', genre)
    if (year) sp.set('year', year)
    if (status) sp.set('status', status)
    setParams(sp, { replace: true })
    runSearch(q, genre, year, status)
  }, [q, genre, year, status, setParams, runSearch])

  // sync when arriving via header search
  useEffect(() => {
    const paramQ = params.get('q') ?? ''
    if (paramQ !== q && document.activeElement?.tagName !== 'INPUT') setQ(paramQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <div className="px-4 md:px-10 pt-20 max-w-[1600px] mx-auto">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Discover</h1>

      <div className="glass rounded-2xl p-4 md:p-5 mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles..."
            className="w-full bg-surface2 border border-line rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand/60 placeholder:text-muted"
          />
        </div>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 text-white"
        >
          <option value="">All Genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 text-white"
        >
          <option value="">Any Year</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 text-white"
        >
          <option value="">Any Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
            {Array.from({ length: 14 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="glass rounded-2xl p-10 text-center text-muted text-sm">{error}</div>
        ) : results.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-muted text-sm">
            No matches. Try a different title or clear some filters.
          </div>
        ) : (
          <AnimeGrid items={results} />
        )}
      </div>
    </div>
  )
}
