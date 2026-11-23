import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, FileText, Search, X } from 'lucide-react'
import clsx from 'clsx'
import Tag, { NewCue } from '../components/ui/Tag'
import Button from '../components/ui/Button'
import { SelectControl } from '../components/ui/Select'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import PageBanner from '../components/layout/PageBanner'
import SubscribeCard from '../components/home/SubscribeCard'
import VideoStoryDialog from '../components/home/VideoStoryDialog'
import { useTrigger } from '../components/ui/useTrigger'
import { Cover, postPath, postTypeTone } from '../components/home/sections'
import { useI18n, StringKey } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { formatDate, formatDayMonth } from '../lib/dates'
import { isOpened, markOpened } from '../lib/openedPosts'
import { publicContent, PostCard, PostType } from '../services/publicContent.service'

// Screen 1.6 News & bulletin (Figma 13:433 website, 13:734 phone). One feed for news, events, opportunities,
// results, notices and newsletters: filter chips, search, sort, newest first. Fresh items carry NEW for 7 days
// (API is_new) and a dot until opened on this device. The right rail keeps subscribe, upcoming events and the
// newsletter archive in view. Filters, search and sort live in the URL.

const TYPES: (PostType | 'all')[] = ['all', 'news', 'event', 'opportunity', 'result', 'notice', 'newsletter']
type Sort = 'newest' | 'oldest' | 'popular'

function NewsCard({ post, onOpen }: { post: PostCard; onOpen: (p: PostCard) => void }) {
  const { t, lang } = useI18n()
  const [opened, setOpened] = useState(() => isOpened(post.id))
  const isVideo = post.cover?.kind === 'video'
  const open = (e: React.MouseEvent) => {
    markOpened(post.id)
    setOpened(true)
    if (isVideo) {
      e.preventDefault()
      onOpen(post)
    }
  }
  return (
    <article className="flex flex-col gap-2.5 pb-4">
      <Link to={postPath(post)} onClick={open} tabIndex={-1} aria-hidden className="block rounded-card">
        <Cover post={post} className="h-[180px] rounded-card" />
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag tone={isVideo ? 'orange' : postTypeTone[post.type] ?? 'neutral'}>{isVideo ? t('post.video') : t(`post.${post.type}` as StringKey)}</Tag>
        {post.is_new && <NewCue />}
        <span className="text-d-cap text-muted">{formatDayMonth(post.published_at, lang)}</span>
      </div>
      <h3 className="text-d-h4 font-heading text-text">
        <Link to={postPath(post)} onClick={open} className="hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {post.is_new && !opened && (
            <>
              <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-primary mr-2 align-middle" />
              <span className="sr-only">{t('news.unread')}: </span>
            </>
          )}
          {post.title}
        </Link>
      </h3>
      {post.excerpt && <p className="text-d-body-s text-muted line-clamp-2">{post.excerpt}</p>}
    </article>
  )
}

function FeaturedPost({ post, onOpen }: { post: PostCard; onOpen: (p: PostCard) => void }) {
  const { t } = useI18n()
  const isVideo = post.cover?.kind === 'video'
  const open = (e: React.MouseEvent) => {
    markOpened(post.id)
    if (isVideo) {
      e.preventDefault()
      onOpen(post)
    }
  }
  return (
    <article className="flex flex-col md:flex-row gap-5 md:gap-6">
      <Link to={postPath(post)} onClick={open} tabIndex={-1} aria-hidden className="block md:w-[520px] shrink-0 rounded-[16px]">
        <Cover post={post} big className="h-[220px] md:h-[300px] rounded-[16px]" />
      </Link>
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Tag tone="dark">{t(`post.${post.type}` as StringKey)}</Tag>
          <Tag tone="amber">{t('news.featured')}</Tag>
        </div>
        <h2 className="font-heading font-bold text-[26px] leading-8 lg:text-d-h2 text-text">{post.title}</h2>
        {post.excerpt && <p className="text-d-body text-muted">{post.excerpt}</p>}
        <Link to={postPath(post)} onClick={open} className="inline-flex items-center gap-1.5 self-start text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {t('news.readStory')}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </article>
  )
}

