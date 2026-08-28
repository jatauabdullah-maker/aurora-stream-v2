import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { classNames, formatBytes } from '../../utils/helpers'
import { IconDownload, IconX, IconCheck, IconInfo } from './Icons'
import { inspectSources, isMobileDevice, type InspectedSource } from '../../services/extension'

export interface DownloadDialogProps {
  open: boolean
  animeTitle: string
  episodeLabel: string
  episodeNumber?: number
  poster?: string
  onClose: () => void
  onStart: (quality: string) => void
}

const QUALITIES = ['1080p', '720p', '360p'] as const

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin shrink-0" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        strokeDasharray="31.4" strokeDashoffset="10"
      />
    </svg>
  )
}

export function DownloadDialog({
  open, animeTitle, episodeLabel, episodeNumber, poster, onClose, onStart,
}: DownloadDialogProps) {
  const [quality, setQuality] = useState<string>('720p')
  const [inspecting, setInspecting] = useState(false)
  const [inspected, setInspected] = useState<InspectedSource[] | null>(null)
  const [inspectError, setInspectError] = useState<string | null>(null)

  // reset inspection whenever the dialog opens for a new episode
  useEffect(() => {
    if (open) {
      setInspected(null)
      setInspectError(null)
      setInspecting(false)
    }
  }, [open, episodeLabel])

  const runInspect = async () => {
    if (episodeNumber == null) return
    setInspecting(true)
    setInspectError(null)
    const res = await inspectSources({ animeTitle, episodeNumber })
    setInspecting(false)
    if (res.ok && res.sources?.length) {
      setInspected(res.sources)
      // auto-select the best available quality
      const best = res.sources.find((s) => s.audio === 'sub') ?? res.sources[0]
      if (best) setQuality(best.quality)
    } else {
      setInspectError(res.error ?? 'No sources found for this episode')
    }
  }

  // qualities that actually exist, when we know them
  const availableQualities = inspected
    ? [...new Set(inspected.map((s) => s.quality))]
    : null

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
            className="glass rounded-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
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

            {/* ── Source inspection (like Kaze) ── */}
            {!isMobileDevice() && episodeNumber != null && (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted font-semibold uppercase tracking-wider">Available sources</p>
                  <button
                    onClick={() => void runInspect()}
                    disabled={inspecting}
                    className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-white glass px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {inspecting ? <><Spinner /> Checking…</> : <><IconInfo width={13} height={13} /> {inspected ? 'Re-check' : 'Inspect sources'}</>}
                  </button>
                </div>

                {inspecting && (
                  <p className="text-[11px] text-muted mt-2 leading-relaxed">
                    Reading the episode page for real quality options — this takes a few seconds.
                  </p>
                )}

                {inspectError && (
                  <div className="mt-2 bg-accent/10 border border-accent/25 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-accent break-words">{inspectError}</p>
                  </div>
                )}

                {inspected && inspected.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {inspected.map((s, i) => {
                      const selected = quality === s.quality
                      return (
                        <li key={`${s.quality}-${s.group}-${s.audio}-${i}`}>
                          <button
                            onClick={() => setQuality(s.quality)}
                            className={classNames(
                              'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left border transition-all duration-200',
                              selected
                                ? 'bg-brand/15 border-brand/50 ring-1 ring-brand/30'
                                : 'bg-surface2 border-line hover:border-brand/40'
                            )}
                          >
                            <span className={classNames('text-sm font-bold tabular-nums shrink-0', selected ? 'text-brand' : '')}>
                              {s.quality}
                            </span>
                            <span className="text-xs text-muted truncate flex-1">{s.group || 'Unknown group'}</span>
                            <span
                              className={classNames(
                                'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                                s.audio === 'dub' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                              )}
                            >
                              {s.audio}
                            </span>
                            {s.sizeMB != null && (
                              <span className="text-[11px] text-muted tabular-nums shrink-0">
                                {formatBytes(s.sizeMB * 1024 * 1024)}
                              </span>
                            )}
                            {selected && <IconCheck width={14} height={14} className="text-brand shrink-0" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            <p className="text-xs text-muted mt-5 mb-2 font-semibold uppercase tracking-wider">
              {availableQualities ? 'Confirm quality' : 'Quality'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {QUALITIES.map((q) => {
                const unavailable = availableQualities ? !availableQualities.includes(q) : false
                return (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    disabled={unavailable}
                    title={unavailable ? 'Not offered for this episode' : undefined}
                    className={classNames(
                      'rounded-xl py-3 text-sm font-bold border transition-all duration-200',
                      quality === q
                        ? 'bg-gradient-to-br from-brand2 to-brand border-transparent shadow-lg shadow-brand/20'
                        : unavailable
                          ? 'bg-surface2/40 border-line/40 text-muted/40 cursor-not-allowed line-through'
                          : 'bg-surface2 border-line hover:border-brand/60 hover:shadow-[0_0_12px_rgba(107,70,255,0.15)]'
                    )}
                  >
                    {q}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted mt-2">
              {availableQualities
                ? 'Struck-through options are not offered for this episode.'
                : "If the chosen quality fails, you'll be offered a lower one."}
            </p>

            <button
              onClick={() => onStart(quality)}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand2 to-brand rounded-xl py-3 font-bold shadow-lg shadow-brand2/30 hover:scale-[1.02] transition-transform btn-shimmer"
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
                className="w-full bg-gradient-to-r from-brand2 to-brand rounded-xl py-2.5 font-bold text-sm btn-shimmer"
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

export interface NoDownloadMethodProps {
  open: boolean
  isMobile: boolean
  onClose: () => void
  onOpenSettings: () => void
}

export function NoDownloadMethodDialog({ open, isMobile, onClose, onOpenSettings }: NoDownloadMethodProps) {
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
            <h3 className="font-bold text-lg">
              {isMobile ? 'Streaming on the go!' : '⚡ One-time setup needed'}
            </h3>

            {isMobile ? (
              <div className="mt-3 space-y-3">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand2/20 to-brand/20 flex items-center justify-center">
                    <IconDownload width={28} height={28} className="text-brand" />
                  </div>
                </div>
                <p className="text-sm text-muted leading-relaxed text-center">
                  Streaming works perfectly on mobile! Downloads are available on desktop browsers with the <b className="text-white">Aurora Downloader</b> extension.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted mt-3 leading-relaxed">
                  Install the <b className="text-white">Aurora Downloader</b> extension — takes ~30
                  seconds, once. After that, every download is one click and files are saved for
                  offline watching right inside Aurora.
                </p>
                <button
                  onClick={() => {
                    onClose()
                    onOpenSettings()
                  }}
                  className="mt-5 w-full bg-gradient-to-r from-brand2 to-brand rounded-xl py-3 font-bold shadow-lg shadow-brand2/30"
                >
                  Set it up (Settings → Downloads)
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="mt-3 w-full glass rounded-xl py-2.5 font-semibold text-sm text-muted hover:text-white hover:bg-white/15"
            >
              {isMobile ? 'Got it' : 'Not now'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
