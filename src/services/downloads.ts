import axios from 'axios'
import type { DownloadItem } from '../types'
import { idbPut, idbGet, idbDelete } from './idb'

type Listener = () => void

const LS_KEY = 'aurora:downloads'

function load(): DownloadItem[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

class DownloadEngine {
  private items: DownloadItem[] = load()
  private controllers = new Map<string, AbortController>()
  private listeners = new Set<Listener>()
  private concurrency = 2
  private pumping = false

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    // New array reference so useSyncExternalStore subscribers re-render.
    this.items = [...this.items]
    localStorage.setItem(LS_KEY, JSON.stringify(this.items))
    this.listeners.forEach((fn) => fn())
  }

  getSnapshot(): DownloadItem[] {
    return this.items
  }

  setConcurrency(n: number) {
    this.concurrency = Math.max(1, Math.min(4, n))
    this.pump()
  }

  add(item: Omit<DownloadItem, 'status' | 'progress' | 'createdAt'>) {
    if (this.items.some((x) => x.id === item.id)) return
    this.items.unshift({ ...item, status: 'pending', progress: 0, createdAt: Date.now() })
    this.emit()
    this.pump()
  }

  pause(id: string) {
    const it = this.items.find((x) => x.id === id)
    if (!it) return
    this.controllers.get(id)?.abort()
    it.status = 'paused'
    this.emit()
  }

  resume(id: string) {
    const it = this.items.find((x) => x.id === id)
    if (!it || it.status !== 'paused') return
    it.status = 'pending'
    this.emit()
    this.pump()
  }

  async remove(id: string) {
    this.controllers.get(id)?.abort()
    this.items = this.items.filter((x) => x.id !== id)
    this.controllers.delete(id)
    await idbDelete(id).catch(() => undefined)
    this.emit()
    this.pump()
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    return idbGet(id)
  }

  async clearCompleted() {
    const done = this.items.filter((x) => x.status === 'completed')
    for (const d of done) await idbDelete(d.id).catch(() => undefined)
    this.items = this.items.filter((x) => x.status !== 'completed')
    this.emit()
  }

  private activeCount() {
    return this.items.filter((x) => x.status === 'downloading').length
  }

  private pump() {
    if (this.pumping) return
    this.pumping = true
    queueMicrotask(() => {
      try {
        while (this.activeCount() < this.concurrency) {
          const next = this.items.find((x) => x.status === 'pending')
          if (!next) break
          void this.run(next)
        }
      } finally {
        this.pumping = false
      }
    })
  }

  private async run(it: DownloadItem) {
    const ctrl = new AbortController()
    this.controllers.set(it.id, ctrl)
    it.status = 'downloading'
    this.emit()
    let lastTick = 0
    try {
      const res = await axios.get<Blob>(it.url, {
        responseType: 'blob',
        signal: ctrl.signal,
        onDownloadProgress: (e) => {
          it.bytesDone = e.loaded
          it.bytesTotal = e.total ?? it.bytesTotal
          if (e.total && e.total > 0) it.progress = Math.round((e.loaded / e.total) * 100)
          const now = Date.now()
          if (now - lastTick > 250) {
            lastTick = now
            this.emit()
          }
        },
      })
      await idbPut(it.id, res.data)
      it.progress = 100
      it.blobId = it.id
      it.status = 'completed'
    } catch (err) {
      if (ctrl.signal.aborted) {
        // paused or removed — state already set
      } else {
        it.status = 'error'
        it.error = err instanceof Error ? err.message : 'Download failed'
      }
    } finally {
      this.controllers.delete(it.id)
      this.emit()
      this.pump()
    }
  }
}

export const downloadEngine = new DownloadEngine()
