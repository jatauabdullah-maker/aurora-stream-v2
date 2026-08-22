import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePWAInstall } from '../../hooks/usePWA'
import { IconDevice, IconX, IconLogo } from './Icons'

export default function InstallPrompt() {
  const { canInstall, promptInstall } = usePWAInstall()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('aurora:install-dismissed') === '1'
  )
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (canInstall && !dismissed) {
      const t = setTimeout(() => setShow(true), 5000)
      return () => clearTimeout(t)
    }
  }, [canInstall, dismissed])

  const close = () => {
    setShow(false)
    setDismissed(true)
    localStorage.setItem('aurora:install-dismissed', '1')
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md"
        >
          <div className="glass rounded-2xl p-4 flex items-center gap-3 shadow-2xl">
            <IconLogo />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Install Aurora Stream</p>
              <p className="text-xs text-muted truncate">Add to your home screen for the full experience</p>
            </div>
            <button
              onClick={async () => {
                const ok = await promptInstall()
                if (ok) close()
              }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-brand2 to-brand px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
            >
              <IconDevice width={16} height={16} /> Install
            </button>
            <button onClick={close} className="text-muted hover:text-white p-1">
              <IconX width={18} height={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
