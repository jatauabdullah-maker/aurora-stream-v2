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

  const addResolving = useCallback((item: Parameters<typeof downloadEngine.addResolving>[0]) => {
    downloadEngine.addResolving(item)
  }, [])

  const markResolved = useCallback((id: string, url: string, quality: string) => {
    downloadEngine.markResolved(id, url, quality)
  }, [])

  const markResolveError = useCallback((id: string, error: string) => {
    downloadEngine.markResolveError(id, error)
  }, [])

  const retryResolve = useCallback((id: string) => downloadEngine.retryResolve(id), [])
  const pause = useCallback((id: string) => downloadEngine.pause(id), [])
  const resume = useCallback((id: string) => downloadEngine.resume(id), [])
  const remove = useCallback((id: string) => downloadEngine.remove(id), [])
  const clearCompleted = useCallback(() => downloadEngine.clearCompleted(), [])
  const setConcurrency = useCallback((n: number) => downloadEngine.setConcurrency(n), [])
  const updateResolverProgress = useCallback((id: string, progress: Parameters<typeof downloadEngine.updateResolverProgress>[1]) => {
    downloadEngine.updateResolverProgress(id, progress)
  }, [])

  return {
    items, addDownload, addResolving, markResolved, markResolveError, retryResolve,
    pause, resume, remove, clearCompleted, setConcurrency, updateResolverProgress,
  }
}
