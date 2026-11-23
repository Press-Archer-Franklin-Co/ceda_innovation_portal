import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, Calendar, CheckCircle2, Megaphone, MessageCircle, SlidersHorizontal, Trophy } from 'lucide-react'
import { ErrorState } from '../ui/EmptyState'
import FilterPills from '../ui/FilterPills'
import Skeleton from '../ui/Skeleton'
import Tag from '../ui/Tag'
import { useI18n } from '../../i18n'
import { notificationsService } from '../../services/notifications.service'
import type { NotificationCategory, NotificationItem } from '../../types/innovator'
import { formatShortDate, relativeTime } from './format'

type Filter = 'all' | NotificationCategory

const ICON: Record<string, typeof Bell> = {
  officer_message: MessageCircle,
  stage_change: CheckCircle2,
  status_change: CheckCircle2,
  deadline: Trophy,
  new_challenge: Trophy,
  news: Megaphone,
  digest: Megaphone,
  event: Calendar,
}

function itemLink(item: NotificationItem): string | null {
  if (!item.link) return null
  if (item.link.type === 'idea' && item.link.id) return `/my-ideas/${item.link.id}`
  if (item.link.type === 'post') return item.link.id ? `/news/${item.link.id}` : '/news'
  // TODO(U2): the challenge page by slug once 1.8 has a route; the list until then.
  if (item.link.type === 'challenge') return '/challenges'
  return null
}

/**
 * 2.5: the list behind the bell. Used inside the header Popover (compact)
 * and on the /notifications page. Unread items have a red dot; deadlines
 * show their date.
 */
export default function NotificationsPanel({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { t, lang } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setItems(await notificationsService.list(filter === 'all' ? undefined : filter))
    } catch {
      setFailed(true)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  async function markAll() {
    setItems((prev) => prev?.map((item) => ({ ...item, is_read: true })) ?? prev)
    try {
      await notificationsService.markRead()
    } catch {
      load()
    }
  }

  function open(item: NotificationItem) {
    if (!item.is_read) {
      setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, is_read: true } : i)) ?? prev)
      notificationsService.markOneRead(item.id).catch(() => undefined)
    }
    onNavigate?.()
  }

  const shown = compact ? items?.slice(0, 6) : items
  const anyUnread = items?.some((item) => !item.is_read)
  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('notif.filterAll') },
    { value: 'ideas', label: t('notif.filterIdeas') },
    { value: 'challenges', label: t('notif.filterChallenges') },
    { value: 'news', label: t('notif.filterNews') },
  ]

  return (
    <div className="flex flex-col">
      <div className={clsx('flex items-center justify-between gap-3', compact ? 'px-5 pt-4' : '')}>
        <h2 className="font-heading text-d-h4 text-text">{t('notif.title')}</h2>
        {anyUnread && (
          <button type="button" onClick={markAll} className="text-d-label-s text-primary hover:underline">
            {t('notif.markAll')}
          </button>
        )}
      </div>
      <FilterPills options={filters} value={filter} onChange={setFilter} className={compact ? 'px-5 pt-3' : 'pt-4'} />
      <div className={clsx('mt-3', compact && 'max-h-[360px] overflow-y-auto overscroll-contain')}>
        {failed ? (
          <ErrorState title={t('notif.loadError')} onRetry={load} framed={!compact} />
        ) : !shown ? (
          <div className={clsx('flex flex-col gap-2', compact && 'px-5')}>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-control" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className={clsx('py-6 text-d-body-s text-muted', compact && 'px-5')}>{t('notif.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((item) => {
              const Icon = ICON[item.notification_type] ?? Bell
              const href = itemLink(item)
              const body = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-muted">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-d-body-s text-text', !item.is_read && 'font-bold')}>{item.title}</span>
                    {!compact && item.body && <span className="block text-d-cap text-muted">{item.body}</span>}
                    <span className="block text-d-cap text-muted">{relativeTime(item.created_at, t, lang)}</span>
                    {item.due_at && <Tag tone="amber" className="mt-1.5">{t('notif.replyBy', { date: formatShortDate(item.due_at, lang) })}</Tag>}
                  </span>
                  {!item.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary">
                      <span className="sr-only">{t('notif.unread')}</span>
                    </span>
                  )}
                </>
              )
              const row = clsx('flex items-start gap-3 py-3.5 text-left', compact ? 'px-5' : 'px-1')
              return (
                <li key={item.id}>
                  {href ? (
                    <Link to={href} onClick={() => open(item)} className={clsx(row, 'hover:bg-surface2')}>{body}</Link>
                  ) : (
                    <button type="button" onClick={() => open(item)} className={clsx(row, 'w-full hover:bg-surface2')}>{body}</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {compact && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <Link to="/notifications#settings" onClick={onNavigate} className="inline-flex items-center gap-1.5 text-d-label-s text-text hover:underline">
            <SlidersHorizontal size={16} aria-hidden />
            {t('notif.settings')}
          </Link>
          <Link to="/notifications" onClick={onNavigate} className="text-d-label-s text-primary hover:underline">
            {t('notif.seeAll')}
          </Link>
        </div>
      )}
    </div>
  )
}