function UpcomingEvents() {
  const { t, lang } = useI18n()
  const events = useAsync(() => publicContent.upcomingEvents(), [lang])
  return (
    <section aria-labelledby="events-title" className="flex flex-col gap-3 p-5 rounded-card border border-border">
      <h2 id="events-title" className="text-d-h4 font-heading text-text">{t('news.events')}</h2>
      {events.loading ? (
        <SkeletonText lines={3} />
      ) : events.error ? (
        <ErrorState title={t('common.somethingWrong')} onRetry={events.reload} framed={false} className="!py-4" />
      ) : (events.data ?? []).length === 0 ? (
        <p className="text-d-body-s text-muted">{t('news.noEvents')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(events.data ?? []).slice(0, 4).map((e) => {
            const d = e.event_starts_at ? new Date(e.event_starts_at) : null
            return (
              <li key={e.id}>
                <Link to={postPath(e)} className="group flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span aria-hidden className="w-[52px] shrink-0 rounded-control bg-primary-soft text-primary flex flex-col items-center py-1.5">
                    <span className="font-heading font-bold text-[18px] leading-[26px]">{d ? String(d.getDate()).padStart(2, '0') : '–'}</span>
                    <span className="text-d-label-s uppercase">{d ? d.toLocaleDateString(lang === 'tn' ? 'en-BW' : 'en-GB', { month: 'short' }) : ''}</span>
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-d-label text-text group-hover:underline underline-offset-4 truncate">{e.title}</span>
                    <span className="text-d-cap text-muted truncate">
                      {[e.event_place, d ? d.toLocaleTimeString(lang === 'tn' ? 'en-BW' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : ''].filter(Boolean).join(' · ')}
                      <span className="sr-only">, {formatDate(e.event_starts_at, lang)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function NewsletterArchive() {
  const { t, lang } = useI18n()
  const issues = useAsync(() => publicContent.newsletters(), [lang])
  return (
    <section aria-labelledby="archive-title" className="flex flex-col gap-2.5 p-5 rounded-card bg-surface2">
      <h2 id="archive-title" className="text-d-h4 font-heading text-text">{t('news.archive')}</h2>
      {issues.loading ? (
        <SkeletonText lines={3} />
      ) : issues.error ? (
        <ErrorState title={t('common.somethingWrong')} onRetry={issues.reload} framed={false} className="!py-4" />
      ) : (issues.data ?? []).length === 0 ? (
        <p className="text-d-body-s text-muted">{t('news.noArchive')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {(issues.data ?? []).slice(0, 6).map((n) => (
            <li key={n.id}>
              <Link to={postPath(n)} className="group flex items-center gap-2.5 min-h-[36px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <FileText size={16} aria-hidden className="text-accent shrink-0" />
                <span className="flex-1 min-w-0 text-d-label text-text group-hover:underline underline-offset-4 truncate">
                  {[n.newsletter_issue ? `#${n.newsletter_issue}` : '', n.published_at ? new Date(n.published_at).toLocaleDateString(lang === 'tn' ? 'en-BW' : 'en-GB', { month: 'long', year: 'numeric' }) : n.title].filter(Boolean).join(' · ')}
                </span>
                <ArrowRight size={14} aria-hidden className="text-muted shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function News() {
  const { t, lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const type = (params.get('type') as PostType | null) ?? ''
  const q = params.get('q') ?? ''
  const sort = (params.get('sort') as Sort | null) ?? 'newest'
  const storySlug = params.get('story')
  const [draft, setDraft] = useState(q)
  const [page, setPage] = useState(1)
  const [extra, setExtra] = useState<PostCard[]>([])
  const [loadingMore, setLoadingMore] = useState(false)

  const set = (patch: Record<string, string>) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      return next
    }, { replace: true })

  // Search updates as the person types (250 ms).
  useEffect(() => setDraft(q), [q])
  useEffect(() => {
    if (draft === q) return
    const id = window.setTimeout(() => set({ q: draft.trim() }), 250)
    return () => window.clearTimeout(id)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useAsync(() => publicContent.posts({ type, q, sort, page: 1 }), [type, q, sort, lang])
  useEffect(() => {
    setPage(1)
    setExtra([])
  }, [type, q, sort, lang])

  const posts = useMemo(() => [...(list.data?.results ?? []), ...extra], [list.data, extra])
  const featured = list.data?.featured ?? null
  const pages = list.data?.pages ?? 1

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const next = await publicContent.posts({ type, q, sort, page: page + 1 })
      setExtra((x) => [...x, ...next.results])
      setPage(next.page)
    } finally {
      setLoadingMore(false)
    }
  }

  const openStory = (p: PostCard | null) => set({ story: p ? p.slug || p.id : '' })
  const storyCard = useTrigger() // the card that was pressed: the story opens out of it
  const story = storySlug ? ({ slug: storySlug, id: storySlug, title: '' } as PostCard) : null

  return (
    <>
      <PageBanner id="news-page-title" overline={t('news.over')} title={t('news.title')} subtitle={t('news.sub')}>
        <form role="search" onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() }) }} className="relative max-w-[560px]">
          <Search size={18} aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('news.search')}
            aria-label={t('news.search')}
            className="w-full h-12 pl-11 pr-11 rounded-control bg-surface text-text text-d-body-s placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-yellow"
          />
          {draft && (
            <button type="button" onClick={() => { setDraft(''); set({ q: '' }) }} aria-label={t('news.clear')} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-control text-muted hover:bg-surface2 flex items-center justify-center">
              <X size={16} aria-hidden />
            </button>
          )}
        </form>
      </PageBanner>

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-[72px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
          <div role="group" aria-label={t('news.filters')} className="flex gap-2 overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TYPES.map((f) => {
              const on = (type || 'all') === f
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ type: f === 'all' ? '' : f })}
                  className={clsx(
                    'shrink-0 min-h-[32px] px-3 rounded-full text-d-label-s border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    on ? 'bg-primary border-primary text-on-primary' : 'bg-surface border-border text-text hover:border-muted/60',
                  )}
                >
                  {t(`filter.${f}` as StringKey)}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-d-label text-text" id="news-sort-label">{t('news.sort')}:</span>
            <SelectControl
              aria-label={t('news.sort')}
              className="w-[150px]"
              options={[{ value: 'newest', label: t('news.sortNewest') }, { value: 'oldest', label: t('news.sortOldest') }, { value: 'popular', label: t('news.sortPopular') }]}
              value={sort}
              onChange={(v) => set({ sort: v === 'newest' ? '' : v })}
            />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1 min-w-0 flex flex-col gap-8" aria-busy={list.fetching || undefined}>
            {list.loading ? (
              <div aria-hidden className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row gap-6">
                  <Skeleton className="h-[220px] md:h-[300px] md:w-[520px] rounded-[16px]" />
                  <div className="flex-1 space-y-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-10 w-full" /><SkeletonText lines={3} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="space-y-2.5"><Skeleton className="h-[180px] rounded-card" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-5 w-full" /></div>)}
                </div>
              </div>
            ) : list.error && !list.data ? (
              <ErrorState title={t('news.loadError')} body={t('home.loadErrorBody')} onRetry={list.reload} retrying={list.fetching} />
            ) : !featured && posts.length === 0 ? (
              <EmptyState title={q ? t('news.emptySearch', { q }) : t('news.empty')} body={t('news.emptyBody')}>
                {q && <Button variant="secondary" size="sm" onClick={() => { setDraft(''); set({ q: '' }) }}>{t('news.clear')}</Button>}
              </EmptyState>
            ) : (
              <>
                {q && <p role="status" className="text-d-body-s text-muted -mb-4">{t('news.results', { n: list.data?.total ?? posts.length })}</p>}
                {featured && <div onClickCapture={storyCard.fromInside}><FeaturedPost post={featured} onOpen={openStory} /></div>}
                {/* Hidden heading keeps the order h1 > h2 > card h3 for screen readers. */}
                {posts.length > 0 && <h2 className="sr-only">{t('news.listTitle')}</h2>}
                <div onClickCapture={storyCard.fromInside} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
                  {posts.map((p) => <NewsCard key={p.id} post={p} onOpen={openStory} />)}
                </div>
                {page < pages && (
                  <div className="flex justify-center">
                    <Button variant="secondary" onClick={loadMore} loading={loadingMore}>{t('news.loadMore')}</Button>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="lg:w-[340px] shrink-0 flex flex-col gap-6">
            <SubscribeCard headingLevel={2} />
            <UpcomingEvents />
            <NewsletterArchive />
          </aside>
        </div>
      </div>
      <VideoStoryDialog post={story} onClose={() => openStory(null)} onOpenPost={openStory} triggerRef={storyCard.ref} />
    </>
  )
}
