import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Briefcase, LayoutDashboard, LogOut, Menu, ShieldCheck, User, X } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import type { StringKey } from '../../i18n'
import Logo from '../ui/Logo'
import Avatar from '../ui/Avatar'
import LanguageSwitch from '../ui/LanguageSwitch'
import { buttonClasses } from '../ui/Button'
import { useFocusTrap } from '../ui/useFocusTrap'
import { useShellSettings, useUnreadCount } from './shellData'

// Figma 1 · Public home › Header (10:190), Mobile header (10:801), Menu drawer (11:695).

const STAFF_PORTAL_ROLES = [
  'administrator', 'admin',
  'innovation_officer', 'innovation_manager', 'innovation_analyst',
  'staff_member', 'specialist', 'exo', 'management_viewer',
  'judge', 'reviewer',
  'mentor',
]

export const SUBMIT_PATH = '/innovate'

interface NavItem {
  to: string
  key: StringKey
  end?: boolean
}

const mainLinks: NavItem[] = [
  { to: '/', key: 'nav.home', end: true },
  { to: SUBMIT_PATH, key: 'nav.submit' },
  { to: '/challenges', key: 'nav.challenges' },
  { to: '/news', key: 'nav.news' },
  { to: '/stories', key: 'nav.stories' },
  { to: '/faq', key: 'nav.help' },
]

const myIdeas: NavItem = { to: '/dashboard', key: 'nav.myIdeas' }

