import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, LogOut, ChevronDown, User, LayoutDashboard, ShieldCheck, Bell, Briefcase } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'
import logoSrc from '../../assets/logo.png'

const STAFF_PORTAL_ROLES = [
  'administrator', 'admin',
  'innovation_officer', 'innovation_manager', 'innovation_analyst',
  'staff_member', 'specialist', 'exo', 'management_viewer',
  'judge', 'reviewer',
  'mentor',
]

const publicLinks = [
  { to: '/',           label: 'Home' },
  { to: '/challenges', label: 'Challenges' },
  { to: '/news',       label: 'News' },
  { to: '/skills',     label: 'Community' },
  { to: '/about',      label: 'About' },
  { to: '/faq',        label: 'FAQ' },
]

const authLinks = [
  { to: '/',            label: 'Home' },
  { to: '/challenges',  label: 'Challenges' },
  { to: '/news',        label: 'News' },
  { to: '/skills',      label: 'Community' },
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/about',       label: 'About' },
  { to: '/faq',         label: 'FAQ' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenu,   setUserMenu]   = useState(false)
  const { user, isAuthenticated, logout } = useAuth()
  const navigate   = useNavigate()
  const menuRef    = useRef<HTMLDivElement>(null)

  const navLinks  = isAuthenticated ? authLinks : publicLinks
  const canStaff  = isAuthenticated && (user?.roles ?? []).some(r => STAFF_PORTAL_ROLES.includes(r))
  const staffPortalHref = '/staff/dashboard'

  useEffect(() => {
    if (!userMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenu])

  const handleLogout = async () => {
    await logout()
    setUserMenu(false)
    navigate('/')
  }

  const initials = user
    ? (user.first_name.charAt(0) + user.last_name.charAt(0)).toUpperCase()
    : ''

  return (
    <header
      className="sticky top-0 z-40 bg-white border-b border-gray-100/80"
      style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-[62px] gap-8">

          <Link to="/" className="shrink-0 flex items-center gap-3">
            <img src={logoSrc} alt="CEDA Innovation Portal" className="h-9 w-auto" />
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex flex-col leading-none">
              <span style={{ fontFamily: 'Poppins', fontWeight: 900, fontSize: 22, color: '#A01E0A', lineHeight: 1 }}>
                ceda
              </span>
              <span className="text-[10px] font-semibold text-gray-400 tracking-[0.05em] mt-[4px]">
                Innovation Portal
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-5 flex-1 justify-center">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to + label}
                to={to}
                end={to === '/'}
                className={({ isActive }) => isActive ? 'nav-link-active' : 'nav-link'}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            {isAuthenticated ? (
              <>
                <button
                  className="relative w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  title="Notifications"
                  aria-label="Notifications"
                >
                  <Bell size={17} />
                </button>

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setUserMenu(!userMenu)}
                    className="flex items-center gap-2 pl-1 pr-2.5 py-1.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                      style={{ background: '#A01E0A' }}
                    >
                      {initials}
                    </div>
                    <span className="max-w-[88px] truncate text-[13px]">{user?.first_name}</span>
                    <ChevronDown
                      size={13}
                      className={clsx('text-gray-400 transition-transform duration-150', userMenu && 'rotate-180')}
                    />
                  </button>

                  {userMenu && (
                    <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden animate-fade-in">
                      <div className="px-4 py-2.5 border-b border-gray-100">
                        <p className="text-[11px] text-gray-400 mb-0.5">Signed in as</p>
                        <p className="text-xs font-semibold text-gray-800 truncate">{user?.email}</p>
                      </div>

                      <Link
                        to="/dashboard"
                        onClick={() => setUserMenu(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <LayoutDashboard size={13} className="text-gray-400" /> Dashboard
                      </Link>
                      <Link
                        to="/profile"
                        onClick={() => setUserMenu(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <User size={13} className="text-gray-400" /> My Profile
                      </Link>
                      <Link
                        to="/security"
                        onClick={() => setUserMenu(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <ShieldCheck size={13} className="text-gray-400" /> Account Security
                      </Link>

                      {canStaff && (
                        <>
                          <div className="border-t border-gray-100 mt-1 pt-1" />
                          <a
                            href={staffPortalHref}
                            onClick={() => setUserMenu(false)}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#A01E0A] hover:bg-[#A01E0A]/5 transition-colors"
                          >
                            <Briefcase size={13} className="text-[#A01E0A]" /> Staff Portal
                          </a>
                        </>
                      )}

                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <LogOut size={13} /> Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-[13px] font-medium text-gray-600 hover:text-[#A01E0A] px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Sign in
                </Link>
                <Link to="/signup" className="btn-dark text-[13px] px-4 py-2">
                  Register
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden ml-auto p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 animate-fade-in max-h-[85vh] overflow-y-auto">

          {isAuthenticated && user && (
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50/60">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                style={{ background: '#A01E0A' }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{user.first_name} {user.last_name}</p>
                <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
              </div>
            </div>
          )}

          <nav className="px-4 py-2 space-y-0.5">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to + label}
                to={to}
                end={to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'block px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors',
                    isActive ? 'bg-[#A01E0A] text-white' : 'text-gray-700 hover:bg-gray-50'
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {isAuthenticated && (
            <div className="px-4 pb-2 space-y-0.5 border-t border-gray-100 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 py-1.5">Account</p>
              <Link
                to="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13.5px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User size={15} className="text-gray-400" /> My Profile
              </Link>
              <Link
                to="/security"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13.5px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ShieldCheck size={15} className="text-gray-400" /> Account Security
              </Link>
              {canStaff && (
                <a
                  href={staffPortalHref}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13.5px] font-medium text-[#A01E0A] hover:bg-[#A01E0A]/5 transition-colors"
                >
                  <Briefcase size={15} className="text-[#A01E0A]" /> Staff Portal
                </a>
              )}
            </div>
          )}

          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            {isAuthenticated ? (
              <button
                onClick={() => { handleLogout(); setMobileOpen(false) }}
                className="flex-1 py-2.5 text-sm text-red-500 border border-red-100 rounded-xl bg-red-50 font-medium flex items-center justify-center gap-1.5"
              >
                <LogOut size={14} /> Sign out
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 py-2.5 text-[13px] text-center border border-gray-200 rounded-xl text-gray-700 font-medium"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 py-2.5 text-[13px] text-center bg-[#A01E0A] text-white rounded-xl font-semibold"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
