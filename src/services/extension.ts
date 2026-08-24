/* Aurora Downloader extension bridge (page side) */

const TAG = '__aurora_ext__'

export interface ExtensionProgress {
  stage: 'searching' | 'found_anime' | 'finding_episode' | 'on_play_page' |
         'solving_protection' | 'on_redirect' | 'resolving_link' | 'downloading' | 'complete' | 'error'
  message: string
}

export interface ExtensionPayload {
  animeTitle: string
  episodeNumber: number
  quality: string
}

export interface ExtensionDownloadResult {
  ok: boolean
  error?: string
  blob?: Blob
  filename?: string
  bytes?: number
}

let reqCounter = 0

function post<T>(msg: Record<string, unknown>, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `req_${Date.now()}_${reqCounter++}`
    const timer = setTimeout(() => {
      window.removeEventListener('message', listener)
      reject(new Error('Aurora Downloader did not respond — is it installed and enabled?'))
    }, timeoutMs)

    const listener = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.tag !== TAG || data.type !== 'RESPONSE' || data.id !== id) return
      clearTimeout(timer)
      window.removeEventListener('message', listener)
      resolve(data.resp as T)
    }
    window.addEventListener('message', listener)
    window.postMessage({ tag: TAG, id, ...msg }, window.location.origin)
  })
}

export async function checkExtension(): Promise<{ installed: boolean; version?: string }> {
  try {
    const resp = await post<{ ok?: boolean; version?: string }>({ type: 'PING' }, 1500)
    if (resp?.ok) return { installed: true, version: resp.version }
    return { installed: false }
  } catch {
    return { installed: false }
  }
}

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export async function startExtensionDownload(
  payload: ExtensionPayload,
  onProgress: (p: ExtensionProgress) => void
): Promise<ExtensionDownloadResult> {
  const start = await post<{ ok: boolean; error?: string }>({ type: 'DOWNLOAD', payload }, 8000)
  if (!start?.ok) return { ok: false, error: start?.error ?? 'Downloader refused the job' }

  return new Promise((resolve) => {
    const chunks: Uint8Array[] = []
    let finished = false

    const finish = (result: ExtensionDownloadResult) => {
      if (finished) return
      finished = true
      window.removeEventListener('message', listener)
      resolve(result)
    }

    const listener = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.tag !== TAG) return

      if (data.type === 'CHUNK') {
        if (data.data) {
          const bin = atob(data.data)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          chunks.push(bytes)
        }
        const received = data.received ?? 0
        const total = data.total ?? 0
        if (total > 0) {
          const pct = Math.min(99, Math.round((received / total) * 100))
          onProgress({
            stage: 'downloading',
            message: `Downloading... ${pct}% (${(received / 1048576).toFixed(0)}MB)`,
          })
        } else {
          onProgress({ stage: 'downloading', message: `Downloading... ${(received / 1048576).toFixed(0)}MB` })
        }
        // ack so the extension knows the page is still alive
        window.postMessage({ tag: TAG, type: 'CHUNK_ACK' }, window.location.origin)

        if (data.done) {
          const blobParts = chunks.map((c) => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer)
          finish({
            ok: true,
            blob: new Blob(blobParts, { type: 'video/mp4' }),
            filename: data.filename,
            bytes: received,
          })
        }
        return
      }

      if (data.type === 'PROGRESS') {
        const p = data.progress as ExtensionProgress
        if (p.stage === 'error') finish({ ok: false, error: p.message })
        else if (p.stage !== 'downloading') onProgress(p)
      }
    }
    window.addEventListener('message', listener)
  })
}
