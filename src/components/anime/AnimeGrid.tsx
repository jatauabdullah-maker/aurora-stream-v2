import type { AnimeSummary } from '../../types'
import AnimeCard from './AnimeCard'

export default function AnimeGrid({ items }: { items: AnimeSummary[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-4 gap-y-6">
      {items.map((a) => (
        <AnimeCard key={a.id} anime={a} />
      ))}
    </div>
  )
}
