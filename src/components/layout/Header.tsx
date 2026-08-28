import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IconSearch, IconLogo, IconDevice, IconSettings } from '../common/Icons'
import { usePWAInstall } from '../../hooks/usePWA'
import { classNames } from '../../utils/helpers'

const links = [
  { to: '/', label: 'Home' },
  { to: '/search', label: 'Discover' },
  { to: '/library', label: 'My List' },
  { to: '/downloads', label: 'Downloads' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { canInstall, promptInstall } = usePWAInstall()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <motion.header
      initial={{ y: -70 }}
      animate={{ y: 0 }}
      className={classNames(
        'fixed top-0 inset-x-0 z-40 transition-all duration-300',
        scrolled ? 'glass !bg-bg/80 shadow-lg shadow-black/40' : 'bg-gradient-to-b from-black/70 to-transparent'
      )}
    >
      <div className="max-w-[1600px] mx-auto flex items-center gap-4 md:gap-8 px-4 md:px-10 h-16">
        <Link to="/" className="flex items-center gap-2 shrink-0 -m-2 p-2" aria-label="Aurora Stream home">
          <IconLogo />
          <span className="text-xl font-extrabold tracking-tight text-gradient hidden sm:inline">
            AURORA
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                classNames(
                  'px-3.5 py-2 rounded-lg text-sm font-medium transition-colors relative',
                  isActive ? 'text-white' : 'text-muted hover:text-white hover:bg-white/5'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-gradient-to-r from-brand2 to-brand rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <form onSubmit={submit} className="relative hidden sm:block w-40 focus-within:w-64 transition-all">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search anime..."
            className="w-full bg-white/8 border border-line rounded-full pl-9 pr-4 py-2 text-sm outline-none focus:border-brand/60 focus:bg-white/12 transition-colors placeholder:text-muted"
          />
        </form>

        {canInstall && (
          <button
            onClick={() => promptInstall()}
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold bg-gradient-to-r from-brand2 to-brand px-3.5 py-2 rounded-full"
          >
            <IconDevice width={15} height={15} /> Get App
          </button>
        )}

        <Link
          to="/settings"
          aria-label="Settings"
          className="text-muted hover:text-white transition-colors -m-2.5 p-2.5"
        >
          <IconSettings width={20} height={20} />
        </Link>
      </div>
    </motion.header>
  )
}
