import { useRef } from 'react'
import type { AnimeSummary } from '../../types'
import AnimeCard from './AnimeCard'
import { IconChevronLeft, IconChevronRight } from '../common/Icons'

export default function AnimeRow({ title, items }: { title: string; items: AnimeSummary[] }) {
  const scroller = useRef<HTMLDivElement>(null)

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  if (!items.length) return null

  return (
    <section className="mt-10 group/row">
      <div className="px-4 md:px-10 flex items-center justify-between mb-3">
        <h2 className="text-lg md:text-xl font-bold tracking-tight">{title}</h2>
        <div className="hidden md:flex gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button onClick={() => scrollBy(-1)} className="glass rounded-full p-1.5 hover:bg-white/15" aria-label="Scroll left">
            <IconChevronLeft width={18} height={18} />
          </button>
          <button onClick={() => scrollBy(1)} className="glass rounded-full p-1.5 hover:bg-white/15" aria-label="Scroll right">
            <IconChevronRight width={18} height={18} />
          </button>
        </div>
      </div>
      <div ref={scroller} className="flex gap-4 overflow-x-auto no-scrollbar px-4 md:px-10 scroll-px-4 md:scroll-px-10 snap-x">
        {items.map((a) => (
          <div key={a.id} className="snap-start shrink-0 w-36 sm:w-44">
            <AnimeCard anime={a} />
          </div>
        ))}
        <div className="shrink-0 w-1 md:w-2" aria-hidden />
      </div>
    </section>
  )
}