export function UtilityBar() {
  const { t } = useI18n()
  const settings = useShellSettings()
  const linkCls = 'hover:text-on-banner hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-banner rounded'
  return (
    <div className="hidden lg:block bg-banner-deep text-banner-muted text-d-cap font-body">
      <div className="max-w-[1200px] mx-auto px-6 h-[34px] flex items-center justify-between gap-6">
        <p className="truncate">{t('utility.official')}</p>
        <div className="flex items-center gap-6 shrink-0">
          {settings.whatsapp_number && (
            <a className={linkCls} href={`https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
              {t('utility.whatsapp', { number: settings.whatsapp_number })}
            </a>
          )}
          <Link className={linkCls} to={settings.help_centre_url ?? '/faq'}>
            {t('utility.helpCentre')}
          </Link>
          <Link className={linkCls} to={settings.accessibility_url ?? '/faq' /* TODO(U2): accessibility statement page */}>
            {t('utility.accessibility')}
          </Link>
          <LanguageSwitch tone="dark" />
        </div>
      </div>
    </div>
  )
}

function DesktopLink({ item }: { item: NavItem }) {
  const { t } = useI18n()
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        clsx(
          'group relative flex flex-col items-center gap-1.5 pt-1.5 text-d-label font-body whitespace-nowrap rounded',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4',
          isActive ? 'text-primary' : 'text-text hover:text-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          {t(item.key)}
          <span aria-hidden className={clsx('h-[3px] w-6 rounded-[2px]', isActive ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/30')} />
        </>
      )}
    </NavLink>
  )
}

function BellButton({ count }: { count?: number }) {
  const { t } = useI18n()
  const label = count ? `${t('common.notifications')}, ${t('common.unread', { count })}` : t('common.notifications')
  return (
    <Link
      to="/dashboard?tab=updates"
      aria-label={label}
      className="relative w-10 h-10 rounded-full border border-border flex items-center justify-center text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Bell size={18} aria-hidden />
      {count !== undefined && count > 0 && (
        <span aria-hidden className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-on-primary text-[11px] font-bold leading-[18px] text-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

function UserMenu({ canStaff, onLogout }: { canStaff: boolean; onLogout: () => void }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const name = `${user.first_name} ${user.last_name}`.trim() || user.email
  const item = 'flex items-center gap-2.5 px-3 py-2 rounded-control text-d-body-s text-text hover:bg-surface2 focus-visible:outline-none focus-visible:bg-surface2'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('common.account')}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Avatar name={name} size="md" decorative />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-card bg-surface border border-border shadow-pop p-2 z-50">
          <div className="px-3 py-2 border-b border-border mb-1">
            <p className="text-d-label text-text truncate">{name}</p>
            <p className="text-d-cap text-muted truncate">{user.email}</p>
          </div>
          <Link role="menuitem" to="/dashboard" className={item} onClick={() => setOpen(false)}>
            <LayoutDashboard size={16} aria-hidden className="text-muted" /> {t('nav.myIdeas')}
          </Link>
          <Link role="menuitem" to="/profile" className={item} onClick={() => setOpen(false)}>
            <User size={16} aria-hidden className="text-muted" /> {t('nav.profile')}
          </Link>
          <Link role="menuitem" to="/security" className={item} onClick={() => setOpen(false)}>
            <ShieldCheck size={16} aria-hidden className="text-muted" /> {t('nav.security')}
          </Link>
          {canStaff && (
            <a role="menuitem" href="/staff/dashboard" className={item}>
              <Briefcase size={16} aria-hidden className="text-muted" /> {t('nav.staff')}
            </a>
          )}
          <button role="menuitem" type="button" onClick={onLogout} className={clsx(item, 'w-full text-danger')}>
            <LogOut size={16} aria-hidden /> {t('common.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}

function MenuDrawer({ open, onClose, links, canStaff, onLogout }: { open: boolean; onClose: () => void; links: NavItem[]; canStaff: boolean; onLogout: () => void }) {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()
  const settings = useShellSettings()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open, onClose)
  if (!open) return null
  const row = 'flex items-center min-h-[48px] px-1 text-d-h5 font-heading text-text border-b border-border'
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim/45" aria-hidden onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t('common.menu')} className="absolute inset-y-0 right-0 w-full max-w-[390px] bg-bg flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-5 h-[60px] border-b border-border shrink-0">
          <Logo className="scale-[0.8] origin-left" />
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-control text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X size={22} aria-hidden />
          </button>
        </div>
        <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-5 py-2">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} onClick={onClose} className={({ isActive }) => clsx(row, isActive && 'text-primary')}>
              {t(l.key)}
            </NavLink>
          ))}
          {isAuthenticated && (
            <>
              <Link to="/profile" onClick={onClose} className={row}>{t('nav.profile')}</Link>
              {canStaff && <a href="/staff/dashboard" className={row}>{t('nav.staff')}</a>}
              <button type="button" onClick={onLogout} className={clsx(row, 'w-full text-danger')}>{t('common.signOut')}</button>
            </>
          )}
          <div className="py-5 space-y-3 text-d-body-s text-muted">
            <LanguageSwitch />
            {(settings.whatsapp_number || settings.ussd_code || settings.call_centre_number) && (
              <div className="space-y-1.5">
                <p className="text-d-label text-text">{t('footer.otherWays')}</p>
                {settings.whatsapp_number && <p>{t('utility.whatsapp', { number: settings.whatsapp_number })}</p>}
                {settings.ussd_code && <p>{t('footer.ussd', { code: settings.ussd_code })}</p>}
                {settings.call_centre_number && <p>{t('footer.callCentreNumber', { number: settings.call_centre_number })}</p>}
              </div>
            )}
          </div>
        </nav>
        <div className="p-5 border-t border-border shrink-0 space-y-3">
          {!isAuthenticated && (
            <Link to="/login" onClick={onClose} className={buttonClasses({ variant: 'secondary', block: true })}>
              {t('common.signIn')}
            </Link>
          )}
          <Link to={SUBMIT_PATH} onClick={onClose} className={buttonClasses({ variant: 'primary', block: true })}>
            {t('nav.submit')}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const unread = useUnreadCount(isAuthenticated)

  const canStaff = isAuthenticated && (user?.roles ?? []).some((r) => STAFF_PORTAL_ROLES.includes(r))
  const links = isAuthenticated ? [...mainLinks.slice(0, 2), myIdeas, ...mainLinks.slice(2)] : mainLinks

  useEffect(() => setMenuOpen(false), [pathname])

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 bg-bg">
      <UtilityBar />
      <div className="border-b border-border">
        <div className="max-w-[1200px] mx-auto px-5 lg:px-6 h-[60px] lg:h-[72px] flex items-center justify-between gap-6">
          <Link to="/" className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
            <Logo className="hidden lg:inline-flex" />
            <Logo className="lg:hidden scale-[0.8] origin-left" />
          </Link>

          <nav aria-label={t('nav.main')} className="hidden lg:flex items-center gap-7">
            {links.map((l) => (
              <DesktopLink key={l.to} item={l} />
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            {isAuthenticated ? (
              <>
                <BellButton count={unread} />
                <UserMenu canStaff={canStaff} onLogout={handleLogout} />
              </>
            ) : (
              <Link to="/login" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                {t('common.signIn')}
              </Link>
            )}
            <Link to={SUBMIT_PATH} className={buttonClasses({ variant: 'primary', size: 'sm' })}>
              {t('nav.submit')}
            </Link>
          </div>

          <div className="flex lg:hidden items-center gap-1 -mr-2">
            {isAuthenticated && <BellButton count={unread} />}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t('common.menu')}
              aria-expanded={menuOpen}
              className="w-11 h-11 flex items-center justify-center rounded-control text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Menu size={22} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} links={links} canStaff={canStaff} onLogout={handleLogout} />
    </header>
  )
}
