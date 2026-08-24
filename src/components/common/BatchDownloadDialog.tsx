import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { classNames } from '../../utils/helpers'
import { IconDownload, IconX } from './Icons'

export interface BatchDialogProps {
  open: boolean
  animeTitle: string
  poster?: string
  episodeNumbers: number[]
  onClose: () => void
  onStart: (episodes: number[], quality: string) => void
}

const QUALITIES = ['1080p', '720p', '360p'] as const

export function BatchDownloadDialog({ open, animeTitle, poster, episodeNumbers, onClose, onStart }: BatchDialogProps) {
  const sorted = useMemo(() => [...episodeNumbers].sort((a, b) => a - b), [episodeNumbers])
  const minEp = sorted[0] ?? 1
  const maxEp = sorted[sorted.length - 1] ?? 1
  const [from, setFrom] = useState(minEp)
  const [to, setTo] = useState(maxEp)
  const [quality, setQuality] = useState<string>('720p')

  useEffect(() => {
    if (open) {
      setFrom(minEp)
      setTo(maxEp)
    }
  }, [open, minEp, maxEp])

  const selected = useMemo(
    () => sorted.filter((n) => n >= from && n <= to),
    [sorted, from, to]
  )
  const count = selected.length

  const start = () => onStart(selected, quality)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="glass rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {poster && <img src={poster} alt="" className="w-12 aspect-[2/3] object-cover rounded-lg shrink-0" />}
                <div className="min-w-0">
                  <h3 className="font-bold truncate">{animeTitle}</h3>
                  <p className="text-sm text-muted">Download episodes</p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted hover:text-white p-1" aria-label="Close">
                <IconX width={18} height={18} />
              </button>
            </div>

            <p className="text-xs text-muted mt-4 mb-2 font-semibold uppercase tracking-wider">Episode range</p>
            <div className="flex items-center gap-3">
              <label className="flex-1">
                <span className="text-[11px] text-muted">From</span>
                <input
                  type="number"
                  min={minEp}
                  max={maxEp}
                  value={from}
                  onChange={(e) => setFrom(Math.max(minEp, Math.min(maxEp, Number(e.target.value) || minEp)))}
                  className="mt-1 w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm font-semibold focus:border-brand outline-none"
                />
              </label>
              <span className="text-muted mt-5">–</span>
              <label className="flex-1">
                <span className="text-[11px] text-muted">To</span>
                <input
                  type="number"
                  min={minEp}
                  max={maxEp}
                  value={to}
                  onChange={(e) => setTo(Math.max(minEp, Math.min(maxEp, Number(e.target.value) || minEp)))}
                  className="mt-1 w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm font-semibold focus:border-brand outline-none"
                />
              </label>
            </div>

            <p className="text-xs text-muted mt-4 mb-2 font-semibold uppercase tracking-wider">Quality</p>
            <div className="grid grid-cols-3 gap-2">
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={classNames(
                    'rounded-xl py-3 text-sm font-bold border transition-colors',
                    quality === q
                      ? 'bg-gradient-to-br from-brand2 to-brand border-transparent'
                      : 'bg-surface2 border-line hover:border-brand/60'
                  )}
                >
                  {q}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-muted mt-3">
              {count} episode{count === 1 ? '' : 's'} will be queued and resolved one by one with pacing to avoid blocks.
            </p>

            <button
              onClick={start}
              disabled={count === 0}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand2 to-brand rounded-xl py-3 font-bold shadow-lg shadow-brand2/30 hover:scale-[1.02] transition-transform disabled:opacity-40"
            >
              <IconDownload width={17} height={17} /> Download {count} Episode{count === 1 ? '' : 's'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
