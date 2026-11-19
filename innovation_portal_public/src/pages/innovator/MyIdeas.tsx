import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import { buttonClasses } from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState, { ErrorState } from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import Tabs from '../../components/ui/Tabs'
import Tag from '../../components/ui/Tag'
import IdeaCard from '../../components/innovator/IdeaCard'
import { useI18n, type StringKey } from '../../i18n'
import { ideaMessagesService } from '../../services/ideaMessages.service'
import { innovatorService } from '../../services/innovator.service'
import type { IdeasFilter, IdeasList, RecentThread } from '../../types/innovator'

const TABS: Array<{ key: IdeasFilter; label: StringKey }> = [
  { key: 'all', label: 'ideas.tabAll' },
  { key: 'needs_action', label: 'ideas.tabNeedsAction' },
  { key: 'drafts', label: 'ideas.tabDrafts' },
  { key: 'in_review', label: 'ideas.tabInReview' },
  { key: 'finished', label: 'ideas.tabFinished' },
]

function isFilter(value: string | null): value is IdeasFilter {
  return TABS.some((tab) => tab.key === value)
}

/** Screen 2.2: every idea in one list, with tabs and counts. Ideas that need action come first. */
export default function MyIdeas() {
  const { t, lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: IdeasFilter = isFilter(raw) ? raw : 'all'

  const [data, setData] = useState<IdeasList | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      setData(await innovatorService.ideas(tab, lang))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [tab, lang])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    document.title = `${t('ideas.title')} · CEDA Innovation`
  }, [t])

  const counts = data?.counts
  const results = data ? [...data.results].sort((a, b) => Number(b.state === 'needs_action') - Number(a.state === 'needs_action')) : []
  const total = counts?.all ?? 0
  const waiting = counts?.needs_action ?? 0

  return (
    <div className="bg-bg">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 pt-10 pb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-d-mh1 sm:text-d-h2 text-text">{t('ideas.title')}</h1>
          {counts && (
            <p className="mt-2 text-d-body text-muted">
              {total === 1 ? t('ideas.countOne') : t('ideas.count', { count: total })}
              {waiting > 0 && ` · ${waiting === 1 ? t('ideas.needReplyOne') : t('ideas.needReply', { count: waiting })}`}
            </p>
          )}
        </div>
        {/* TODO(U2): the quick start on the home page; the old submit page until then. */}
        <Link to="/innovate" className={buttonClasses({ variant: 'primary', size: 'md' })}>
          <Plus size={18} aria-hidden />
          {t('ideas.new')}
        </Link>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 pb-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <Tabs
            tabs={TABS.map((item) => ({ key: item.key, label: t(item.label), count: counts?.[item.key] }))}
            active={tab}
            onChange={(key) => setParams(key === 'all' ? {} : { tab: key }, { replace: true })}
            label={t('ideas.title')}
            idPrefix="ideas"
          />
          <div className="mt-5 flex flex-col gap-4" aria-busy={loading || undefined}>
            {failed ? (
              <ErrorState title={t('ideas.loadError')} onRetry={load} />
            ) : !data && loading ? (
              Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[180px] w-full rounded-card" />)
            ) : results.length === 0 ? (
              tab === 'all' ? (
                <EmptyState title={t('ideas.emptyAll')}>
                  <Link to="/innovate" className={buttonClasses({ variant: 'primary', size: 'sm' })}>{t('ideas.new')}</Link>
                </EmptyState>
              ) : (
                <EmptyState title={t('ideas.emptyTab')} />
              )
            ) : (
              results.map((item) => <IdeaCard key={`${item.kind}-${item.id}`} item={item} />)
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <RecentMessages />
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
 * Latest message per idea (B3). Until B3 is on main the endpoint does not
 * exist, so the card is not shown at all rather than claiming "no messages".
 */
function RecentMessages() {
  const { t } = useI18n()
  const [threads, setThreads] = useState<RecentThread[] | null>(null)

  useEffect(() => {
    let alive = true
    ideaMessagesService
      .recent()
      .then((list) => alive && setThreads(list))
      .catch(() => alive && setThreads(null))
    return () => {
      alive = false
    }
  }, [])

  if (!threads) return null
  const unread = threads.reduce((sum, thread) => sum + (thread.unread || 0), 0)
  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-d-h5 text-text">{t('ideas.messages')}</h2>
        {unread > 0 && <Tag tone="red">{t('ideas.messagesNew', { count: unread })}</Tag>}
      </div>
      {threads.length === 0 ? (
        <p className="mt-3 text-d-body-s text-muted">{t('ideas.messagesEmpty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {threads.map((thread) => {
            const author = thread.last_message.author_name || (thread.last_message.author_role === 'system' ? t('track.system') : t('track.officer'))
            return (
              <li key={thread.idea_id}>
                <Link to={`/my-ideas/${thread.idea_id}#messages`} className="flex gap-3 rounded-control p-1 hover:bg-surface2">
                  <Avatar name={author} size="sm" decorative />
                  <span className="min-w-0">
                    <span className="block truncate text-d-label-s text-text">
                      {[author, thread.last_message.author_title].filter(Boolean).join(' · ')}
                    </span>
                    <span className="block truncate text-d-cap text-muted">{thread.last_message.body}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
