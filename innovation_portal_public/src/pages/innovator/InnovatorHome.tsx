import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, CheckCircle2, FileText, Megaphone, MessageCircle, Sparkles, Trophy } from 'lucide-react'
import Button, { buttonClasses } from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState } from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import Tag from '../../components/ui/Tag'
import { useToast } from '../../components/ui/Toast'
import ChallengeCard from '../../components/innovator/ChallengeCard'
import StageBar from '../../components/innovator/StageBar'
import { ideaStatusWord } from '../../components/innovator/ideaStatus'
import { firstName, formatShortDate, relativeTime } from '../../components/innovator/format'
import { ideaLink } from '../../components/innovator/links'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { innovatorService } from '../../services/innovator.service'
import type {
  ChallengeMatch, IdeaItem, MySummary, NextAction, ProfileCompleteness, RecommendedChallenge, UpdateItem,
} from '../../types/innovator'
import { parseApiError } from '../../utils/apiError'

type Async<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [Async<T>, () => void] {
  const [state, setState] = useState<Async<T>>({ status: 'loading' })
  // `deps` are the caller's; `fn` is rebuilt every render on purpose.
  const run = useCallback(() => {
    let alive = true
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    fn()
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch(() => alive && setState({ status: 'error' }))
    return () => {
      alive = false
    }
  }, deps)
  useEffect(() => run(), [run])
  return [state, run]
}

/** Screen 2.1: the signed-in home. The banner becomes the person's own summary with one next action. */
export default function InnovatorHome() {
  const { t, lang } = useI18n()
  const { user } = useAuth()

  const [summary, reloadSummary] = useLoad<MySummary>(() => innovatorService.summary(lang), [lang])
  const [challenges] = useLoad<RecommendedChallenge[]>(() => innovatorService.recommendedChallenges(lang), [lang])
  const [updates, reloadUpdates] = useLoad(() => innovatorService.updates(), [])
  const [profile] = useLoad<ProfileCompleteness>(() => innovatorService.profileCompleteness(), [])

  useEffect(() => {
    document.title = `${t('nav.home')} · CEDA Innovation`
  }, [t])

  const name = user?.first_name || firstName(user?.name)
  const active = summary.status === 'ready' ? summary.data.active_idea : null
  const next = summary.status === 'ready' ? summary.data.next_action : null

  return (
    <div className="bg-bg">
      {/* Personal banner */}
      <section className="bg-banner text-on-banner">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:py-12">
          {summary.status === 'error' ? (
            <ErrorState title={t('common.somethingWrong')} onRetry={reloadSummary} />
          ) : summary.status === 'loading' ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-32 opacity-40" />
              <Skeleton className="h-12 w-3/4 opacity-40" />
              <Skeleton className="h-6 w-2/3 opacity-40" />
            </div>
          ) : (
            <Banner name={name} next={next} active={active} />
          )}
          {active && <LatestIdeaCard item={active} />}
        </div>
      </section>

      {/* Challenges for you */}
      <ForYou challenges={challenges} active={active} />

      {/* Updates and profile */}
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-d-over uppercase text-primary">{t('home.updatesEyebrow')}</p>
            <h2 className="mt-1 font-heading text-d-h3 text-text">{t('home.updatesTitle')}</h2>
          </div>
          <Link to="/notifications" className="inline-flex items-center gap-1 text-d-label text-primary hover:underline">
            {t('home.seeAll')}
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <UpdatesList state={updates} onRetry={reloadUpdates} />
          {profile.status === 'ready' && profile.data.percent_complete < 100 && <ProfileCard profile={profile.data} />}
        </div>
      </section>
      {/* TODO(B6): news flash from GET /api/content/public/home/ once B6 is on main. */}
    </div>
  )
}

