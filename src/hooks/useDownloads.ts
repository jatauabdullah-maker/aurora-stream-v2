import { useSyncExternalStore, useCallback } from 'react'
import { downloadEngine } from '../services/downloads'

export function useDownloads() {
  const items = useSyncExternalStore(
    (cb) => downloadEngine.subscribe(cb),
    () => downloadEngine.getSnapshot()
  )

  const addDownload = useCallback((item: Parameters<typeof downloadEngine.add>[0]) => {
    downloadEngine.add(item)
  }, [])

  const pause = useCallback((id: string) => downloadEngine.pause(id), [])
  const resume = useCallback((id: string) => downloadEngine.resume(id), [])
  const remove = useCallback((id: string) => downloadEngine.remove(id), [])
  const clearCompleted = useCallback(() => downloadEngine.clearCompleted(), [])
  const setConcurrency = useCallback((n: number) => downloadEngine.setConcurrency(n), [])

  return { items, addDownload, pause, resume, remove, clearCompleted, setConcurrency }
}
