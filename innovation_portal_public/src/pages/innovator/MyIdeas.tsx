import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Button, { buttonClasses } from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState, { ErrorState } from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { InputControl } from '../../components/ui/Input'
import Pagination from '../../components/ui/Pagination'
import { SelectControl } from '../../components/ui/Select'
import Tag from '../../components/ui/Tag'
import IdeaCard from '../../components/innovator/IdeaCard'
import { useI18n, type StringKey } from '../../i18n'
import { ideaMessagesService } from '../../services/ideaMessages.service'
import { innovatorService } from '../../services/innovator.service'
import type { IdeaItem, IdeasFilter, IdeasList, IdeasSort, RecentMessages } from '../../types/innovator'
import { SUBMIT_PATH } from '../../lib/paths'

const TABS: Array<{ key: IdeasFilter; label: StringKey }> = [
  { key: 'all', label: 'ideas.tabAll' },
  { key: 'needs_action', label: 'ideas.tabNeedsAction' },
  { key: 'drafts', label: 'ideas.tabDrafts' },
  { key: 'in_review', label: 'ideas.tabInReview' },
  { key: 'finished', label: 'ideas.tabFinished' },
]
const SORTS: IdeasSort[] = ['newest', 'oldest', 'name']
const PAGE_SIZE = 10
/** The API's largest page: a phone that reopens at "page 7" shows that page and can go on from there. */
const MAX_PHONE_RESTORE = 50

function isFilter(value: string | null): value is IdeasFilter {
  return TABS.some((tab) => tab.key === value)
}

function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia?.('(max-width: 639px)').matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 639px)')
    if (!media) return
    const change = () => setPhone(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return phone
}

