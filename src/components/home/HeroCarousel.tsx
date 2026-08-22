import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { AnimeSummary } from '../../types'
import { IconPlay, IconPlus, IconCheck, IconStar, IconInfo } from '../common/Icons'
import { useApp } from '../../context/AppContext'
import { classNames } from '../../utils/helpers'
import toast from 'react-hot-toast'

export default function HeroCarousel({ items }: { items: AnimeSummary[] }) {
  const [index, setIndex] = useState(0)
  const slide = items[index]
  const { isInWatchlist, toggleWatchlist } = useApp()

  const next = useCallback(() => {
    if (items.length) setIndex((i) => (i + 1) % items.length)
  }, [items.length])

  useEffect(() => {
    const t = setInterval(next, 7000)
    return () => clearInterval(t)
  }, [next])

  if (!slide) return null
  const inList = isInWatchlist(slide.id)

  return (
    <div className="relative h-[58vh] min-h-[420px] max-h-[640px] w-full overflow-hidden">
      <AnimatePresence mode="sync">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          <img
            src={slide.banner || slide.poster}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 hero-fade" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/80 via-bg/20 to-transparent" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 flex items-end">
        <div className="px-4 md:px-10 pb-16 md:pb-20 max-w-2xl">
          <motion.div
            key={`info-${slide.id}`}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.6 }}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="bg-gradient-to-r from-brand2 to-brand px-2.5 py-1 rounded-md">#1 SPOTLIGHT</span>
              {slide.rating != null && (
                <span className="glass px-2 py-1 rounded-md flex items-center gap-1">
                  <IconStar width={11} height={11} className="text-yellow-400" /> {slide.rating.toFixed(1)}
                </span>
              )}
              {slide.type && <span className="glass px-2 py-1 rounded-md">{slide.type}</span>}
              {slide.year && <span className="glass px-2 py-1 rounded-md">{slide.year}</span>}
            </div>

            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mt-3 leading-tight line-clamp-2">
              {slide.title}
            </h1>

            {slide.genres && slide.genres.length > 0 && (
              <p className="text-sm text-muted mt-2">{slide.genres.slice(0, 4).join(' · ')}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Link
                to={`/anime/${slide.id}`}
                className="flex items-center gap-2 bg-gradient-to-r from-brand2 to-brand px-6 py-3 rounded-xl font-bold shadow-lg shadow-brand2/40 hover:shadow-brand/50 hover:scale-[1.03] transition-all"
              >
                <IconPlay width={18} height={18} /> Watch Now
              </Link>
              <button
                onClick={() => {
                  const added = toggleWatchlist({ id: slide.id, title: slide.title, poster: slide.poster, addedAt: Date.now() })
                  toast.success(added ? 'Added to My List' : 'Removed from My List')
                }}
                className="flex items-center gap-2 glass px-5 py-3 rounded-xl font-semibold hover:bg-white/15 transition-colors"
              >
                {inList ? <IconCheck width={18} height={18} /> : <IconPlus width={18} height={18} />}
                {inList ? 'In My List' : 'My List'}
              </button>
              <Link
                to={`/anime/${slide.id}`}
                className="glass p-3 rounded-xl hover:bg-white/15 transition-colors"
                aria-label="More info"
              >
                <IconInfo width={20} height={20} />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-5 left-4 md:left-10 flex gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Slide ${i + 1}`}
            className={classNames(
              'h-1.5 rounded-full transition-all duration-300',
              i === index ? 'w-8 bg-brand' : 'w-3 bg-white/25 hover:bg-white/40'
            )}
          />
        ))}
      </div>
    </div>
  )
}
