import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { classNames } from '../../utils/helpers'
import { IconDownload, IconX } from './Icons'

export interface DownloadDialogProps {
  open: boolean
  animeTitle: string
  episodeLabel: string
  poster?: string
  onClose: () => void
  onStart: (quality: string) => void
}

const QUALITIES = ['1080p', '720p', '360p'] as const

export function DownloadDialog({ open, animeTitle, episodeLabel, poster, onClose, onStart }: DownloadDialogProps) {
  const [quality, setQuality] = useState<string>('720p')

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
                  <p className="text-sm text-muted">{episodeLabel}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted hover:text-white p-1" aria-label="Close">
                <IconX width={18} height={18} />
              </button>
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
            <p className="text-[11px] text-muted mt-2">
              If the chosen quality fails, you'll be offered a lower one.
            </p>

            <button
              onClick={() => onStart(quality)}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand2 to-brand rounded-xl py-3 font-bold shadow-lg shadow-brand2/30 hover:scale-[1.02] transition-transform"
            >
              <IconDownload width={17} height={17} /> Start Download
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export interface DownloadFailureProps {
  open: boolean
  animeTitle: string
  episodeLabel: string
  quality: string
  error: string
  onClose: () => void
  onRetry: () => void
  onLowerQuality: (() => void) | null
}

export function DownloadFailureDialog({
  open, animeTitle, episodeLabel, quality, error, onClose, onRetry, onLowerQuality,
}: DownloadFailureProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="glass rounded-2xl w-full max-w-md p-6"
          >
            <h3 className="font-bold text-accent">Download failed</h3>
            <p className="text-sm mt-1">
              {animeTitle} · {episodeLabel} · <span className="text-brand">{quality}</span>
            </p>
            <p className="text-xs text-muted mt-2 break-words">{error}</p>

            <div className="mt-5 space-y-2">
              <button
                onClick={onRetry}
                className="w-full bg-gradient-to-r from-brand2 to-brand rounded-xl py-2.5 font-bold text-sm"
              >
                Retry {quality}
              </button>
              {onLowerQuality && (
                <button
                  onClick={onLowerQuality}
                  className="w-full glass rounded-xl py-2.5 font-semibold text-sm hover:bg-white/15"
                >
                  Try lower quality
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full glass rounded-xl py-2.5 font-semibold text-sm text-muted hover:text-white hover:bg-white/15"
              >
                Keep in list (retry later)
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