/** Screen 2.2 (Figma 15:695, 15:929): search, challenge, sort, status chips and 10 a page; all of it in the URL. */
export default function MyIdeas() {
  const { t, lang } = useI18n()
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: IdeasFilter = isFilter(raw) ? raw : 'all'
  const q = params.get('q') ?? ''
  const program = params.get('challenge') ?? ''
  const rawSort = params.get('sort') as IdeasSort | null
  const sort: IdeasSort = rawSort && SORTS.includes(rawSort) ? rawSort : 'newest'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const [search, setSearch] = useState(q)
  const [data, setData] = useState<IdeasList | null>(null)
  const [rows, setRows] = useState<IdeaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef(0)
  // "Show 10 more" already has the rows: the URL follows it without loading the list again.
  const appended = useRef<number | null>(null)

  const update = useCallback((changes: Record<string, string>, keepPage = false) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!keepPage) next.delete('page')
      return next
    }, { replace: true })
  }, [setParams])

  useEffect(() => setSearch(q), [q])
  useEffect(() => {
    if (search.trim() === q) return
    const timer = window.setTimeout(() => update({ q: search.trim() }), 300)
    return () => window.clearTimeout(timer)
  }, [search, q, update])

  const load = useCallback(async () => {
    const ticket = ++latest.current
    setLoading(true)
    setFailed(false)
    const restore = phone && page > 1 && page * PAGE_SIZE <= MAX_PHONE_RESTORE
    try {
      const result = await innovatorService.ideas({
        filter: tab, q, program, sort, lang,
        page: restore ? 1 : page,
        page_size: restore ? page * PAGE_SIZE : PAGE_SIZE,
      })
      if (ticket !== latest.current) return
      setData(result)
      setRows(result.results)
    } catch {
      if (ticket === latest.current) setFailed(true)
    } finally {
      if (ticket === latest.current) setLoading(false)
    }
  }, [tab, q, program, sort, page, lang, phone])

  useEffect(() => {
    if (appended.current === page) {
      appended.current = null
      return
    }
    load()
  }, [load, page])

  // A page that no longer exists (ideas were filtered or removed): go to the last real one.
  useEffect(() => {
    if (!data || loading) return
    const lastPage = Math.max(1, Math.ceil(data.count / PAGE_SIZE))
    if (page > lastPage) update({ page: lastPage > 1 ? String(lastPage) : '' }, true)
  }, [data, loading, page, update])

  useEffect(() => {
    document.title = `${t('ideas.title')} · CEDA Innovation`
  }, [t])

  async function showMore() {
    const next = page + 1
    setMore(true)
    try {
      const result = await innovatorService.ideas({ filter: tab, q, program, sort, lang, page: next, page_size: PAGE_SIZE })
      setRows((current) => [...current, ...result.results])
      setData(result)
      appended.current = next
      update({ page: String(next) }, true)
    } catch {
      setFailed(true)
    } finally {
      setMore(false)
    }
  }

  const counts = data?.counts
  const total = data?.count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const everything = counts?.all ?? 0
  const waiting = counts?.needs_action ?? 0
  const filtered = Boolean(q || program)
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)
  const phoneFrom = total === 0 ? 0 : page * PAGE_SIZE <= MAX_PHONE_RESTORE ? 1 : first
  const challengeOptions = [
    { value: '', label: t('ideas.allChallenges') },
    ...(data?.programs ?? []).map((p) => ({ value: p.id, label: p.is_general_intake ? t('ideas.generalIdeas') : p.title })),
  ]

  return (
    <div className="bg-bg">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 pt-10 pb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-d-mh1 sm:text-d-h2 text-text">{t('ideas.title')}</h1>
          {counts && (
            <p className="mt-2 text-d-body text-muted">
              {everything === 1 ? t('ideas.countOne') : t('ideas.count', { count: everything })}
              {waiting > 0 && ` · ${waiting === 1 ? t('ideas.needReplyOne') : t('ideas.needReply', { count: waiting })}`}
            </p>
          )}
        </div>
        <Link data-guide="myIdeas.new" to={SUBMIT_PATH} className={buttonClasses({ variant: 'primary', size: 'md' })}>
          <Plus size={18} aria-hidden />
          {t('ideas.new')}
        </Link>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 pb-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_150px]">
            <div className="col-span-2 sm:col-span-1">
              <InputControl type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ideas.search')} aria-label={t('ideas.search')} leading={<Search size={16} aria-hidden />} />
            </div>
            <SelectControl aria-label={t('ideas.allChallenges')} options={challengeOptions} value={program} onChange={(value) => update({ challenge: value })} />
            <SelectControl aria-label={t('ideas.sort')} options={SORTS.map((value) => ({ value, label: t(`ideas.sort.${value}` as StringKey) }))} value={sort} onChange={(value) => update({ sort: value === 'newest' ? '' : value })} />
          </div>

          <div role="group" aria-label={t('ideas.statusFilter')} className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {TABS.map((item) => {
              const on = item.key === tab
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ tab: item.key === 'all' ? '' : item.key })}
                  className={clsx(
                    'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-d-label-s transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    on ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-text hover:border-muted/60',
                  )}
                >
                  {t(item.label)}{counts ? ` (${counts[item.key]})` : ''}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-col gap-4" aria-busy={loading || undefined}>
            {failed ? (
              <ErrorState title={t('ideas.loadError')} onRetry={load} />
            ) : !data && loading ? (
              Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[180px] w-full rounded-card" />)
            ) : rows.length === 0 ? (
              filtered ? (
                <EmptyState title={t('ideas.emptySearch')} body={t('ideas.emptySearchBody')}>
                  <Button variant="secondary" size="sm" onClick={() => { setSearch(''); update({ q: '', challenge: '' }) }}>{t('ideas.clearFilters')}</Button>
                </EmptyState>
              ) : tab === 'all' ? (
                <EmptyState title={t('ideas.emptyAll')}>
                  <Link to={SUBMIT_PATH} className={buttonClasses({ variant: 'primary', size: 'sm' })}>{t('ideas.new')}</Link>
                </EmptyState>
              ) : (
                <EmptyState title={t('ideas.emptyTab')} />
              )
            ) : (
              rows.map((item) => <IdeaCard key={`${item.kind}-${item.id}`} item={item} />)
            )}
          </div>

          {!failed && total > 0 && (
            phone ? (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-d-cap text-muted" aria-live="polite">{t('ideas.showing', { from: phoneFrom, to: last, total })}</p>
                {last < total && <Button variant="secondary" block loading={more} onClick={showMore}>{t('ideas.showMore')}</Button>}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-d-cap text-muted" aria-live="polite">{t('ideas.showing', { from: first, to: last, total })}</p>
                <Pagination page={page} totalPages={pages} onChange={(next) => { update({ page: next > 1 ? String(next) : '' }, true); window.scrollTo({ top: 0 }) }} />
              </div>
            )
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <RecentMessagesCard />
          <Card tone="soft" padding="md">
            <h2 className="font-heading text-d-h5 text-text">{t('ideas.helpTitle')}</h2>
            <p className="mt-2 text-d-body-s text-muted">{t('ideas.helpBody')}</p>
            <Link to="/faq" className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-4' })}>
              {t('ideas.helpButton')}
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  )
}

/**
 * Latest message per idea (B3). If the list cannot be loaded the card is not
 * shown, rather than claiming "no messages".
 */
function RecentMessagesCard() {
  const { t } = useI18n()
  const [data, setData] = useState<RecentMessages | null>(null)

  useEffect(() => {
    let alive = true
    ideaMessagesService
      .recent()
      .then((result) => alive && setData(result))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [])

  if (!data) return null
  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-d-h5 text-text">{t('ideas.messages')}</h2>
        {data.total_unread > 0 && <Tag tone="red">{t('ideas.messagesNew', { count: data.total_unread })}</Tag>}
      </div>
      {data.results.length === 0 ? (
        <p className="mt-3 text-d-body-s text-muted">{t('ideas.messagesEmpty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {data.results.map((thread) => {
            const latest = thread.latest
            const mine = latest.author_role === 'applicant'
            const author = mine ? t('track.you') : latest.author.label || latest.author.name || t('track.officer')
            return (
              <li key={thread.idea_id}>
                <Link to={`/my-ideas/${thread.idea_id}#messages`} className="flex gap-3 rounded-control p-1 hover:bg-surface2">
                  <Avatar name={mine ? t('track.you') : latest.author.name || author} size="sm" decorative />
                  <span className="min-w-0">
                    <span className="block truncate text-d-label-s text-text">{author}</span>
                    <span className="block truncate text-d-cap text-muted">{latest.body || thread.title}</span>
                  </span>
                  {thread.unread > 0 && (
                    <span className="ml-auto mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary">
                      <span className="sr-only">{t('notif.unread')}</span>
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
