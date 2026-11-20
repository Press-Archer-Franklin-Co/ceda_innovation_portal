import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ChevronLeft, ChevronRight, Globe, Heart, Home as HomeIcon, ImageIcon, Layers, MessageCircle, Play,
  SlidersHorizontal, Sparkles, Users, LucideIcon,
} from 'lucide-react'
import clsx from 'clsx'
import Tag, { NewCue, TagTone } from '../ui/Tag'
import { buttonClasses } from '../ui/Button'
import { useI18n, StringKey } from '../../i18n'
import { formatDate, formatDayMonth, formatDuration } from '../../lib/dates'
import SectionHead, { SectionShell } from './SectionHead'
import ChallengeCard, { GeneralIdeaCard } from '../challenges/ChallengeCard'
import SubscribeCard from './SubscribeCard'
import type {
  ButtonLink, ChallengeCard as Challenge, PartnerCard, PostCard, PostType, QuoteCard, SectorRef, StoryCard,
} from '../../services/publicContent.service'

// Home page sections (Figma 1 · Public home). Each takes the section's settings and data from
// GET /api/content/public/home/; a section with nothing to show renders nothing.

// The article page (/news/:id) loads by id from the content API.
/** A post's own page (PostDetail). The public API looks posts up by slug; the id is only a fallback. */
export const postPath = (p: Pick<PostCard, 'id'> & { slug?: string }) => `/news/${encodeURIComponent(p.slug || p.id)}`
export const postTypeTone: Record<PostType, TagTone> = {
  news: 'neutral', event: 'orange', opportunity: 'green', result: 'amber', notice: 'neutral', newsletter: 'blue',
}

