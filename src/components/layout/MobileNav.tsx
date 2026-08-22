import { NavLink } from 'react-router-dom'
import { IconHome, IconSearch, IconLibrary, IconDownload } from '../common/Icons'
import { classNames } from '../../utils/helpers'

const items = [
  { to: '/', icon: IconHome, label: 'Home' },
  { to: '/search', icon: IconSearch, label: 'Search' },
  { to: '/library', icon: IconLibrary, label: 'My List' },
  { to: '/downloads', icon: IconDownload, label: 'Downloads' },
]

export default function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass !bg-bg/90 border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              classNames(
                'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-brand' : 'text-muted'
              )
            }
          >
            <Icon width={20} height={20} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
