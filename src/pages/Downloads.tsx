import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDownloads } from '../hooks/useDownloads'
import { formatBytes, classNames } from '../utils/helpers'
import { IconPause, IconPlay, IconTrash, IconDownload } from '../components/common/Icons'
import { listDeviceDownloads, openDeviceDownload, type DeviceDownload } from '../services/extension'
import toast from 'react-hot-toast'

export default function Downloads() {
  const { items, pause, resume, remove, clearCompleted } = useDownloads()
  const navigate = useNavigate()
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [deviceFiles, setDeviceFiles] = useState<DeviceDownload[] | null>(null)

  useState(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
    }
  })

  useEffect(() => {
    listDeviceDownloads().then(setDeviceFiles).catch(() => setDeviceFiles(null))
  }, [])

  const refreshStorage = () => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
    }
  }

  const active = items.filter((d) => d.status === 'downloading' || d.status === 'pending')
  const paused = items.filter((d) => d.status === 'paused' || d.status === 'error')
  const completed = items.filter((d) => d.status === 'completed')
  const usagePct = storage && storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0

  return (
    <div className="px-4 md:px-10 pt-24 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Downloads</h1>
        {completed.length > 0 && (
          <button
            onClick={async () => {
              await clearCompleted()
              refreshStorage()
              toast.success('Cleared completed downloads')
            }}
            className="text-sm text-muted hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <IconTrash width={15} height={15} /> Clear completed
          </button>
        )}
      </div>

      {storage && storage.quota > 0 && (
        <div className="glass rounded-2xl p-4 mt-5">
          <div className="flex justify-between text-xs text-muted mb-2">
            <span>App storage</span>
            <span>
              {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={classNames('h-full rounded-full transition-all', usagePct > 85 ? 'bg-accent' : 'bg-gradient-to-r from-brand2 to-brand')}
              style={{ width: `${Math.max(1, Math.min(100, usagePct))}%` }}
            />
          </div>
        </div>
      )}

      {items.length === 0 && (deviceFiles === null || deviceFiles.length === 0) ? (
        <div className="glass rounded-2xl p-14 mt-8 text-center">
          <IconDownload width={40} height={40} className="mx-auto text-muted opacity-50" />
          <p className="text-muted text-sm mt-4">
            No downloads yet. Open any anime and hit "Download" to save episodes for offline viewing.
          </p>
        </div>
      ) : (
        <div className="space-y-8 mt-6">
          {active.length > 0 && <Section title="In Progress" items={active} onPause={pause} onResume={resume} onRemove={remove} onChanged={refreshStorage} />}
          {paused.length > 0 && <Section title="Paused / Failed" items={paused} onPause={pause} onResume={resume} onRemove={remove} onChanged={refreshStorage} />}
          {completed.length > 0 && (
            <Section
              title="Completed — watch offline"
              items={completed}
              onPause={pause}
              onResume={resume}
              onRemove={remove}
              onChanged={refreshStorage}
              onPlay={(id) => {
                const it = completed.find((c) => c.id === id)
                if (it) navigate(`/watch/${it.animeId}/${it.id}`)
              }}
            />
          )}
          {deviceFiles && deviceFiles.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">On this device (MP4s)</h2>
              <ul className="space-y-2">
                {deviceFiles.map((f) => (
                  <li key={f.id} className="glass rounded-xl p-3 flex items-center gap-3">
                    <div className="w-12 aspect-[2/3] rounded-md bg-surface2 shrink-0 flex items-center justify-center">
                      <IconDownload width={18} height={18} className="text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.filename}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {formatBytes(f.bytes)} · {new Date(f.date).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        void openDeviceDownload(f.id).then((ok) => {
                          if (!ok) toast.error('Could not open the file')
                        })
                      }}
                      className="shrink-0 glass rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  items,
  onPause,
  onResume,
  onRemove,
  onChanged,
  onPlay,
}: {
  title: string
  items: import('../types').DownloadItem[]
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRemove: (id: string) => void
  onChanged: () => void
  onPlay?: (id: string) => void
}) {
  return (
    <section>
      <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">{title}</h2>
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d.id} className="glass rounded-xl p-3 flex items-center gap-3">
            <img src={d.poster} alt="" className="w-12 aspect-[2/3] object-cover rounded-md shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {d.animeTitle} <span className="text-muted font-normal">· EP {d.episodeNumber} · {d.quality}</span>
              </p>
              {d.status === 'error' ? (
                <p className="text-xs text-accent mt-1">{d.error ?? 'Failed'}</p>
              ) : d.status === 'resolving' && d.resolverProgress ? (
                <p className="text-xs text-brand mt-1 flex items-center gap-1">
                  <span className="animate-spin">⟳</span> {d.resolverProgress.message}
                </p>
              ) : (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-xs">
                    <div
                      className={classNames(
                        'h-full rounded-full transition-all',
                        d.status === 'completed' ? 'bg-emerald-400' : 'bg-gradient-to-r from-brand2 to-brand'
                      )}
                      style={{ width: `${d.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted shrink-0 tabular-nums">
                    {d.bytesTotal
                      ? `${formatBytes(d.bytesDone)} / ${formatBytes(d.bytesTotal)}`
                      : `${d.progress}%`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {d.status === 'completed' && !d.external && onPlay && (
                <button
                  onClick={() => onPlay(d.id)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-brand2 to-brand rounded-lg px-3 py-1.5 text-xs font-bold"
                >
                  <IconPlay width={13} height={13} /> Play
                </button>
              )}
              {d.status === 'completed' && d.external && (
                <span className="text-[11px] text-muted px-2">In Downloads folder</span>
              )}
              {d.status === 'downloading' && (
                <button onClick={() => onPause(d.id)} className="p-2 text-muted hover:text-white" aria-label="Pause">
                  <IconPause width={16} height={16} />
                </button>
              )}
              {(d.status === 'paused' || d.status === 'error') && (
                <button onClick={() => onResume(d.id)} className="p-2 text-muted hover:text-white" aria-label="Resume">
                  <IconPlay width={16} height={16} />
                </button>
              )}
              <button
                onClick={async () => {
                  await onRemove(d.id)
                  onChanged()
                }}
                className="p-2 text-muted hover:text-accent"
                aria-label="Delete"
              >
                <IconTrash width={16} height={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