export function Cover({ post, className, big = false }: { post: PostCard; className?: string; big?: boolean }) {
  const { t } = useI18n()
  const cover = post.cover
  const isVideo = cover?.kind === 'video'
  const alt = typeof cover?.alt_text === 'string' ? cover.alt_text : cover?.alt_text ? cover.alt_text.en : ''
  return (
    <div className={clsx('relative overflow-hidden bg-surface2 flex items-center justify-center', className)}>
      {cover?.url && !isVideo ? (
        <img src={cover.url} alt={alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : !isVideo ? (
        <ImageIcon size={big ? 28 : 22} aria-hidden className="text-muted" />
      ) : null}
      {isVideo && (
        <span className="flex flex-col items-center gap-1.5">
          <span className={clsx('rounded-full bg-surface flex items-center justify-center shadow-[0_10px_15px_rgba(46,26,15,0.15)]', big ? 'w-16 h-16' : 'w-[52px] h-[52px]')}>
            <Play size={big ? 24 : 20} aria-hidden className="text-primary fill-primary ml-0.5" />
          </span>
          {post.duration_seconds ? <span className="text-d-cap text-muted">{formatDuration(post.duration_seconds)}</span> : null}
          <span className="sr-only">{t('home.play', { title: post.title })}</span>
        </span>
      )}
    </div>
  )
}

// ── Partners strip (10:329) ────────────────────────────────────────────────────────────────

export function PartnersStrip({ title, items }: { title: string; items: PartnerCard[] }) {
  const { t } = useI18n()
  if (!items.length) return null
  return (
    <section aria-labelledby="partners-title">
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-11">
        <h2 id="partners-title" className="text-d-h4 font-heading text-text mb-5">{title}</h2>
        <ul className="flex gap-3 lg:gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x -mx-5 px-5 lg:mx-0 lg:px-0">
          {items.map((p) => {
            const logo = p.logo?.url
            const body = logo ? (
              <img src={logo} alt={p.name} loading="lazy" className="max-h-10 max-w-[140px] object-contain" />
            ) : (
              <span className="text-d-label-s text-muted">{p.short_label || p.name || t('home.partnersEmpty')}</span>
            )
            const cls = 'flex items-center justify-center h-[68px] min-w-[150px] lg:min-w-0 lg:flex-1 px-4 rounded-card border border-border bg-surface'
            return (
              <li key={p.id} className="snap-start shrink-0 lg:shrink lg:flex-1">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className={clsx(cls, 'hover:border-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}>
                    {body}
                  </a>
                ) : (
                  <span className={cls}>{body}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// ── Challenges (10:364) ────────────────────────────────────────────────────────────────────

export function ChallengesSection({ title, items }: { title: string; items: Challenge[] }) {
  const { t } = useI18n()
  return (
    <SectionShell tone="soft" labelledBy="challenges-title">
      <SectionHead id="challenges-title" overline={t('home.challengesOver')} title={title} subtitle={t('home.challengesSub')} link={{ to: '/challenges', label: t('home.allChallenges') }} />
      <div className="flex gap-4 lg:gap-6 overflow-x-auto snap-x -mx-5 px-5 pb-2 lg:mx-0 lg:px-0 lg:pb-0 lg:grid lg:grid-cols-4 lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((c) => (
          <ChallengeCard key={c.id} challenge={c} className="snap-start shrink-0 w-[300px] lg:w-auto" />
        ))}
        <GeneralIdeaCard className="snap-start shrink-0 w-[300px] lg:w-auto" />
      </div>
    </SectionShell>
  )
}

// ── Leadership quotes (10:467) ─────────────────────────────────────────────────────────────

export function QuotesSection({ title, items, rotationSeconds }: { title: string; items: QuoteCard[]; rotationSeconds: number }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = items.length
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  useEffect(() => {
    if (count < 2 || paused || reduced || !rotationSeconds) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), rotationSeconds * 1000)
    return () => window.clearInterval(id)
  }, [count, paused, reduced, rotationSeconds])

  if (!count) return null
  const q = items[Math.min(index, count - 1)]
  const go = (d: number) => setIndex((i) => (i + d + count) % count)

  return (
    <section
      aria-labelledby="quotes-title"
      aria-roledescription="carousel"
      className="bg-banner text-on-banner"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-[72px]">
        <h2 id="quotes-title" className="font-heading font-bold text-[28px] leading-9 lg:text-d-h2 mb-7">{title}</h2>
        <div className="flex flex-col lg:flex-row gap-7 lg:gap-12 lg:items-center">
          <div className="relative w-full lg:w-[300px] h-[260px] lg:h-[320px] shrink-0 rounded-[16px] overflow-hidden bg-banner-deep">
            {q.photo_url && <img src={q.photo_url} alt={q.name} className="absolute inset-0 w-full h-full object-cover" />}
          </div>
          <figure className="flex-1 min-w-0 flex flex-col gap-4" aria-live="polite">
            <span aria-hidden className="font-heading font-extrabold text-[72px] leading-[48px] text-amber">“</span>
            <blockquote className="font-heading font-bold text-[20px] leading-7 lg:text-d-h3">{q.quote}</blockquote>
            <figcaption className="flex flex-col gap-0.5">
              <span className="text-d-label">{q.name}</span>
              <span className="text-d-cap text-banner-muted">{[q.job_title, q.committee_role].filter(Boolean).join(', ')}</span>
            </figcaption>
            {count > 1 && (
              <div className="flex items-center justify-between pt-3">
                <div className="flex items-center gap-1.5" aria-hidden>
                  {items.map((_, i) => (
                    <span key={i} className={clsx('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-yellow' : 'w-1.5 bg-banner-muted')} />
                  ))}
                </div>
                <p className="sr-only">{t('home.quoteOf', { n: index + 1, total: count })}</p>
                <div className="flex gap-2">
                  {[[-1, ChevronLeft, 'home.quotePrev'], [1, ChevronRight, 'home.quoteNext']].map(([d, Icon, label]) => {
                    const I = Icon as LucideIcon
                    return (
                      <button
                        key={label as string}
                        type="button"
                        onClick={() => go(d as number)}
                        aria-label={t(label as StringKey)}
                        className="w-10 h-10 rounded-full border border-banner-muted/60 flex items-center justify-center hover:bg-on-banner/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-banner"
                      >
                        <I size={18} aria-hidden />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </figure>
        </div>
      </div>
    </section>
  )
}

// ── News flash (10:496) ────────────────────────────────────────────────────────────────────

function Kicker({ post }: { post: PostCard }) {
  const { t, lang } = useI18n()
  const kind = post.cover?.kind === 'video' ? t('post.video') : t(`post.${post.type}` as StringKey)
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-d-over uppercase font-heading text-accent">{[kind, formatDayMonth(post.published_at, lang)].filter(Boolean).join(' · ')}</span>
      {post.is_new && <NewCue />}
    </span>
  )
}

export function NewsFlash({ title, items, onOpenVideo }: { title: string; items: PostCard[]; onOpenVideo?: (post: PostCard) => void }) {
  const { t, lang } = useI18n()
  if (!items.length) return null
  const [featured, ...rest] = items
  const open = (post: PostCard) => (e: React.MouseEvent) => {
    if (post.cover?.kind === 'video' && onOpenVideo) {
      e.preventDefault()
      onOpenVideo(post)
    }
  }
  return (
    <SectionShell labelledBy="news-title">
      <SectionHead id="news-title" overline={t('home.newsOver')} title={title} link={{ to: '/news', label: t('home.allNews') }} />
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <article className="flex-1 min-w-0 flex flex-col gap-3">
          <Link to={postPath(featured)} onClick={open(featured)} className="group block rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Cover post={featured} big className="h-[220px] lg:h-[380px] rounded-[16px]" />
          </Link>
          <div className="flex items-center gap-2">
            <Tag tone={postTypeTone[featured.type] ?? 'neutral'}>{t(`post.${featured.type}` as StringKey)}</Tag>
            <span className="text-d-cap text-muted">{formatDate(featured.published_at, lang)}</span>
            {featured.is_new && <NewCue />}
          </div>
          <h3 className="font-heading font-bold text-[20px] leading-7 lg:text-d-h3 text-text">
            <Link to={postPath(featured)} onClick={open(featured)} className="hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
              {featured.title}
            </Link>
          </h3>
          {featured.excerpt && <p className="text-d-body-s text-muted">{featured.excerpt}</p>}
        </article>
        {rest.length > 0 && (
          <ul className="flex flex-col gap-3.5 lg:w-[440px] shrink-0">
            {rest.map((p) => (
              <li key={p.id} className="border-b border-border pb-3.5">
                <Link to={postPath(p)} onClick={open(p)} className="group flex gap-3.5 items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Cover post={p} className="w-[112px] lg:w-[128px] h-[76px] lg:h-[84px] rounded-[10px] shrink-0" />
                  <span className="flex flex-col gap-1 min-w-0">
                    <Kicker post={p} />
                    <span className="text-d-h5 font-heading text-text group-hover:underline underline-offset-4">{p.title}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionShell>
  )
}

// ── Bulletin board (10:558) ────────────────────────────────────────────────────────────────

const FILTERS: (PostType | 'all')[] = ['all', 'notice', 'event', 'opportunity', 'result', 'newsletter']

export function BulletinBoard({ title, items }: { title: string; items: PostCard[] }) {
  const { t, lang } = useI18n()
  const [filter, setFilter] = useState<PostType | 'all'>('all')
  const shown = filter === 'all' ? items : items.filter((p) => p.type === filter)
  return (
    <SectionShell tone="soft" labelledBy="bulletin-title">
      <SectionHead id="bulletin-title" overline={t('home.bulletinOver')} title={title} />
      <div role="group" aria-label={t('home.bulletinOver')} className="flex gap-2 overflow-x-auto -mx-5 px-5 lg:mx-0 lg:px-0 mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={clsx(
              'shrink-0 min-h-[32px] px-3 rounded-full text-d-label-s border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              filter === f ? 'bg-primary border-primary text-on-primary' : 'bg-surface border-border text-text hover:border-muted/60',
            )}
          >
            {t(`filter.${f}` as StringKey)}
          </button>
        ))}
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 bg-surface border border-border rounded-card overflow-hidden">
          {shown.length === 0 ? (
            <p className="px-5 py-8 text-d-body-s text-muted text-center">{t('home.noBulletin')}</p>
          ) : (
            <ul>
              {shown.map((p) => (
                <li key={p.id} className="border-b border-border last:border-b-0">
                  <Link to={postPath(p)} className="group flex items-center gap-3.5 px-5 py-4 hover:bg-surface2/60 focus-visible:outline-none focus-visible:bg-surface2">
                    <span aria-hidden className={clsx('w-2 h-2 rounded-full shrink-0', p.is_new ? 'bg-primary' : 'bg-transparent')} />
                    <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <span className="flex flex-wrap gap-1.5">
                        <Tag tone={postTypeTone[p.type] ?? 'neutral'}>{t(`post.${p.type}` as StringKey)}</Tag>
                        {p.is_new && <NewCue />}
                      </span>
                      <span className="text-d-label text-text group-hover:underline underline-offset-4">{p.title}</span>
                      <span className="text-d-cap text-muted">{formatDate(p.published_at, lang)}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="text-muted shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <SubscribeCard className="lg:w-[380px] shrink-0 self-start" />
      </div>
    </SectionShell>
  )
}

// ── Sectors (10:656) ───────────────────────────────────────────────────────────────────────

const SECTOR_ICONS: Record<string, LucideIcon> = {
  spark: Sparkles, home: HomeIcon, layers: Layers, globe: Globe, users: Users, heart: Heart, chat: MessageCircle, sliders: SlidersHorizontal,
}

export function SectorsSection({ title, items }: { title: string; items: { sector: SectorRef; example: string; icon: string }[] }) {
  const { t } = useI18n()
  if (!items.length) return null
  return (
    <SectionShell labelledBy="sectors-title">
      <SectionHead id="sectors-title" overline={t('home.sectorsOver')} title={title} subtitle={t('home.sectorsSub')} />
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {items.map(({ sector, example, icon }) => {
          const Icon = SECTOR_ICONS[icon] ?? Sparkles
          return (
            <li key={sector.id} className="flex flex-col gap-2.5 p-5 rounded-card border border-border">
              <span aria-hidden className="w-10 h-10 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center">
                <Icon size={20} />
              </span>
              <h3 className="text-d-h5 font-heading text-text">{sector.name}</h3>
              {example && <p className="text-d-cap text-muted">{example}</p>}
            </li>
          )
        })}
      </ul>
    </SectionShell>
  )
}

// ── How it works (10:714) ──────────────────────────────────────────────────────────────────

export function HowItWorks({ title, steps }: { title: string; steps: { title: string; text: string; icon: string }[] }) {
  const { t } = useI18n()
  if (!steps.length) return null
  return (
    <SectionShell tone="soft" labelledBy="how-title">
      <SectionHead id="how-title" overline={t('home.howOver')} title={title} link={{ to: '/guidelines', label: t('home.fullGuide') }} />
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {steps.map((s, i) => (
          <li key={i} className="flex lg:flex-col gap-3">
            <span
              aria-hidden
              className={clsx(
                'w-9 h-9 rounded-full flex items-center justify-center text-d-label shrink-0',
                i === 0 ? 'bg-primary text-on-primary' : 'bg-surface border border-border text-text',
              )}
            >
              {i + 1}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-d-h5 font-heading text-text"><span className="sr-only">{i + 1}. </span>{s.title}</span>
              {s.text && <span className="text-d-cap text-muted">{s.text}</span>}
            </span>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

// ── Call to action band (10:754) ───────────────────────────────────────────────────────────

export function CtaBand({ headline, text, button }: { headline: string; text: string; button: ButtonLink | null }) {
  return (
    <section className="bg-accent text-on-accent">
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-d-h3 font-heading">{headline}</h2>
          {text && <p className="text-d-body-s">{text}</p>}
        </div>
        {button?.label && button.url && (
          <Link to={button.url} className={buttonClasses({ variant: 'primary', className: '!bg-banner hover:!bg-banner-deep text-on-banner self-start sm:self-auto' })}>
            {button.label}
            <ArrowRight size={18} aria-hidden />
          </Link>
        )}
      </div>
    </section>
  )
}

// ── Stories (no Figma frame on 1.1 yet: a simple card row in the same style) ───────────────

export function StoriesSection({ title, items }: { title: string; items: StoryCard[] }) {
  const { t } = useI18n()
  const scroller = useRef<HTMLUListElement>(null)
  if (!items.length) return null
  return (
    <SectionShell labelledBy="stories-title">
      <SectionHead id="stories-title" overline={t('home.storiesOver')} title={title} link={{ to: '/stories', label: t('home.allStories') }} />
      <ul ref={scroller} className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {items.map((s) => (
          <li key={s.id} className="flex flex-col rounded-card border border-border overflow-hidden bg-surface">
            <div className="relative h-[180px] bg-surface2">
              {s.photo_url && <img src={s.photo_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
            </div>
            <div className="p-5 flex flex-col gap-2">
              <p className="text-d-over uppercase font-heading text-accent">{[s.program, s.year].filter(Boolean).join(' · ')}</p>
              <h3 className="text-d-h4 font-heading text-text">{s.business || s.name}</h3>
              {s.quote && <p className="text-d-body-s text-muted line-clamp-3">{s.quote}</p>}
              {s.name && s.business && <p className="text-d-label-s text-text">{s.name}</p>}
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
