import { useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BarChart3, ClipboardList, BriefcaseBusiness, Layers, BookOpen,
  ClipboardCheck, Handshake, LayoutGrid, Sparkles, Award, Star, Info, LayoutTemplate, Newspaper, Trophy, Quote, HelpCircle, Users, SlidersHorizontal, ScrollText, GitBranch, FileText, ShieldCheck, Eye, MessageCircle, MessagesSquare,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useLayout } from './LayoutContext'
import { useAuth } from '../lib/auth/AuthContext'
import { useT } from '../i18n/context'
import { CedaMark, CedaWord } from '../components/ui/Logo'
import { useMenuMotion } from './useMenuMotion'
import { boot } from '../lib/boot'
import { useQuery } from '@tanstack/react-query'
import { useActiveHackathon } from '../lib/queries/hackathon'
import { inboxApi } from '../lib/api/inbox'
import { usePublicConfig } from '../lib/queries/platform'

// Staff sidebar: chocolate banner, grouped as Overview, Challenges, Website content, Admin.
// Compact by default (216px wide, 32px rows, 13px text), roomier from 2xl (248px, 38px, 14px).
// U12: the lit menu. Open, it is lit (--sidebar-lit-bg); closed on a desktop it is a 72px icon rail, dim
// (--sidebar-dim-bg), with the mark alone, icons with tooltips, and a short faint line for each group title.
// The motion lives in useMenuMotion; this file draws the parts and keeps the capability filtering.
// Each item names the capability (S1) the API checks behind it; an item is hidden when the person does not
// hold it, and a group with nothing left is hidden. No role names here (ceda-security).

