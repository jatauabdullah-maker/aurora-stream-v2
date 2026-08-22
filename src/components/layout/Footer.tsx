import { Link } from 'react-router-dom'
import { IconLogo } from '../common/Icons'

export default function Footer() {
  return (
    <footer className="border-t border-line mt-20 mb-16 md:mb-0">
      <div className="max-w-[1600px] mx-auto px-4 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <IconLogo />
          <span className="font-extrabold text-gradient">AURORA STREAM</span>
        </Link>
        <div className="flex gap-5 text-sm text-muted">
          <Link to="/library" className="hover:text-white transition-colors">My List</Link>
          <Link to="/downloads" className="hover:text-white transition-colors">Downloads</Link>
        </div>
      </div>
    </footer>
  )
}
