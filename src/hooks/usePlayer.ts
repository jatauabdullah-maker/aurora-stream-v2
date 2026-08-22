import { useEffect, useRef, useCallback } from 'react'
import { saveProgress, getProgress } from '../services/storage'
import type { AnimeSummary, Episode } from '../types'

export function useProgressTracker(anime: AnimeSummary | null, episode: Episode | null) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const last = useRef<{ pos: number; dur: number }>({ pos: 0, dur: 0 })

  const track = useCallback(
    (positionSec: number, durationSec: number) => {
      last.current = { pos: positionSec, dur: durationSec }
    },
    []
  )

  useEffect(() => {
    if (!anime || !episode) return
    timer.current = setInterval(() => {
      const { pos, dur } = last.current
      if (dur <= 0) return
      saveProgress({
        episodeId: episode.id,
        animeId: anime.id,
        animeTitle: anime.title,
        poster: anime.poster,
        episodeNumber: episode.number,
        positionSec: pos,
        durationSec: dur,
        updatedAt: Date.now(),
      })
    }, 5000)
    return () => {
      if (timer.current) clearInterval(timer.current)
      // final save on unmount
      const { pos, dur } = last.current
      if (dur > 0 && pos > 5) {
        saveProgress({
          episodeId: episode.id,
          animeId: anime.id,
          animeTitle: anime.title,
          poster: anime.poster,
          episodeNumber: episode.number,
          positionSec: pos,
          durationSec: dur,
          updatedAt: Date.now(),
        })
      }
    }
  }, [anime, episode])

  const getInitialPosition = useCallback(() => {
    if (!episode) return 0
    const p = getProgress(episode.id)
    if (!p) return 0
    // don't resume if basically finished
    if (p.positionSec > p.durationSec * 0.95) return 0
    return p.positionSec
  }, [episode])

  return { track, getInitialPosition }
}