const GROUPS = [
  {
    key: 'overview',
    label: 'staff.group.overview',
    items: [
      { label: 'staff.nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'staff.nav.reports', href: '/reports', icon: BarChart3, anyOf: ['dashboard.view', 'analytics.view'] },
      { label: 'staff.nav.myWork', href: '/assignments', icon: BriefcaseBusiness, capability: 'entries.review', match: ['/assignments', '/history', '/tasks'] },
    ],
  },
  {
    // Figma 3.15 sidebar. The review queue (3.3, screens lane) joins this group when it lands (R-43).
    key: 'ideas',
    label: 'staff.group.ideas',
    items: [
      { label: 'staff.nav.submissions', href: '/submissions', icon: ClipboardList, capability: 'entries.search' },
      { label: 'staff.nav.reviewQueue', href: '/review', icon: Eye, capability: 'entries.review' },
      { label: 'staff.nav.inbox', href: '/inbox', icon: MessageCircle, capability: 'conversations.reply', feature: 'live_chat', badge: 'inbox' },
      { label: 'staff.nav.judging', href: '/judging', icon: Star, capability: 'entries.score' },
    ],
  },
  {
    key: 'challenges',
    label: 'staff.group.challenges',
    items: [
      { label: 'staff.nav.challenges', href: '/programs', icon: Layers, capability: 'challenges.manage' },
      // Figma 3.21a: Workflows sits with the challenges it serves.
      { label: 'staff.nav.workflows', href: '/admin/workflows', icon: GitBranch, capability: 'entries.assign' },
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
      { label: 'staff.nav.allContent', href: '/content', icon: LayoutGrid, capability: 'content.edit', exact: true },
      { label: 'staff.nav.homePage', href: '/content/home', icon: LayoutTemplate, capability: 'content.edit' },
      { label: 'staff.nav.news', href: '/content/news', icon: Newspaper, capability: 'content.edit' },
      { label: 'staff.nav.stories', href: '/content/stories', icon: Trophy, capability: 'content.edit' },
      { label: 'staff.nav.quotes', href: '/content/quotes', icon: Quote, capability: 'content.edit', match: ['/content/quotes', '/content/leadership'] },
      { label: 'staff.nav.partners', href: '/content/partners', icon: Handshake, capability: 'content.edit' },
      { label: 'staff.nav.faqs', href: '/content/faqs', icon: HelpCircle, capability: 'content.edit' },
      // 3.35: site policy pages (content.edit) and the challenges' own terms (challenges.manage) in one place.
      { label: 'staff.nav.policies', href: '/content/policies', icon: FileText, anyOf: ['content.edit', 'challenges.manage'] },
      // 3.36: only while a hackathon is on.
      { label: 'staff.nav.hackathon', href: '/content/hackathon', icon: Sparkles, capability: 'content.edit', when: 'hackathon', match: ['/content/hackathon'] },
      { label: 'staff.nav.winners', href: '/content/winners', icon: Award, anyOf: ['content.edit', 'challenges.manage'] },
      { label: 'staff.nav.approvals', href: '/content/approvals', icon: ClipboardCheck, anyOf: ['content.edit', 'content.approve'] },
    ],
  },
  {
    key: 'admin',
    label: 'staff.group.admin',
    items: [
      { label: 'staff.nav.users', href: '/users', icon: Users, capability: 'users.manage' },
      { label: 'staff.nav.roles', href: '/admin/roles', icon: ShieldCheck, capability: 'settings.manage' },
      { label: 'staff.nav.settings', href: '/admin/platform', icon: SlidersHorizontal, capability: 'settings.manage' },
      { label: 'staff.nav.liveChat', href: '/admin/live-chat', icon: MessagesSquare, capability: 'settings.manage' },
      { label: 'staff.nav.audit', href: '/audit', icon: ScrollText, capability: 'audit.view' },
    ],
  },
]

// Someone who only judges (3.17): one group, Judging, My work and the judging guide on the public site.
const JUDGE_GROUP = {
  key: 'judging',
  label: 'staff.group.judging',
  items: [
    { label: 'staff.nav.judging', href: '/judging', icon: Star },
    { label: 'staff.nav.myWork', href: '/assignments', icon: BriefcaseBusiness, match: ['/assignments', '/tasks'] },
    { label: 'staff.nav.judgingGuide', href: '/guidelines#criteria', icon: Info, external: true },
  ],
}

function useIsActive(item) {
  const { pathname, search } = useLocation()
  if (item.tab) {
    if (pathname !== '/content' && !pathname.startsWith('/content/')) return false
    const tab = new URLSearchParams(search).get('tab')
    if (pathname.startsWith('/content/')) return pathname.startsWith(`/content/${item.tab}`) || (item.tab === 'news' && pathname.startsWith('/content/hackathons'))
    return tab === item.tab || (!tab && item.defaultTab)
  }
  if (item.external) return false
  if (item.exact) return pathname === item.href
  const prefixes = item.match ?? [item.href]
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** C1: unread chats on the Inbox item. Quiet when live chat is off (the API answers 404). */
function InboxBadge() {
  const t = useT()
  const q = useQuery({ queryKey: ['inbox', 'unread'], queryFn: inboxApi.unread, refetchInterval: 30_000, retry: false })
  const n = q.data?.unread ?? 0
  if (!n) return null
  return <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-bold leading-[18px] text-white" aria-label={t('inbox.unreadN', { n })}>{n > 99 ? '99+' : n}</span>
}

// Each row is one line of the light front: useMenuMotion sets its colour and how lit it is (--lit).
const ROW = 'relative flex items-center h-8 2xl:h-[38px] rounded-control text-[13px] 2xl:text-[14px] font-body transition-[background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-banner'

function RowInside({ Icon, label, badge }) {
  return (
    <>
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className="absolute left-[18px] flex-shrink-0" />}
      <span data-label className="absolute left-[44px] right-2 flex items-center gap-2 min-w-0 whitespace-nowrap">
        <span className="truncate">{label}</span>
        {badge}
      </span>
    </>
  )
}

function NavItem({ item }) {
  const t = useT()
  const active = useIsActive(item)
  const Icon = item.icon
  const label = t(item.label)
  if (item.external) {
    // Outside the console (the public site), so a plain link.
    return (
      <a href={item.href} data-menu-row="item" data-active="false" title={label} aria-label={label} className={cn(ROW, 'hover:bg-on-banner/10')}>
        <RowInside Icon={Icon} label={label} />
      </a>
    )
  }
  return (
    <NavLink
      to={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      data-menu-row="item"
      data-active={active ? 'true' : 'false'}
      className={cn(ROW, active ? 'font-bold sidebar-active' : 'hover:bg-on-banner/10')}
    >
      <RowInside Icon={Icon} label={label} badge={item.badge === 'inbox' && <span data-badge className="ml-auto"><InboxBadge /></span>} />
    </NavLink>
  )
}

/** previewUser: only for the styleguide's shell preview. */
export default function Sidebar({ previewUser } = {}) {
  const t = useT()
  const layout = useLayout()
  const { sidebarOpen, mobileSidebarOpen, setMobileSidebarOpen, phone = false, shellRef } = layout
  const open = phone ? mobileSidebarOpen : sidebarOpen
  const els = useRef({}).current
  const ref = (name) => (el) => { els[name] = el }
  const auth = useAuth()
  // previewUser (styleguide) carries its own capabilities list.
  const capabilities = previewUser ? previewUser.capabilities ?? [] : auth?.capabilities ?? []
  const can = (c) => capabilities.includes(c)
  // Items with `feature` show only while that public switch is on (C1: live chat).
  const publicConfig = usePublicConfig()

  // 3.36: the hackathon page item shows only while a hackathon is on (not in the styleguide preview).
  const activeHackathon = useActiveHackathon(!previewUser && can('content.edit'))
  const flags = { hackathon: !!activeHackathon.data }

  useMenuMotion({ els, shellRef, open, phone, boot, still: !!layout.still })

  // Same rule as lib/auth/useJudgeOnly (kept inline for the styleguide's previewUser).
  const judgeOnly = can('entries.score') && !can('entries.assign') && !can('entries.search')
  const groups = judgeOnly
    ? [JUDGE_GROUP]
    : GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => (!item.feature || publicConfig.data?.features?.[item.feature]) && (item.anyOf ? item.anyOf.some(can) : !item.capability || can(item.capability)) && (!item.when || flags[item.when])),
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
    <>
      {phone && (
        <div ref={ref('scrim')} aria-hidden className="fixed inset-0 z-30 bg-black opacity-0 invisible" onClick={() => setMobileSidebarOpen(false)} />
      )}
      <aside
        ref={ref('aside')}
        aria-label={t('staff.nav.label')}
        className={cn('fixed top-0 left-0 h-full z-40 flex flex-col overflow-hidden', previewUser && '!relative')}
        style={{ width: 'var(--sidebar-width)', background: 'var(--sidebar-dim-bg)' }}
      >
        <div ref={ref('lit')} aria-hidden className="sidebar-lit" />
        <div ref={ref('glow')} aria-hidden className="sidebar-glow" />

        <div className="relative h-[88px] flex-shrink-0">
          <div ref={ref('markCol')} className="absolute top-[22px] left-0 w-24">
            <div ref={ref('halo')} aria-hidden className="sidebar-sun-halo" />
            <div className="relative ml-[22px] w-[52px] h-7 overflow-hidden">
              <span ref={ref('dimSun')} className="absolute inset-0 sidebar-dim-mark"><CedaMark height={27} /></span>
              <span ref={ref('sun')} className="absolute inset-0"><CedaMark height={27} label="CEDA" /></span>
            </div>
            <div ref={ref('word')} className="mt-[5px] text-on-banner"><CedaWord width={96} /></div>
          </div>
          <div ref={ref('side')} aria-hidden className="absolute left-[124px] top-[24px] flex items-center gap-3 whitespace-nowrap">
            <span className="block w-px h-[34px] -ml-[13px] bg-banner-muted/35" />
            <span>
              <span className="block font-heading font-semibold text-[15px] leading-[22px] text-on-banner">Innovation</span>
              <span className="block font-body text-[12px] leading-[18px] text-banner-muted">{t('staff.console')}</span>
            </span>
          </div>
        </div>

        <nav ref={ref('nav')} className="relative flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll px-2 py-1.5">
          {groups.map((group) => (
            <div key={group.key} className="mt-2 first:mt-0">
              <p data-menu-row="title" className="sidebar-title relative pl-[18px] pt-2 pb-1 text-[10px] 2xl:text-[11px] font-heading font-bold tracking-[0.08em] uppercase whitespace-nowrap select-none">
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
          <div ref={ref('foot')} className="relative px-3.5 py-2.5 border-t border-on-banner/10 flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap">
            <ShieldCheck size={12} aria-hidden className="text-banner-muted/70" />
            <p className="text-banner-muted/70 text-[11px]">{roleLabel}</p>
          </div>
        )}
      </aside>
    </>
  )
}
