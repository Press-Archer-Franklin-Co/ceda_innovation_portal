import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Menu, PanelLeft, Search, Bell, ChevronDown, LogOut, User, BriefcaseBusiness, ExternalLink } from 'lucide-react'
import { cn } from '../lib/cn'
import { useLayout } from './LayoutContext'
import { useAuth } from '../lib/auth/AuthContext'
import { notifications } from '../lib/api/endpoints'
import { useT } from '../i18n/context'
import Avatar from '../components/ui/Avatar'
import LanguageSwitch from '../components/ui/LanguageSwitch'
import { buttonClasses } from '../components/ui/buttonClasses'
import { pollEvery } from '../lib/api/refusals'
import { CedaMark, CedaWord } from '../components/ui/Logo'

// Staff top bar: menu toggle, search, "View public site", bell with the real unread count, the user.
// Compact: 52px tall (64px from 2xl).

function UserMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { user, logout } = useAuth()

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const displayName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email : ''

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    window.location.href = window.location.origin + '/'
  }

  const item = 'flex items-center gap-2.5 px-3 h-9 rounded-control text-[13px] text-text hover:bg-surface2 focus-visible:outline-none focus-visible:bg-surface2'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('common.account')}
        className="flex items-center gap-2 pl-1 pr-1.5 h-9 rounded-control hover:bg-surface2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Avatar name={displayName || '?'} size="sm" decorative />
        <span className="hidden md:block text-left">
          <span className="block text-[13px] font-bold text-text leading-4 truncate max-w-[140px]">{displayName}</span>
          <span className="block text-[11px] text-muted leading-4 truncate max-w-[140px]">{user?.email ?? ''}</span>
        </span>
        <ChevronDown size={14} aria-hidden className="text-muted hidden md:block" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 w-60 bg-surface rounded-card border border-border shadow-pop z-50 p-1.5">
          <div className="px-3 py-2 border-b border-border mb-1">
            <p className="text-[13px] font-bold text-text truncate">{displayName}</p>
            <p className="text-[12px] text-muted truncate">{user?.email}</p>
          </div>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className={item}>
            <User size={15} aria-hidden className="text-muted" /> {t('staff.nav.settings')}
          </Link>
          <Link role="menuitem" to="/assignments" onClick={() => setOpen(false)} className={item}>
            <BriefcaseBusiness size={15} aria-hidden className="text-muted" /> {t('staff.nav.myWork')}
          </Link>
          <div className="px-3 py-2">
            <LanguageSwitch />
          </div>
          <div className="border-t border-border mt-1 pt-1">
            <button role="menuitem" type="button" onClick={handleLogout} className={cn(item, 'w-full text-danger')}>
              <LogOut size={15} aria-hidden /> {t('common.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SearchBox() {
  const t = useT()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      className="relative w-full max-w-[360px]"
      onSubmit={(e) => {
        e.preventDefault()
        const query = q.trim()
        if (query) navigate(`/submissions?search=${encodeURIComponent(query)}`)
      }}
    >
      <Search size={15} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('staff.search')}
        aria-label={t('staff.search')}
        className="w-full h-8 2xl:h-9 pl-8 pr-3 rounded-control bg-surface2 border border-transparent text-[13px] text-text placeholder:text-muted focus:outline-none focus:bg-surface focus:border-primary focus:shadow-focus"
      />
    </form>
  )
}

function BellButton() {
  const t = useT()
  // Real count from GET /api/notifications/unread-count/. Nothing is shown while it is unknown.
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notifications.unreadCount(),
    refetchInterval: pollEvery(60_000),
    staleTime: 30_000,
  })
  const count = typeof data?.unread_count === 'number' ? data.unread_count : undefined
  const label = count ? `${t('common.notifications')}, ${t('common.unread', { count })}` : t('common.notifications')
  return (
    <Link to="/settings" aria-label={label} className="btn-icon relative" data-toast-target>
      <Bell size={18} aria-hidden />
      {count > 0 && (
        <span aria-hidden className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold leading-4 text-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

export default function Topbar() {
  const t = useT()
  const { sidebarOpen, mobileSidebarOpen, setSidebarOpen, setMobileSidebarOpen, phone } = useLayout()
  const { can } = useAuth()
  const canSearch = can('entries.search') // GET /api/staff-search/

  const toggleSidebar = () => {
    if (phone) setMobileSidebarOpen((o) => !o)
    else setSidebarOpen((o) => !o)
  }
  const open = phone ? mobileSidebarOpen : sidebarOpen
  const label = phone ? (open ? t('staff.menu.closeMenu') : t('staff.menu.openMenu')) : open ? t('staff.collapse') : t('staff.expand')

  return (
    <header className="h-[52px] 2xl:h-16 bg-bg border-b border-border flex items-center px-3 2xl:px-5 gap-3 z-20 flex-shrink-0">
      <button type="button" onClick={toggleSidebar} className="btn-icon flex-shrink-0" aria-label={label} aria-expanded={open}>
        {phone ? <Menu size={18} aria-hidden /> : <PanelLeft size={18} aria-hidden />}
      </button>

      {/* Phone: the small mark rises on page open (U12); the menu itself is a drawer. */}
      {phone && (
        <Link to="/dashboard" className="flex items-center gap-2 flex-shrink-0 text-brand-text" aria-label="CEDA">
          <span className="relative block w-10 h-[21px] overflow-hidden">
            <span data-top-sun className="absolute inset-0 block"><CedaMark height={20.5} /></span>
          </span>
          <CedaWord width={44} />
        </Link>
      )}

      <div className="flex-1 min-w-0 flex items-center">{canSearch && <SearchBox />}</div>

      <div className="flex items-center gap-1.5 ml-auto">
        <a href="/" target="_blank" rel="noreferrer" className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'hidden sm:inline-flex' })}>
          {t('staff.viewSite')}
          <ExternalLink size={13} aria-hidden />
        </a>
        <BellButton />
        <UserMenu />
      </div>
    </header>
  )
}
