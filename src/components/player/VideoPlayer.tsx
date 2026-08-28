import { useEffect, useRef, useState } from 'react'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
import type { StreamSource, SubtitleTrack } from '../../types'

interface Props {
  sources: StreamSource[]
  subtitles?: SubtitleTrack[]
  poster?: string
  startAt?: number
  preferredQuality?: string
  onTimeUpdate?: (pos: number, dur: number) => void
  onEnded?: () => void
}

function EmbedPlayer({
  sources,
  preferredQuality,
  onTimeUpdate,
  onEnded,
}: {
  sources: StreamSource[]
  preferredQuality?: string
  onTimeUpdate?: (pos: number, dur: number) => void
  onEnded?: () => void
}) {
  const [active, setActive] = useState(() => {
    const byPref = sources.find((s) => s.quality === preferredQuality)
    return byPref ?? sources[0]
  })

  useEffect(() => {
    const byPref = sources.find((s) => s.quality === preferredQuality)
    setActive(byPref ?? sources[0])
  }, [sources, preferredQuality])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data
      if (!d || typeof d !== 'object' || d.type !== 'PLAYER_EVENT') return
      const ev = d.data
      if (!ev) return
      if (ev.event === 'timeupdate' && typeof ev.currentTime === 'number') {
        onTimeUpdate?.(ev.currentTime, ev.duration || 0)
      }
      if (ev.event === 'ended') onEnded?.()
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onTimeUpdate, onEnded])

  return (
    <div className="rounded-xl overflow-hidden bg-black shadow-2xl shadow-black/60 ring-1 ring-line">
      <div className="aspect-video w-full relative">
        <iframe
          key={active.url}
          src={active.url}
          title="Episode player"
          className="absolute inset-0 w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      </div>
      {sources.length > 1 && (
        <div className="flex gap-2.5 p-3 bg-surface2">
          {sources.map((s) => (
            <button
              key={s.url}
              onClick={() => setActive(s)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                active.url === s.url
                  ? 'bg-gradient-to-r from-brand2 to-brand text-white shadow-md shadow-brand2/30 btn-shimmer'
                  : 'bg-white/5 text-muted hover:text-white hover:bg-white/10'
              }`}
            >
              {s.quality}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VideoPlayer(props: Props) {
  const embedSources = props.sources.filter((s) => s.type === 'embed')
  if (embedSources.length > 0) {
    return (
      <EmbedPlayer
        sources={embedSources}
        preferredQuality={props.preferredQuality}
        onTimeUpdate={props.onTimeUpdate}
        onEnded={props.onEnded}
      />
    )
  }
  return <PlyrPlayer {...props} />
}

function PlyrPlayer({
  sources,
  subtitles = [],
  poster,
  startAt = 0,
  preferredQuality,
  onTimeUpdate,
  onEnded,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const player = useRef<Plyr | null>(null)

  const defaultQuality = (() => {
    if (!sources.length) return undefined
    const byPref =
      preferredQuality !== undefined
        ? sources.find((s) => s.quality === preferredQuality)
        : undefined
    const toNum = (q: string) => parseInt(q) || 0
    const best = [...sources].sort((a, b) => toNum(b.quality) - toNum(a.quality))[0]
    const chosen = byPref ?? best
    return toNum(chosen?.quality ?? '') || undefined
  })()

  useEffect(() => {
    if (!ref.current) return
    const opts: Plyr.Options = {
      controls: [
        'play-large', 'play', 'rewind', 'progress', 'current-time', 'duration',
        'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen',
      ],
      settings: ['captions', 'quality', 'speed'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      keyboard: { focused: true, global: true },
      tooltips: { controls: true, seek: true },
      seekTime: 10,
      quality: { default: 0, options: [], forced: true },
    }

    const numeric = sources
      .filter((s) => /^\d+$/.test(s.quality))
      .map((s) => ({ src: s.url, size: parseInt(s.quality) }))

    if (numeric.length > 0) {
      opts.quality = {
        default: (typeof defaultQuality === 'number' ? defaultQuality : numeric[0].size) as number,
        options: numeric.map((s) => s.size),
        forced: true,
        onChange: undefined,
      }
    }

    const p = new Plyr(ref.current, opts)
    player.current = p

    if (numeric.length > 0) {
      p.source = {
        type: 'video',
        title: 'Episode',
        sources: numeric,
        poster,
        tracks: subtitles.map((s) => ({
          kind: 'subtitles' as const,
          label: s.label,
          srcLang: s.lang,
          src: s.url,
          default: !!s.default,
        })),
      }
    } else if (sources[0]) {
      ref.current.src = sources[0].url
      if (poster) ref.current.poster = poster
    }

    const handleTime = () => {
      if (ref.current) onTimeUpdate?.(ref.current.currentTime, ref.current.duration || 0)
    }
    const handleEnded = () => onEnded?.()
    const handleReady = () => {
      if (ref.current && startAt > 0 && startAt < (ref.current.duration || Infinity) - 5) {
        ref.current.currentTime = startAt
      }
    }

    p.on('timeupdate', handleTime)
    p.on('ended', handleEnded)
    p.on('ready', handleReady)

    return () => {
      p.destroy()
      player.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, subtitles, poster])

  return (
    <div className="rounded-xl overflow-hidden bg-black shadow-2xl shadow-black/60 ring-1 ring-line aspect-video [&_.plyr]:h-full">
      <video ref={ref} playsInline crossOrigin="anonymous" className="w-full h-full" />
    </div>
  )
}
