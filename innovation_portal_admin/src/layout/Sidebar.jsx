import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BarChart3, ClipboardList, BriefcaseBusiness, Layers, BookOpen,
  Newspaper, Trophy, Quote, HelpCircle, Users, SlidersHorizontal, ScrollText, GitBranch, FileText, ShieldCheck,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useLayout } from './LayoutContext'
import { useAuth } from '../lib/auth/AuthContext'
import { useT } from '../i18n/context'
import Logo from '../components/ui/Logo'

// Staff sidebar: chocolate banner, grouped as Overview, Challenges, Website content, Admin.
// Compact by default (216px wide, 32px rows, 13px text), roomier from 2xl (248px, 38px, 14px).
// Each item names the capability (S1) the API checks behind it; an item is hidden when the person does not
// hold it, and a group with nothing left is hidden. No role names here (ceda-security).
// Items whose screens do not exist yet (Home page 3.8, Partners 3.12) are added with U6.

const GROUPS = [
  {
    key: 'overview',
    label: 'staff.group.overview',
    items: [
      { label: 'staff.nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'staff.nav.reports', href: '/analytics', icon: BarChart3, capability: 'analytics.view' },
      { label: 'staff.nav.reviewQueue', href: '/submissions', icon: ClipboardList, capability: 'entries.search' },
      { label: 'staff.nav.myWork', href: '/assignments', icon: BriefcaseBusiness, capability: 'entries.review', match: ['/assignments', '/history', '/tasks', '/evaluate'] },
    ],
  },
  {
    key: 'challenges',
    label: 'staff.group.challenges',
    items: [
      { label: 'staff.nav.challenges', href: '/programs', icon: Layers, capability: 'challenges.manage' },
      { label: 'staff.nav.criteria', href: '/marking-criteria', icon: BookOpen, capability: 'criteria.manage' },
      { label: 'staff.nav.forms', href: '/forms', icon: FileText, capability: 'forms.manage' },
    ],
  },
  {
    key: 'website',
    label: 'staff.group.website',
    // The approvals entry (U6) takes `anyOf: ['content.edit', 'content.approve']`, so someone who only approves
    // still sees this group; editor items keep content.edit.
    items: [
      { label: 'staff.nav.news', href: '/content?tab=news', icon: Newspaper, capability: 'content.edit', tab: 'news', defaultTab: true },
      { label: 'staff.nav.stories', href: '/content?tab=winners', icon: Trophy, capability: 'content.edit', tab: 'winners' },
      { label: 'staff.nav.quotes', href: '/content?tab=leadership', icon: Quote, capability: 'content.edit', tab: 'leadership' },
      { label: 'staff.nav.faqs', href: '/content?tab=faqs', icon: HelpCircle, capability: 'content.edit', tab: 'faqs' },
    ],
  },
  {
    key: 'admin',
    label: 'staff.group.admin',
    items: [
      { label: 'staff.nav.users', href: '/users', icon: Users, capability: 'users.manage' },
      { label: 'staff.nav.settings', href: '/admin/platform', icon: SlidersHorizontal, capability: 'settings.manage' },
      { label: 'staff.nav.workflows', href: '/admin/workflows', icon: GitBranch, capability: 'entries.assign' },
      { label: 'staff.nav.terms', href: '/admin/terms', icon: FileText, capability: 'challenges.manage' },
      { label: 'staff.nav.audit', href: '/audit', icon: ScrollText, capability: 'audit.view' },
    ],
  },
]

function useIsActive(item) {
  const { pathname, search } = useLocation()
  if (item.tab) {
    if (pathname !== '/content' && !pathname.startsWith('/content/')) return false
    const tab = new URLSearchParams(search).get('tab')
    if (pathname.startsWith('/content/')) return pathname.startsWith(`/content/${item.tab}`) || (item.tab === 'news' && pathname.startsWith('/content/hackathons'))
    return tab === item.tab || (!tab && item.defaultTab)
  }
  const prefixes = item.match ?? [item.href]
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function NavItem({ item }) {
  const t = useT()
  const active = useIsActive(item)
  const Icon = item.icon
  return (
    <NavLink
      to={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-8 2xl:h-[38px] rounded-control text-[13px] 2xl:text-[14px] font-body transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-banner',
        active ? 'bg-banner-deep text-on-banner font-bold' : 'text-banner-muted hover:bg-on-banner/10 hover:text-on-banner',
      )}
    >
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className="flex-shrink-0" />}
      <span className="truncate">{t(item.label)}</span>
    </NavLink>
  )
}

/** previewUser: only for the styleguide's shell preview. */
export default function Sidebar({ previewUser } = {}) {
  const t = useT()
  const { sidebarOpen, mobileSidebarOpen } = useLayout()
  const visible = sidebarOpen || mobileSidebarOpen
  const auth = useAuth()
  // previewUser (styleguide) carries its own capabilities list.
  const capabilities = previewUser ? previewUser.capabilities ?? [] : auth?.capabilities ?? []
  const can = (c) => capabilities.includes(c)

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => (item.anyOf ? item.anyOf.some(can) : !item.capability || can(item.capability))),
  })).filter((g) => g.items.length > 0)

  const roleLabel = can('settings.manage')
    ? 'Admin access'
    : can('entries.assign')
      ? 'Officer access'
      : can('entries.score')
        ? 'Judge access'
        : capabilities.length > 0
          ? 'Staff access'
          : null

  return (
    <aside
      aria-label={t('staff.nav.label')}
      className={cn(
        'fixed top-0 left-0 h-full z-40 flex flex-col bg-banner transition-transform duration-200',
        'w-[var(--sidebar-width)]',
        visible ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="h-[52px] 2xl:h-16 flex items-center px-3.5 border-b border-on-banner/10 flex-shrink-0">
        <Logo theme="dark" subtitle={t('staff.console')} className="!p-0 scale-[0.85] 2xl:scale-100 origin-left" />
      </div>

      <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-1.5">
        {groups.map((group) => (
          <div key={group.key} className="mt-2 first:mt-0">
            <p className="px-2.5 pt-2 pb-1 text-[10px] 2xl:text-[11px] font-heading font-bold tracking-[0.08em] uppercase text-banner-muted/70 select-none">
              {t(group.label)}
            </p>
            <div className="flex flex-col gap-px">
              {group.items.map((item) => (
                <NavItem key={item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {roleLabel && (
        <div className="px-3.5 py-2.5 border-t border-on-banner/10 flex-shrink-0 flex items-center gap-1.5">
          <ShieldCheck size={12} aria-hidden className="text-banner-muted/70" />
          <p className="text-banner-muted/70 text-[11px]">{roleLabel}</p>
        </div>
      )}
    </aside>
  )
}