function Banner({ name, next, active }: { name: string; next: NextAction | null; active: IdeaItem | null }) {
  const { t, lang } = useI18n()
  let headline = t('home.headlineNone')
  let body = t('home.nextNone')
  let primary: { to: string; label: string } = { to: '/innovate', label: t('home.startIdea') }
  let secondary: { to: string; label: string } | null = { to: '/my-ideas', label: t('home.myIdeas') }

  if (next?.type === 'answer_question') {
    headline = t('home.headlineAction')
    const date = next.reply_by ? formatShortDate(next.reply_by, lang) : ''
    const officer = next.open_question?.officer_first_name
    body = officer && date
      ? t('home.nextAnswerNamed', { name: officer, title: next.title, date })
      : date
        ? t('home.nextAnswer', { title: next.title, date })
        : t('home.nextAnswerNoDate', { title: next.title })
    primary = { to: `/my-ideas/${next.idea_id}#messages`, label: t('home.reply') }
    secondary = { to: `/my-ideas/${next.idea_id}`, label: t('home.viewIdea') }
  } else if (next?.type === 'finish_draft') {
    headline = active ? t('home.headlineMoving') : t('home.headlineNone')
    body = t('home.nextFinish', { title: next.title, percent: next.percent_complete })
    primary = { to: `/my-ideas/draft/${next.idea_id}`, label: t('home.continueIdea') }
  } else if (next?.type === 'complete_profile') {
    headline = active ? t('home.headlineMoving') : t('home.headlineNone')
    body = t('home.nextProfile', { percent: next.percent_complete })
    primary = { to: '/profile', label: t('home.completeProfile') }
  } else if (active) {
    headline = t('home.headlineMoving')
    body = ''
    primary = { to: ideaLink(active), label: t('home.viewIdea') }
  }

  return (
    <div>
      {name && <p className="text-d-over uppercase text-on-banner/80">{t('home.greeting', { name })}</p>}
      <h1 className="mt-3 font-heading text-d-mh1 sm:text-d-h2">{headline}</h1>
      {body && <p className="mt-4 max-w-[640px] text-d-body">{body}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={primary.to} className={buttonClasses({ variant: 'primary' })}>{primary.label}</Link>
        {secondary && <Link to={secondary.to} className={buttonClasses({ variant: 'onDark' })}>{secondary.label}</Link>}
      </div>
    </div>
  )
}

function LatestIdeaCard({ item }: { item: IdeaItem }) {
  const { t } = useI18n()
  const word = ideaStatusWord(item)
  return (
    <Card padding="md" className="text-text">
      <div className="flex items-center justify-between gap-2">
        <Tag tone={word.tone}>{t(word.key)}</Tag>
        <span className="text-d-cap text-muted">{item.reference}</span>
      </div>
      <h2 className="mt-3 font-heading text-d-h5">
        <Link to={ideaLink(item)} className="hover:underline">{item.title}</Link>
      </h2>
      <StageBar stages={item.stages} className="mt-4" />
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-3">
        <Link to={`${ideaLink(item)}#messages`} className="flex items-center gap-2 rounded-control p-2 text-d-label-s hover:bg-surface2">
          <MessageCircle size={16} aria-hidden className="text-muted" />
          {t('home.messages')}
          {item.unread_messages ? <Tag tone="red">{item.unread_messages}</Tag> : null}
        </Link>
        <Link to="/notifications" className="flex items-center gap-2 rounded-control p-2 text-d-label-s hover:bg-surface2">
          <Bell size={16} aria-hidden className="text-muted" />
          {t('home.updatesLink')}
          {item.unread_updates ? <Tag tone="red">{item.unread_updates}</Tag> : null}
        </Link>
        <Link to="/my-ideas?tab=drafts" className="col-span-2 flex items-center gap-2 rounded-control p-2 text-d-label-s hover:bg-surface2 sm:col-span-1">
          <FileText size={16} aria-hidden className="text-muted" />
          {t('ideas.tabDrafts')}
        </Link>
      </div>
    </Card>
  )
}

function ForYou({ challenges, active }: { challenges: Async<RecommendedChallenge[]>; active: IdeaItem | null }) {
  const { t } = useI18n()
  if (challenges.status === 'error') return null // The rest of the home still works; nothing false is shown.
  const list = challenges.status === 'ready' ? challenges.data.slice(0, 2) : []
  const sectors = Array.from(new Set(list.flatMap((c) => c.matched_sectors.map((s) => s.name))))
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-12 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-d-over uppercase text-primary">
            {sectors.length ? t('home.forYouEyebrow', { sectors: sectors.join(', ') }) : t('home.forYouEyebrowAny')}
          </p>
          <h2 className="mt-1 font-heading text-d-h3 text-text">{t('home.forYouTitle')}</h2>
        </div>
        <Link to="/challenges" className="inline-flex items-center gap-1 text-d-label text-primary hover:underline">
          {t('home.allChallenges')}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {challenges.status === 'loading'
          ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-[280px] rounded-card" />)
          : list.length === 0
            ? <p className="text-d-body text-muted md:col-span-2">{t('home.forYouEmpty')}</p>
            : list.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}
        {active && <LinkChallengeCard idea={active} />}
      </div>
    </section>
  )
}

