import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, Inbox as InboxIcon } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import Tag from '../../components/ui/Tag'
import Avatar from '../../components/ui/Avatar'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { inboxApi } from '../../lib/api/inbox'
import ChatPanel from './ChatPanel'

// 3.30 Inbox: live chat and hand-overs (Figma 134:1156 website, 134:1445 phone). ① Mine / Unassigned / All and
// the channel; each row shows the channel and why it is here (AI hand-over, call-back). ② The chat. ③ Saved
// replies. ④ The side panel: who this is, their ideas, who has it, the note for the team. The list refreshes every
// 10 seconds and the open chat every 3, both paused while the tab is hidden. Phone: the list, then one chat.

const TABS = ['mine', 'unassigned', 'all']
const CHANNELS = ['', 'web', 'whatsapp', 'ussd', 'ai', 'idea']

const channelTone = { web: 'neutral', whatsapp: 'green', ussd: 'blue', ai: 'cms', idea: 'orange' }

function ago(iso, now, t) {
  if (!iso) return ''
  const mins = Math.max(0, Math.round(((now ? new Date(now) : new Date()) - new Date(iso)) / 60000))
  if (mins < 1) return t('inbox.justNow')
  if (mins < 60) return t('inbox.minutes', { n: mins })
  const hours = Math.round(mins / 60)
  if (hours < 24) return t('inbox.hours', { n: hours })
  return hours < 48 ? t('inbox.yesterday') : new Date(iso).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' })
}

export default function Inbox() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'mine'
  const channel = CHANNELS.includes(params.get('channel')) ? params.get('channel') : ''
  const open = params.get('open') ?? ''
  const [openType, openId] = open.split(':')
  const update = (patch) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k))
      return n
    }, { replace: true })

  useEffect(() => { document.title = `${t('staff.nav.inbox')} · CEDA Innovation` }, [t])

  const list = useQuery({
    queryKey: ['inbox', 'list', tab, channel],
    queryFn: () => inboxApi.list({ tab, ...(channel && { channel }), page_size: 50 }),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })
  const unread = useQuery({ queryKey: ['inbox', 'unread'], queryFn: inboxApi.unread, refetchInterval: 10_000 })
  const rows = list.data?.results ?? []

  // Website: open the first chat when none is chosen.
  useEffect(() => {
    if (!open && rows.length && window.matchMedia?.('(min-width: 1024px)').matches) update({ open: `${rows[0].type}:${rows[0].id}` })
  }, [rows, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchedOff = list.error?.status === 404
  if (switchedOff) {
    return (
      <div className="flex flex-col gap-[14px]">
        <PageHeader title={t('staff.nav.inbox')} />
        <EmptyState icon={InboxIcon} title={t('inbox.offTitle')} message={t('inbox.offBody')} />
      </div>
    )
  }

  const selected = rows.find((r) => r.type === openType && r.id === openId)
  const tabs = TABS.map((key) => ({ key, label: t(`inbox.tab.${key}`), count: key === 'unassigned' ? unread.data?.unassigned || undefined : undefined }))

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[18px]">
      <div className={cn(open && 'hidden lg:block')}>
        <PageHeader
          back={<span className="text-[12px] text-muted">{t('staff.group.ideas')} / {t('staff.nav.inbox')}</span>}
          title={t('staff.nav.inbox')}
          subtitle={t('inbox.subtitle')}
        />
      </div>

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-label={t('inbox.listLabel')} className={cn('flex min-w-0 flex-col gap-3', open && 'hidden lg:flex')}>
          <Tabs tabs={tabs} active={tab} onChange={(k) => update({ tab: k === 'mine' ? '' : k, open: '' })} variant="segment" label={t('inbox.tabsLabel')} idPrefix="inbox" />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('inbox.channelLabel')}>
            {CHANNELS.map((c) => (
              <button
                key={c || 'all'}
                type="button"
                aria-pressed={channel === c}
                onClick={() => update({ channel: c, open: '' })}
                className={cn(
                  'h-7 rounded-full px-2.5 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  channel === c ? 'bg-banner text-on-banner' : 'bg-surface2 text-text hover:bg-border/60',
                )}
              >
                {c ? t(`inbox.channel.${c}`) : t('inbox.allChannels')}
              </button>
            ))}
          </div>

          {list.isLoading ? (
            <div className="flex flex-col gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] w-full" />)}</div>
          ) : list.isError ? (
            <ErrorState compact title={t('inbox.loadError')} message={list.error?.message} onRetry={list.refetch} retrying={list.isFetching} />
          ) : rows.length === 0 ? (
            <EmptyState compact icon={InboxIcon} title={t('inbox.emptyTitle')} message={t(`inbox.empty.${tab}`)} />
          ) : (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {rows.map((r) => {
                const active = r.type === openType && r.id === openId
                return (
                  <li key={`${r.type}:${r.id}`}>
                    <Link
                      to={`/inbox?${new URLSearchParams({ ...(tab !== 'mine' && { tab }), ...(channel && { channel }), open: `${r.type}:${r.id}` }).toString()}`}
                      aria-current={active ? 'true' : undefined}
                      className={cn('flex gap-3 px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary', active ? 'bg-primary-soft' : 'hover:bg-surface2/70')}
                    >
                      <Avatar name={r.who?.name || r.who?.phone || '?'} size="md" decorative />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn('truncate text-[14px] text-text', r.unread ? 'font-bold' : 'font-semibold')}>{r.who?.name || r.who?.phone || t('inbox.someone')}</span>
                          <span className="shrink-0 text-[12px] text-muted">{ago(r.last_at, list.data?.now, t)}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[12px] text-muted">{r.preview || r.subject}</span>
                          {r.unread > 0 && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t('inbox.unreadN', { n: r.unread })} />}
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          <Tag tone={channelTone[r.channel] ?? 'neutral'}>{t(`inbox.channel.${r.channel}`)}</Tag>
                          {r.handed_over_by === 'ai' && <Tag tone="amber">{t('inbox.aiHandover')}</Tag>}
                          {r.channel === 'ussd' && <Tag tone="amber">{t('inbox.callback')}</Tag>}
                          {r.status === 'closed' && <Tag tone="neutral">{t('inbox.closed')}</Tag>}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {open ? (
          <div className="min-w-0">
            <button type="button" onClick={() => update({ open: '' })} className="mb-2 inline-flex items-center gap-1 text-[15px] font-bold text-text lg:hidden">
              <ChevronLeft size={18} aria-hidden />{t('staff.nav.inbox')}
            </button>
            <ChatPanel key={open} type={openType} id={openId} row={selected} onChanged={() => { list.refetch(); unread.refetch() }} />
          </div>
        ) : (
          <div className="hidden min-h-[420px] items-center justify-center rounded-card border border-dashed border-border p-8 text-center text-[14px] text-muted lg:flex">
            {rows.length ? t('inbox.pickOne') : t('inbox.nothingOpen')}
          </div>
        )}
      </div>
    </div>
  )
}
