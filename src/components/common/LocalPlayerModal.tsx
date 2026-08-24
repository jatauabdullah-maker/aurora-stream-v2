import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VideoPlayer from '../player/VideoPlayer'
import { IconX } from './Icons'

export interface LocalPlayerProps {
  open: boolean
  name: string
  url: string
  onClose: () => void
}

/* Full-screen premium player for local files — same player the streaming
   pages use, so offline and online feel identical. */
export default function LocalPlayerModal({ open, name, url, onClose }: LocalPlayerProps) {
  const prevOverflow = useRef('')

  useEffect(() => {
    if (open) {
      prevOverflow.current = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = prevOverflow.current
    }
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm"
        >
          <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center justify-between px-4 md:px-10">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{name}</p>
              <p className="text-[11px] text-muted">Playing from your device — offline</p>
            </div>
            <button onClick={onClose} className="glass rounded-full p-2.5 hover:bg-white/15" aria-label="Close player">
              <IconX width={18} height={18} />
            </button>
          </div>

          <div className="absolute inset-0 flex items-center justify-center p-4 md:p-10 pt-20">
            <div className="w-full max-w-6xl">
              <VideoPlayer
                sources={[{ url, quality: 'Source' }]}
                poster={undefined}
              />
              <p className="text-xs text-muted mt-3 text-center">
                Playing <b className="text-white">{name}</b> — local file, full quality
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
