import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { Settings, WatchlistItem, WatchProgress } from '../types'
import {
  getSettings,
  saveSettings,
  getWatchlist,
  toggleWatchlist as storageToggle,
  getContinueWatching,
  getHistory,
} from '../services/storage'

interface AppState {
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
  watchlist: WatchlistItem[]
  toggleWatchlist: (item: WatchlistItem) => boolean
  isInWatchlist: (id: string) => boolean
  continueWatching: WatchProgress[]
  history: WatchProgress[]
  refreshProgress: () => void
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(getSettings)
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(getWatchlist)
  const [continueWatching, setContinueWatching] = useState<WatchProgress[]>(getContinueWatching)
  const [history, setHistory] = useState<WatchProgress[]>(getHistory)

  const updateSettings = useCallback((s: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...s }
      saveSettings(next)
      return next
    })
  }, [])

  const toggleWatchlist = useCallback((item: WatchlistItem) => {
    const added = storageToggle(item)
    setWatchlist(getWatchlist())
    return added
  }, [])

  const isInWatchlist = useCallback((id: string) => watchlist.some((x) => x.id === id), [watchlist])

  const refreshProgress = useCallback(() => {
    setContinueWatching(getContinueWatching())
    setHistory(getHistory())
  }, [])

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      watchlist,
      toggleWatchlist,
      isInWatchlist,
      continueWatching,
      history,
      refreshProgress,
    }),
    [settings, updateSettings, watchlist, toggleWatchlist, isInWatchlist, continueWatching, history, refreshProgress]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
