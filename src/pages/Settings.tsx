import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useDownloads } from '../hooks/useDownloads'
import { usePWAInstall } from '../hooks/usePWA'
import { classNames } from '../utils/helpers'
import { IconDevice, IconCheck, IconBack } from '../components/common/Icons'
import toast from 'react-hot-toast'

export default function Settings() {
  const { settings, updateSettings } = useApp()
  const { setConcurrency } = useDownloads()
  const { canInstall, installed, promptInstall } = usePWAInstall()
  const navigate = useNavigate()

  return (
    <div className="px-4 md:px-10 pt-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="glass rounded-full p-2 hover:bg-white/15 transition-colors"
          aria-label="Back"
        >
          <IconBack width={16} height={16} />
        </button>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Settings</h1>
      </div>

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
