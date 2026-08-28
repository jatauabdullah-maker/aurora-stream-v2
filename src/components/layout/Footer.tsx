import { Link } from 'react-router-dom'
import { IconLogo } from '../common/Icons'

export default function Footer() {
  return (
    <footer className="border-t border-line/50 mt-20 mb-16 md:mb-0">
      <div className="max-w-[1600px] mx-auto px-4 md:px-10 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2.5">
          <IconLogo />
          <span className="font-extrabold text-gradient">AURORA STREAM</span>
        </Link>
        <div className="flex gap-6 text-sm text-muted">
          <Link to="/library" className="hover:text-white transition-colors">My List</Link>
          <Link to="/downloads" className="hover:text-white transition-colors">Downloads</Link>
          <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>
        </div>
      </div>
      <div className="border-t border-line/30">
        <div className="max-w-[1600px] mx-auto px-4 md:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted/60">
          <span>Made with Aurora</span>
          <span className="font-medium tracking-wide">v3.0</span>
        </div>
      </div>
    </footer>
  )
}
