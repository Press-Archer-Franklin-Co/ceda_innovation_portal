import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, CalendarDays, Clock, Eye, Megaphone, MoreHorizontal, Search } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import DataTable from '../../components/ui/DataTable'
import DropdownMenu from '../../components/ui/DropdownMenu'
import Tabs from '../../components/ui/Tabs'
import Tag from '../../components/ui/Tag'
import StatusPill from '../../components/ui/StatusPill'
import Modal from '../../components/ui/Modal'
import Input, { InputControl } from '../../components/ui/Input'
import Skeleton from '../../components/ui/Skeleton'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { useTrigger } from '../../components/ui/useTrigger'
import { cn } from '../../lib/cn'
import { POST_TYPES, SHOWS_ON, TYPE_TONE, countByType, filterByState, listStats, postDate } from '../../lib/content/posts'
import { useApprovals, useDecideApproval, usePostAction, usePosts, useSubscriberCounts } from '../../lib/queries/websiteContent'

const fmt = (value, lang, time = false) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', time ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' })
}
const pick = (value, lang) => (value && typeof value === 'object' ? (value[lang] || value.en || '') : value ?? '')

function Tile({ title, value, note, icon: Icon, tone, loading }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-text">{title}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-control', tone)}><Icon size={16} aria-hidden /></span>
      </div>
      {loading ? <Skeleton className="h-8 w-16" /> : <p className="font-heading text-[28px] font-extrabold leading-none text-text">{value}</p>}
      <p className="min-h-4 text-[12px] text-muted">{loading ? '' : note}</p>
    </div>
  )
}

function PinDialog({ post, onClose, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const act = usePostAction()
  const [until, setUntil] = useState('')
  const past = until && new Date(until) <= new Date()
  const save = async () => {
    try {
      await act.mutateAsync({ action: 'pin', id: post.id, value: new Date(until).toISOString() })
      toast.show({ tone: 'success', title: t('news.pinned1', { date: until.replace('T', ' ') }) })
      onClose()
    } catch (err) {
      toast.show({ tone: 'error', title: t('news.failed', { message: err?.message ?? '' }) })
    }
  }
  return (
    <Modal open={!!post} onClose={onClose} triggerRef={triggerRef} title={post ? t('news.pinTitle', { title: post.titleText }) : ''} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} loading={act.isPending} disabled={!until || past}>{t('news.pin')}</Button></>}>
      <Input type="datetime-local" label={t('news.pinUntil')} hint={t('news.pinHint')} value={until} onChange={(e) => setUntil(e.target.value)} error={past ? t('post.pinFuture') : undefined} />
    </Modal>
  )
}