/** "Your idea could also fit …": one tap copies the answers into a new challenge draft. */
function LinkChallengeCard({ idea }: { idea: IdeaItem }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const [match, setMatch] = useState<ChallengeMatch | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    innovatorService
      .challengeMatches(idea.id)
      .then((result) => alive && setMatch(result.results.find((m) => m.can_enter) ?? null))
      .catch(() => alive && setMatch(null))
    return () => {
      alive = false
    }
  }, [idea.id])

  if (!match) return null

  async function link() {
    if (!match) return
    setBusy(true)
    try {
      const result = await innovatorService.linkChallenge(idea.id, match.id)
      toast.show({ tone: 'success', title: t('home.linkDone') })
      const first = result.unanswered_questions[0]
      navigate(`/my-ideas/draft/${result.draft.id}${first ? `?step=${encodeURIComponent(first.section_code)}` : ''}`)
    } catch (error) {
      toast.show({ tone: 'error', title: parseApiError(error, t('common.somethingWrong')) })
    } finally {
      setBusy(false)
    }
  }

  const left = match.questions_left
  return (
    <Card tone="soft" padding="lg" className="flex flex-col">
      <Sparkles size={24} aria-hidden className="text-accent" />
      <h3 className="mt-3 font-heading text-d-h5 text-text">{t('home.linkTitle', { idea: idea.title, challenge: match.title })}</h3>
      <p className="mt-2 text-d-body-s text-muted">
        {left === 0 ? t('home.linkBodyNone') : left === 1 ? t('home.linkBodyOne') : t('home.linkBody', { count: left })}
      </p>
      <Button className="mt-5 self-start" size="sm" onClick={link} loading={busy}>
        {t('home.linkButton')}
      </Button>
    </Card>
  )
}

const UPDATE_ICON: Record<string, typeof Bell> = {
  officer_message: MessageCircle,
  status_change: CheckCircle2,
  stage_change: CheckCircle2,
  new_challenge: Trophy,
  deadline: Trophy,
  news: Megaphone,
  digest: Megaphone,
}

function UpdatesList({ state, onRetry }: { state: Async<{ results: UpdateItem[] }>; onRetry: () => void }) {
  const { t, lang } = useI18n()
  if (state.status === 'error') return <ErrorState title={t('home.updatesError')} onRetry={onRetry} />
  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[66px] rounded-control" />)}
      </div>
    )
  }
  const items = state.data.results.slice(0, 5)
  if (items.length === 0) return <p className="text-d-body text-muted">{t('home.updatesEmpty')}</p>
  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {items.map((item) => {
        const Icon = UPDATE_ICON[item.notification_type] ?? Bell
        const unread = item.type === 'notification' && !item.is_read
        const href = item.link?.type === 'idea' && item.link.id ? `/my-ideas/${item.link.id}` : null
        const content = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-muted">
              <Icon size={18} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-d-body-s text-text">
                {item.type === 'status_change' ? `${item.title}: ${item.status}` : item.title}
              </span>
              <span className="block text-d-cap text-muted">{relativeTime(item.at, t, lang)}</span>
            </span>
            {unread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary">
                <span className="sr-only">{t('notif.unread')}</span>
              </span>
            )}
          </>
        )
        return (
          <li key={`${item.type}-${item.id}`}>
            {href ? (
              <Link to={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface2">{content}</Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3.5">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ProfileCard({ profile }: { profile: ProfileCompleteness }) {
  const { t } = useI18n()
  const fields = profile.missing_fields.slice(0, 2).map((f) => f.label.toLowerCase()).join(', ')
  return (
    <Card padding="lg" className="self-start">
      <h3 className="font-heading text-d-h5 text-text">{t('home.profileTitle', { percent: profile.percent_complete })}</h3>
      <span aria-hidden className="mt-3 block h-2 overflow-hidden rounded-full bg-border">
        <span className="block h-full bg-success" style={{ width: `${profile.percent_complete}%` }} />
      </span>
      {fields && <p className="mt-3 text-d-body-s text-muted">{t('home.profileBody', { fields })}</p>}
      <Link to="/profile" className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-4' })}>
        {t('home.profileButton')}
      </Link>
    </Card>
  )
}
