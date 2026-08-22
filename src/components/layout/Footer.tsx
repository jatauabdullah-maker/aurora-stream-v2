import { Link } from 'react-router-dom'
import { IconLogo } from '../common/Icons'

export default function Footer() {
  return (
    <footer className="border-t border-line mt-20 mb-16 md:mb-0">
      <div className="max-w-[1600px] mx-auto px-4 md:px-10 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <IconLogo />
          <span className="font-extrabold text-gradient">AURORA STREAM</span>
        </Link>
        <p className="text-xs text-muted text-center max-w-md">
          Aurora is a personal media interface. It does not host or distribute any content — connect it
          to your own licensed sources. You're responsible for the sources you plug in.
        </p>
        <div className="flex gap-5 text-sm text-muted">
          <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>
          <Link to="/library" className="hover:text-white transition-colors">My List</Link>
          <Link to="/downloads" className="hover:text-white transition-colors">Downloads</Link>
        </div>
      </div>
    </footer>
  )
}
