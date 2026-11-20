import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, CalendarDays, MapPin, PlayCircle } from 'lucide-react'
import Tag from '../components/ui/Tag'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import { buttonClasses } from '../components/ui/Button'
import { Cover, postPath, postTypeTone } from '../components/home/sections'
import { hasString, useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { publicContent } from '../services/publicContent.service'

// One post from the news and bulletin board: GET /api/content/public/posts/<slug>/. Opened from News, Home and
// site search (1.3). The body is plain text: paragraphs split on blank lines, never HTML.
// A video post opens in the video dialog on News (1.4), where captions and the transcript live.

function day(iso: string | null, lang: string, withTime = false) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(d)
}

export default function PostDetail() {
  const { t, lang } = useI18n()
  const { slug = '' } = useParams()
  const res = useAsync(() => publicContent.post(slug), [slug, lang])
  const post = res.data

  if (res.loading) {
    return (
      <div aria-busy="true" className="max-w-[760px] mx-auto px-4 sm:px-6 py-10 space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-64 w-full rounded-[16px]" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
      </div>
    )
  }

  if (res.error || !post) {
    const missing = axios.isAxiosError(res.error) && res.error.response?.status === 404
    return (
      <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-12">
        {missing ? (
          <EmptyState title={t('postd.notFound')} body={t('postd.notFoundBody')}>
            <Link to="/news" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('postd.back')}</Link>
          </EmptyState>
        ) : (
          <ErrorState title={t('postd.loadError')} onRetry={res.reload} retrying={res.fetching} />
        )}
      </div>
    )
  }

  const isVideo = post.cover?.kind === 'video'
  const paragraphs = (post.body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const typeKey = `post.${post.type}`

  return (
    <article className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <Link to="/news" className="inline-flex items-center gap-1.5 text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft size={16} aria-hidden /> {t('postd.back')}
      </Link>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-d-cap text-muted">
        {hasString(typeKey) && <Tag tone={postTypeTone[post.type]}>{t(typeKey)}</Tag>}
        {post.published_at && <time dateTime={post.published_at}>{day(post.published_at, lang)}</time>}
        {post.newsletter_issue && <span>· {post.newsletter_issue}</span>}
      </div>
      <h1 className="mt-3 text-d-mh1 lg:text-d-h2 font-heading text-text">{post.title}</h1>
      {post.excerpt && <p className="mt-3 text-d-body text-muted">{post.excerpt}</p>}

      {post.type === 'event' && (post.event_starts_at || post.event_place) && (
        <ul className="mt-4 space-y-1.5 text-d-body-s text-text">
          {post.event_starts_at && <li className="flex items-center gap-2"><CalendarDays size={16} aria-hidden className="text-accent" />{day(post.event_starts_at, lang, true)}</li>}
          {post.event_place && <li className="flex items-center gap-2"><MapPin size={16} aria-hidden className="text-accent" />{post.event_place}</li>}
        </ul>
      )}

      {isVideo ? (
        <Link to={`/news?story=${encodeURIComponent(post.slug || post.id)}`} className="mt-6 block rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Cover post={post} big className="aspect-video rounded-[16px]" />
          <span className={buttonClasses({ variant: 'primary', size: 'sm', className: 'mt-3' })}><PlayCircle size={16} aria-hidden /> {t('postd.watch')}</span>
        </Link>
      ) : post.cover?.url ? (
        <Cover post={post} big className="mt-6 aspect-[16/9] rounded-[16px]" />
      ) : null}

      {paragraphs.length > 0 && (
        <div className="mt-6 space-y-4 text-d-body text-text">
          {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        </div>
      )}

      {post.related?.length > 0 && (
        <section aria-labelledby="postd-related" className="mt-10 border-t border-border pt-6">
          <h2 id="postd-related" className="text-d-h4 font-heading text-text">{t('postd.related')}</h2>
          <ul className="mt-3 divide-y divide-border">
            {post.related.map((r) => (
              <li key={r.id}>
                <Link to={postPath(r)} className="flex items-center justify-between gap-3 py-3 text-d-body-s text-text hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                  <span className="font-bold">{r.title}</span>
                  {r.published_at && <time dateTime={r.published_at} className="text-d-cap text-muted shrink-0">{day(r.published_at, lang)}</time>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
