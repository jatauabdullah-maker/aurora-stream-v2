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

export async function startExtensionDownload(
  payload: ExtensionPayload,
  onProgress: (p: ExtensionProgress) => void
): Promise<{ ok: boolean; error?: string }> {
  const start = await post<{ ok: boolean; error?: string }>({ type: 'DOWNLOAD', payload }, 8000)
  if (!start?.ok) return { ok: false, error: start?.error ?? 'Downloader refused the job' }

  return new Promise((resolve) => {
    const listener = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.tag !== TAG || data.type !== 'PROGRESS') return
      const p = data.progress as ExtensionProgress
      onProgress(p)
      if (p.stage === 'complete') {
        window.removeEventListener('message', listener)
        resolve({ ok: true })
      } else if (p.stage === 'error') {
        window.removeEventListener('message', listener)
        resolve({ ok: false, error: p.message })
      }
    }
    window.addEventListener('message', listener)
  })
}
