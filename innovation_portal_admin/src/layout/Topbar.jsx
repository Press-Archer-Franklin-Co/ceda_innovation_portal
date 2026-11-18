import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, Search, Bell, ChevronDown, LogOut, User, Settings, X, LayoutDashboard } from 'lucide-react'
import { cn } from '../lib/cn'
import { useLayout } from './LayoutContext'
import { useAuth } from '../lib/auth/AuthContext'

const ROUTE_LABELS = {
  dashboard:   'Dashboard',
  programs:    'Programs',
  new:         'New Program',
  submissions: 'Submissions',
  tasks:       'My Tasks',
  workflows:   'Workflow Setup',
  analytics:   'Analytics',
  users:       'Users',
  audit:       'Audit Logs',
  settings:    'Settings',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function useBreadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  return segments
    .filter((seg) => !UUID_RE.test(seg))
    .map((seg, i, filtered) => ({
      label:  ROUTE_LABELS[seg] ?? seg,
      href:   '/' + segments.slice(0, segments.indexOf(seg) + 1).join('/'),
      isLast: i === filtered.length - 1,
    }))
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { user, logout } = useAuth()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = user
    ? ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')) || user.username?.[0]?.toUpperCase() || '?'
    : '?'
  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username
    : 'Staff User'

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    window.location.href = window.location.origin + '/'
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ceda-surface transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-ceda-forest flex items-center justify-center flex-shrink-0 ring-2 ring-ceda-green/30">
          <span className="text-white text-xs font-semibold">{initials}</span>
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-ceda-dark leading-none truncate max-w-[120px]">{displayName}</p>
          <p className="text-xs text-ceda-muted mt-0.5 truncate max-w-[120px]">{user?.email ?? ''}</p>
        </div>
        <ChevronDown size={14} className="text-ceda-muted hidden sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-ceda-border shadow-modal z-50 py-1 animate-slide-down">
          <div className="px-3 py-2.5 border-b border-ceda-border">
            <p className="text-sm font-semibold text-ceda-dark">{displayName}</p>
            <p className="text-xs text-ceda-muted">{user?.email}</p>
            {user?.is_admin && (
              <span className="mt-1.5 inline-block text-[10px] font-semibold px-2 py-0.5 bg-ceda-green-pale text-ceda-forest rounded-full">
                Administrator
              </span>
            )}
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-ceda-dark hover:bg-ceda-surface transition-colors"
          >
            <User size={15} className="text-ceda-muted" />
            My Profile
          </Link>
          <Link
            to="/assignments"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-ceda-dark hover:bg-ceda-surface transition-colors"
          >
            <Settings size={15} className="text-ceda-muted" />
            My Work
          </Link>

          {user?.roles?.includes('innovator') && (
            <>
              <div className="border-t border-ceda-border mt-1 pt-1" />
              <a
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-ceda-forest hover:bg-ceda-green-pale transition-colors"
              >
                <LayoutDashboard size={15} className="text-ceda-forest" />
                Public Portal
              </a>
            </>
          )}

          <div className="border-t border-ceda-border mt-1 pt-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-ceda-red hover:bg-ceda-red-pale transition-colors"
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Topbar() {
  const { setSidebarOpen, setMobileSidebarOpen } = useLayout()
  const breadcrumbs = useBreadcrumbs()
  const [searchOpen, setSearchOpen] = useState(false)

  const toggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setMobileSidebarOpen(o => !o)
    } else {
      setSidebarOpen(o => !o)
    }
  }

  return (
    <header
      className="h-16 bg-white border-b border-ceda-border flex items-center px-4 gap-3 z-20 flex-shrink-0"
      style={{ boxShadow: '0 1px 0 #E6D9CF' }}
    >
      <button
        onClick={toggleSidebar}
        className="btn-icon flex-shrink-0"
        aria-label="Toggle sidebar"
      >
        <Menu size={20} />
      </button>

      <nav className="flex-1 min-w-0 hidden sm:flex items-center gap-1.5 text-sm overflow-hidden">
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={crumb.href}>
            {i > 0 && <span className="text-ceda-border">/</span>}
            {crumb.isLast
              ? <span className="font-medium text-ceda-dark truncate">{crumb.label}</span>
              : <Link to={crumb.href} className="text-ceda-muted hover:text-ceda-forest transition-colors truncate">{crumb.label}</Link>
            }
          </React.Fragment>
        ))}
      </nav>

      <div className="flex items-center gap-1 ml-auto">
        {searchOpen ? (
          <div className="flex items-center gap-2 bg-ceda-surface rounded-lg px-3 py-2 animate-fade-in">
            <Search size={15} className="text-ceda-muted flex-shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search submissions, programs…"
              className="bg-transparent text-sm text-ceda-dark placeholder:text-ceda-muted/60 outline-none w-52"
            />
            <button onClick={() => setSearchOpen(false)}>
              <X size={15} className="text-ceda-muted hover:text-ceda-dark" />
            </button>
          </div>
        ) : (
          <button onClick={() => setSearchOpen(true)} className="btn-icon">
            <Search size={18} />
          </button>
        )}

        <button className="btn-icon relative">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-ceda-red border border-white animate-pulse-dot" />
        </button>

        <UserMenu />
      </div>
    </header>
  )
}
