import { useApp } from '../context/AppContext'
import { useDownloads } from '../hooks/useDownloads'
import { usePWAInstall } from '../hooks/usePWA'
import { classNames } from '../utils/helpers'
import { IconDevice, IconCheck } from '../components/common/Icons'
import toast from 'react-hot-toast'

const QUALITIES = ['2160p', '1080p', '720p', '480p', '360p']

export default function Settings() {
  const { settings, updateSettings } = useApp()
  const { setConcurrency } = useDownloads()
  const { canInstall, installed, promptInstall } = usePWAInstall()

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

  return (
    <div className="px-4 md:px-10 pt-20 max-w-2xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Settings</h1>

      <div className="space-y-4 mt-8">
        <Section title="App">
          <div className="flex items-center justify-between gap-4 py-1">
            <div>
              <p className="text-sm font-semibold">Install Aurora Stream</p>
              <p className="text-xs text-muted mt-0.5">
                {installed ? 'Installed — you\'re running the app right now.' : 'Add to your home screen for an app-like experience.'}
              </p>
            </div>
            {installed ? (
              <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-semibold">
                <IconCheck width={16} height={16} /> Installed
              </span>
            ) : canInstall ? (
              <button
                onClick={async () => {
                  const ok = await promptInstall()
                  if (ok) toast.success('Installed!')
                }}
                className="flex items-center gap-2 bg-gradient-to-r from-brand2 to-brand px-4 py-2 rounded-xl text-sm font-bold"
              >
                <IconDevice width={15} height={15} /> Install
              </button>
            ) : (
              <span className="text-xs text-muted">Use your browser's "Install app" / "Add to Home Screen" option</span>
            )}
          </div>
        </Section>

        <Section title="Playback">
          <Row label="Preferred quality" hint="Used for streaming picks and downloads">
            <select
              value={settings.preferredQuality}
              onChange={(e) => updateSettings({ preferredQuality: e.target.value })}
              className="bg-surface2 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
            >
              {QUALITIES.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </Row>
          <Row label="Autoplay next episode" hint="Jump to the next episode when the current one ends">
            <Toggle
              on={settings.autoplayNext}
              onChange={(v) => updateSettings({ autoplayNext: v })}
            />
          </Row>
        </Section>

        <Section title="Downloads">
          <Row label="Simultaneous downloads" hint="How many episodes download at once">
            <select
              value={settings.maxConcurrentDownloads}
              onChange={(e) => {
                const n = Number(e.target.value)
                updateSettings({ maxConcurrentDownloads: n })
                setConcurrency(n)
              }}
              className="bg-surface2 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Row>
          <Row label="Merge subtitles" hint="Embed subtitles into downloaded files (requires backend support)">
            <Toggle
              on={settings.downloadSubtitlesMerged}
              onChange={(v) => updateSettings({ downloadSubtitlesMerged: v })}
            />
          </Row>
        </Section>

        <Section title="Content Source">
          <Row label="API endpoint" hint="Set VITE_API_BASE_URL in .env.local and restart">
            <code className="text-xs bg-surface2 px-3 py-2 rounded-lg text-brand break-all">{apiBase}</code>
          </Row>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Aurora connects to a content API you provide. This client does not include or endorse any
            particular source — plug in your own backend serving licensed or personal media.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={classNames(
        'w-11 h-6 rounded-full relative transition-colors',
        on ? 'bg-gradient-to-r from-brand2 to-brand' : 'bg-surface2 border border-line'
      )}
    >
      <span
        className={classNames(
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
          on ? 'left-[22px]' : 'left-0.5'
        )}
      />
    </button>
  )
}
