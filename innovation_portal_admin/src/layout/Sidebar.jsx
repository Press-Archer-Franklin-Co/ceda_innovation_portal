import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BriefcaseBusiness, Layers,
  ClipboardList, Star, GitBranch, BookOpen,
  BarChart3, Users, Settings, ScrollText, ShieldCheck, Newspaper, History, FileText, SlidersHorizontal,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useLayout } from './LayoutContext'
import { useAuth } from '../lib/auth/AuthContext'
import { isAdminOrManager, isInnovationOfficer, isPureJudge, isJudge } from '../lib/auth/permissions'
import CedaInnovationHubLogo from '../components/brand/CedaInnovationHubLogo'


const NAV = [
  { label: 'Dashboard', href: '/dashboard',  icon: LayoutDashboard },
  { label: 'My Work',   href: '/assignments', icon: BriefcaseBusiness },
  { label: 'History',   href: '/history',     icon: History },

  { section: 'Work' },
  { label: 'Programs',    href: '/programs',    icon: Layers,        officerOrAbove: true },
  { label: 'Submissions', href: '/submissions', icon: ClipboardList, officerOrAbove: true },

  { section: 'Content', officerOrAbove: true },
  { label: 'Content Management', href: '/content', icon: Newspaper, officerOrAbove: true },

  { section: 'Setup', adminOnly: true },
  { label: 'Workflow Definitions', href: '/admin/workflows',       icon: GitBranch,  adminOnly: true },
  { label: 'Marking Criteria',     href: '/marking-criteria',  icon: BookOpen,   adminOnly: true },
  { label: 'Terms & Conditions',   href: '/admin/terms',       icon: FileText,   adminOnly: true },
  { label: 'Analytics',            href: '/analytics',       icon: BarChart3,  adminOnly: true },
  { label: 'Users',                href: '/users',            icon: Users,      adminOnly: true },
  { label: 'Audit Logs',           href: '/audit',            icon: ScrollText, adminOnly: true },
  { label: 'Platform settings',    href: '/admin/platform',   icon: SlidersHorizontal, adminOnly: true },

  { section: 'Account' },
  { label: 'Settings', href: '/settings', icon: Settings },
]


function NavItem({ item }) {
  const location = useLocation()
  const Icon = item.icon

  const isActive = (() => {
    if (item.href === '/admin/workflows') return location.pathname.startsWith('/admin/workflows')
    return location.pathname === item.href || location.pathname.startsWith(item.href + '/')
  })()

  return (
    <NavLink
      to={item.href}
      className={cn(
        'flex items-center gap-3 pl-3 pr-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
        isActive
          ? 'bg-white/15 text-white'
          : 'text-white/65 hover:bg-white/10 hover:text-white'
      )}
    >
      {Icon && <Icon size={16} strokeWidth={1.75} className="flex-shrink-0" />}
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}


function SectionLabel({ label }) {
  return (
    <p className="px-3 pt-5 pb-1 text-[10px] font-semibold tracking-widest uppercase text-white/30 select-none">
      {label}
    </p>
  )
}


export default function Sidebar() {
  const { sidebarOpen, mobileSidebarOpen } = useLayout()
  const visible = sidebarOpen || mobileSidebarOpen
  const { user } = useAuth()
  const adminManager    = isAdminOrManager(user)
  const officerOrAbove  = isInnovationOfficer(user)
  const judgeOnly       = isPureJudge(user)
  const canEvaluate     = isJudge(user)
  const items = NAV.filter(item => {
        if (item.adminOnly      && !adminManager)   return false
        if (item.officerOrAbove && !officerOrAbove) return false
        if (item.judgeOrAdmin   && !canEvaluate)    return false
        return true
      })

  const roleLabel = adminManager ? 'Admin access' : officerOrAbove ? 'Officer access' : judgeOnly ? 'Judge access' : canEvaluate ? 'Staff access' : null

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-full z-40 flex flex-col',
        'bg-ceda-forest transition-transform duration-200',
        'w-[var(--sidebar-width)]',
        visible ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="h-20 flex items-center px-4 border-b border-white/10 flex-shrink-0">
        <CedaInnovationHubLogo />
      </div>

      <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-2">
        {items.map((item, i) => {
          if (item.section) {
            return <SectionLabel key={item.section + i} label={item.section} />
          }
          return <NavItem key={item.href} item={item} />
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
        {roleLabel && (
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldCheck size={11} className="text-white/30" />
            <p className="text-white/30 text-[10px]">{roleLabel}</p>
          </div>
        )}
        <p className="text-white/20 text-[10px]">CEDA Innovation Portal · Staff</p>
      </div>
    </aside>
  )
}