/** Posts waiting for this person's approval (the API decides who can). */
function ForYourApproval({ approvals, posts }) {
  const t = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const decide = useDecideApproval()
  // S2 (R-31) adds can_approve; until then can_decide says the same.
  const mine = approvals.filter((a) => a.target_type === 'post' && (a.can_approve ?? a.can_decide))
  if (!mine.length) return null
  return (
    <div className="mb-4 flex flex-col gap-2">
      {mine.map((a) => {
        const post = posts.find((p) => p.id === a.target_id)
        return (
          <div key={a.id} className="flex flex-col gap-2 rounded-card bg-warning-soft p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-warning">{t('news.yourApproval')}</p>
              <p className="truncate text-[14px] font-bold text-text">{post?.titleText ?? a.summary}</p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => navigate(`/content/news/${a.target_id}`)}>{t('news.preview')}</Button>
              <Button loading={decide.isPending} onClick={async () => {
                try {
                  await decide.mutateAsync({ id: a.id, approve: true })
                  toast.show({ tone: 'success', title: t('news.approved') })
                } catch (err) {
                  toast.show({ tone: 'error', title: t('news.failed', { message: err?.message ?? '' }) })
                }
              }}>{t('news.approve')}</Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 3.9 News & bulletin list (Figma 29:740 website, 34:679 phone). */
export default function NewsList() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const type = POST_TYPES.includes(params.get('type')) ? params.get('type') : 'all'
  const state = ['live', 'scheduled', 'approval'].includes(params.get('state')) ? params.get('state') : 'all'
  const [q, setQ] = useState(params.get('q') ?? '')
  const timer = useRef(null)
  const [pinning, setPinning] = useState(null)
  // Opened from a row's menu: the menu hands over its "..." button (DropdownMenu), so the ref stays empty.
  const pinTrigger = useTrigger()

  const list = usePosts(params.get('q') ? { q: params.get('q') } : undefined)
  const approvals = useApprovals('pending')
  const audience = useSubscriberCounts()
  const act = usePostAction()

  const all = useMemo(() => (list.data?.results ?? []).map((p) => ({ ...p, titleText: pick(p.title, lang) })), [list.data, lang])
  const counts = list.data?.counts
  const stats = useMemo(() => listStats(all), [all])
  const byType = useMemo(() => countByType(all), [all])
  const rows = useMemo(() => filterByState(type === 'all' ? all : all.filter((p) => p.type === type), state), [all, type, state])

  const setParam = (key, value, fallback) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (!value || value === fallback) next.delete(key)
    else next.set(key, value)
    return next
  }, { replace: true })
  const onSearch = (value) => {
    setQ(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setParam('q', value.trim(), ''), 350)
  }

  const run = async (action, post, done) => {
    try {
      const result = await act.mutateAsync({ action, id: post.id })
      if (done) toast.show({ tone: 'success', title: done })
      return result
    } catch (err) {
      toast.show({ tone: 'error', title: t('news.failed', { message: err?.message ?? '' }) })
      return null
    }
  }

  const actionsFor = (post) => {
    const live = post.status === 'published'
    const items = [
      { key: 'edit', label: t('news.edit'), onSelect: () => navigate(`/content/news/${post.id}`) },
      { key: 'pin', label: post.is_pinned ? t('news.unpin') : t('news.pin'), hidden: !live, onSelect: () => {
        if (post.is_pinned) act.mutateAsync({ action: 'pin', id: post.id, value: null }).then(() => toast.show({ tone: 'success', title: t('news.unpinned') }), (err) => toast.show({ tone: 'error', title: t('news.failed', { message: err?.message ?? '' }) }))
        else setPinning(post)
      } },
      { key: 'duplicate', label: t('news.duplicate'), onSelect: async () => {
        const copy = await run('duplicate', post, t('news.duplicated'))
        if (copy?.id) navigate(`/content/news/${copy.id}`)
      } },
      { key: 'send', label: t('news.send'), hidden: !live, onSelect: async () => {
        const ok = await confirm({ title: t('news.sendTitle', { title: post.titleText }), body: t('news.sendBody', { email: audience.data?.email ?? 0, whatsapp: audience.data?.whatsapp ?? 0 }), confirmLabel: t('news.send'), tone: 'primary' })
        if (ok) run('blast', post, t('news.sent'))
      } },
      { key: 'unpublish', label: t('news.unpublish'), danger: true, hidden: !(live || post.status === 'scheduled'), onSelect: async () => {
        const ok = await confirm({ title: t('news.unpublishTitle', { title: post.titleText }), body: t('news.unpublishBody'), confirmLabel: t('news.unpublish'), tone: 'danger' })
        if (ok) run('unpublish', post, t('news.unpublished'))
      } },
      { key: 'delete', label: t('news.delete'), danger: true, hidden: post.status !== 'draft', onSelect: async () => {
        const ok = await confirm({ title: t('news.deleteTitle', { title: post.titleText }), body: t('news.deleteBody'), confirmLabel: t('news.delete'), tone: 'danger' })
        if (ok) run('remove', post, t('news.deleted'))
      } },
    ]
    return items
  }

  const columns = [
    { key: 'title', label: t('news.colPost'), render: (_, p) => <span className="font-semibold text-text">{p.titleText}</span>, link: (p) => `/content/news/${p.id}` },
    { key: 'type', label: t('news.colType'), width: 130, render: (v) => <Tag tone={TYPE_TONE[v] ?? 'neutral'}>{t(`post.type.${v}`)}</Tag> },
    { key: 'status', label: t('news.colStatus'), width: 180, render: (v) => <StatusPill status={v} /> },
    { key: 'shows_on', label: t('news.colShows'), hideOnPhone: true, render: (v) => {
      const places = (v ?? []).filter((x) => SHOWS_ON.includes(x)).map((x) => t(`post.shows.${x}`))
      return places.length ? places.join(', ') : <span className="text-muted">{t('news.newsPageOnly')}</span>
    } },
    { key: 'date', label: t('news.colDate'), width: 130, render: (_, p) => fmt(postDate(p), lang, p.status === 'scheduled') || '–' },
    { key: 'view_count', label: t('news.colViews'), width: 90, align: 'right', hideOnPhone: true, render: (v, p) => (p.status === 'published' ? Number(v ?? 0).toLocaleString('en-GB') : '–') },
    { key: 'actions', label: '', width: 52, render: (_, p) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
        <DropdownMenu label={t('news.actions', { title: p.titleText })} items={actionsFor(p)}
          trigger={(props) => <button type="button" {...props} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-text"><MoreHorizontal size={16} aria-hidden /><span className="sr-only">{t('news.actions', { title: p.titleText })}</span></button>} />
      </div>
    ) },
  ]

  const typeTabs = [{ key: 'all', label: t('news.all'), count: all.length }, ...POST_TYPES.map((x) => ({ key: x, label: t(`post.typePlural.${x}`), count: byType[x] }))]
  const filtered = type !== 'all' || state !== 'all' || !!params.get('q')

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted"><Link to="/content/home" className="hover:underline">{t('news.crumb')}</Link> / {t('news.title')}</p>
      <PageHeader
        title={t('news.title')}
        subtitle={t('news.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/content/news/new?type=notice&quick=1" className={buttonClasses({ variant: 'secondary' })}><Megaphone size={15} aria-hidden /> {t('news.quick')}</Link>
            <Link to="/content/news/new" className={buttonClasses({ variant: 'primary' })}>{t('news.new')}</Link>
          </div>
        }
      />

      <div className="mb-5 hidden grid-cols-2 gap-3 md:grid xl:grid-cols-4">
        <Tile title={t('news.live')} value={counts?.live ?? 0} note={t('news.pinned', { count: stats.pinned })} icon={Eye} tone="bg-success-soft text-success" loading={list.isLoading} />
        <Tile title={t('news.scheduled')} value={counts?.scheduled ?? 0} note={stats.nextScheduled ? t('news.next', { date: fmt(stats.nextScheduled, lang, true) }) : t('news.noneScheduled')} icon={CalendarDays} tone="bg-info-soft text-info" loading={list.isLoading} />
        <Tile title={t('news.waiting')} value={counts?.waiting_approval ?? 0} note={stats.oldestWaitingDays == null ? '' : stats.oldestWaitingDays === 0 ? t('news.oldestToday') : t('news.oldest', { count: stats.oldestWaitingDays })} icon={Clock} tone="bg-warning-soft text-warning" loading={list.isLoading} />
        {/* TODO(R-29): "Views this month" once the API counts them; until then the honest all-time total. */}
        <Tile title={t('news.views')} value={stats.totalViews.toLocaleString('en-GB')} note={t('news.viewsNote')} icon={BarChart3} tone="bg-primary-soft text-primary" loading={list.isLoading} />
      </div>

      {/* Phone: state chips (Figma 34:679). */}
      <div className="mb-3 flex gap-2 overflow-x-auto md:hidden" role="radiogroup" aria-label={t('news.colStatus')}>
        {[['all', t('news.all')], ['live', t('news.filterLive')], ['scheduled', t('news.filterScheduled')], ['approval', `${t('news.filterApproval')} ${counts?.waiting_approval ?? ''}`.trim()]].map(([key, label]) => (
          <button key={key} type="button" role="radio" aria-checked={state === key} onClick={() => setParam('state', key, 'all')}
            className={cn('h-8 shrink-0 rounded-full border px-3 text-[13px] font-semibold', state === key ? 'border-banner bg-banner text-on-banner' : 'border-border bg-surface text-text')}>
            {label}
          </button>
        ))}
      </div>

      <ForYourApproval approvals={approvals.data ?? []} posts={all} />

      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs tabs={typeTabs} active={type} onChange={(key) => setParam('type', key, 'all')} variant="segment" label={t('news.colType')} className="hidden md:flex" />
        <div className="md:w-72">
          <InputControl type="search" value={q} onChange={(e) => onSearch(e.target.value)} placeholder={t('news.search')} aria-label={t('news.search')} leading={<Search size={15} aria-hidden />} />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={list.isLoading}
        error={list.isError ? t('news.loadError') : undefined}
        onRetry={() => list.refetch()}
        retrying={list.isFetching}
        onRowClick={(p) => navigate(`/content/news/${p.id}`)}
        emptyTitle={filtered ? t('news.emptyFilter') : t('news.empty')}
        emptyMessage={filtered ? t('news.emptyFilterBody') : t('news.emptyBody')}
        emptyAction={filtered ? undefined : <Link to="/content/news/new" className={buttonClasses({ variant: 'primary' })}>{t('news.new')}</Link>}
        caption={t('news.title')}
      />

      <PinDialog post={pinning} onClose={() => setPinning(null)} triggerRef={pinTrigger.ref} />
    </div>
  )
}
