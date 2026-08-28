import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { usePWAInstall } from '../hooks/usePWA'
import { checkExtension } from '../services/extension'
import { classNames } from '../utils/helpers'
import { IconDevice, IconCheck, IconBack, IconDownload } from '../components/common/Icons'
import toast from 'react-hot-toast'

export default function Settings() {
  const { settings, updateSettings } = useApp()
  const { canInstall, installed, promptInstall } = usePWAInstall()
  const navigate = useNavigate()
  const [extStatus, setExtStatus] = useState<{ installed: boolean; version?: string } | null>(null)
  const [checking, setChecking] = useState(false)

  const runCheck = async (announce = true) => {
    setChecking(true)
    const res = await checkExtension()
    setExtStatus(res)
    setChecking(false)
    if (announce) {
      if (res.installed) toast.success(`Aurora Downloader detected (v${res.version})`)
      else toast('Extension not detected', { icon: '🔍' })
    }
    return res
  }

  // after a reload triggered by Re-check, auto-run the check
  useEffect(() => {
    if (sessionStorage.getItem('aurora:ext-recheck') === '1') {
      sessionStorage.removeItem('aurora:ext-recheck')
      void runCheck(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recheckWithReload = () => {
    sessionStorage.setItem('aurora:ext-recheck', '1')
    window.location.reload()
  }

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
                className="btn-shimmer flex items-center gap-2 bg-gradient-to-r from-brand2 to-brand px-4 py-2 rounded-xl text-sm font-bold"
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
          <p className="text-xs text-muted -mt-1">
            Downloads run through the Aurora Downloader extension and save for offline watching.
            Episodes are fetched one at a time with pacing to keep the source happy.
          </p>

          <div className="border-t border-line pt-4 mt-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold flex items-center gap-2">
                  Aurora Downloader (PC)
                  {extStatus?.installed && (
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                      <IconCheck width={13} height={13} /> Active
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {extStatus === null
                    ? 'One-click automatic episode downloads. Runs in your browser — no server needed.'
                    : extStatus.installed
                      ? `Connected (v${extStatus.version}). Downloads save straight to your Downloads folder.`
                      : 'Not detected. Install it below — takes about 30 seconds, once.'}
                </p>
              </div>
              <button
                onClick={() => (extStatus === null ? void runCheck(true) : recheckWithReload())}
                disabled={checking}
                className="shrink-0 glass px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
              >
                {checking ? 'Checking...' : extStatus === null ? 'Check' : 'Re-check'}
              </button>
            </div>

            {extStatus !== null && !extStatus.installed && (
              <div className="mt-4 bg-surface2 border border-line rounded-xl p-4">
                <a
                  href="/aurora-downloader.zip"
                  download
                  className="btn-shimmer flex items-center justify-center gap-2 bg-gradient-to-r from-brand2 to-brand rounded-xl py-2.5 font-bold text-sm mb-4"
                >
                  <IconDownload width={15} height={15} /> Step 1 — Download the extension
                </a>
                <ol className="text-xs text-muted space-y-2 list-none">
                  <li className="flex gap-2">
                    <span className="text-brand font-bold">2.</span>
                    <span>Unzip the file to a folder you'll keep (e.g. Documents)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand font-bold">3.</span>
                    <span>
                      Open <code className="text-brand">chrome://extensions</code> in a new tab
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand font-bold">4.</span>
                    <span>Turn on <b className="text-white">Developer mode</b> (top-right toggle)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand font-bold">5.</span>
                    <span>
                      Click <b className="text-white">Load unpacked</b> and pick the unzipped folder
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand font-bold">6.</span>
                    <span>Come back here and hit <b className="text-white">Re-check</b> — done forever</span>
                  </li>
                </ol>
                <p className="text-[11px] text-muted mt-3 leading-relaxed">
                  Works with Chrome, Edge and Brave on Windows/Mac/Linux. Downloads save to your normal
                  Downloads folder and run at your own connection speed.
                </p>
              </div>
            )}

            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              📱 Mobile: automatic downloads need a browser that supports extensions — use
              <b className="text-white"> Firefox or Chrome on Android</b>. On iOS, streaming works great but
              downloads aren't possible.
            </p>
          </div>
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
