import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import StepProgress from '../../components/ui/StepProgress'
import StatusPill from '../../components/ui/StatusPill'
import SectionCard from '../../components/ui/SectionCard'
import Avatar from '../../components/ui/Avatar'
import DropdownMenu from '../../components/ui/DropdownMenu'
import ErrorState from '../../components/ui/ErrorState'
import ForbiddenState from '../../components/ui/ForbiddenState'
import { DetailPageSkeleton } from '../../components/ui/PageSkeleton'
import { AssignIdeas, MoveIdeas } from '../../components/ideas/IdeaActionDialogs'
import { AnswersTab, DocumentsTab, HistoryTab, MessagesTab, NotesTab, RelatedTab } from '../../components/ideas/IdeaTabs'
import { useT, useI18n } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { staffSummary } from '../../lib/api/ideas'
import { EMPTY_CELL } from '../../lib/format'

// 3.16 One submission (Figma 103:843 website, 103:1112 phone). ① The stage bar; "Move to next stage" asks for
// a short reason the innovator sees. ② Tabs: Answers, Documents, Messages, Notes (staff only), History, Related.
// ③ Answers in the innovator's language with a switch. ④ AI hints show only when the AI helper is on; until the
// API says so (R-42, C3) they are not rendered. ⑤ The person card. Phone: tabs scroll, the main action sits at
// the bottom.

const TAB_KEYS = ['answers', 'documents', 'messages', 'notes', 'history', 'related']

const dateOf = (v) => (v ? new Date(v).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' }) : '')

function Fact({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-text">{children ?? EMPTY_CELL}</dd>
    </div>
  )
}

export default function SubmissionDetail() {
  const { id } = useParams()
  const t = useT()
  const { lang } = useI18n()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState(null)
  const moveRef = useRef(null)
  const assignRef = useRef(null)
  const askRef = useRef(null)

  const summary = useQuery({ queryKey: ['ideas', id, 'summary', lang], queryFn: () => staffSummary(id, lang) })
  const s = summary.data
  const tab = TAB_KEYS.includes(params.get('tab')) ? params.get('tab') : 'answers'
  const setTab = (key) => setParams((p) => { const n = new URLSearchParams(p); if (key === 'answers') n.delete('tab'); else n.set('tab', key); return n }, { replace: true })

  useEffect(() => {
    if (s?.title) document.title = `${s.title} · CEDA Innovation`
  }, [s?.title])

  if (summary.isLoading) return <DetailPageSkeleton />
  if (summary.isError) {
    if (summary.error?.status === 403) return <ForbiddenState framed title={t('access.noPageTitle')} message={t('access.noPageBody')} />
    return <ErrorState framed title={t('ideas.loadError')} message={summary.error?.status === 404 ? t('ideas.notFound') : summary.error?.message} onRetry={summary.refetch} retrying={summary.isFetching} />
  }

  const canMove = can('entries.assign') && (s.allowed_actions?.length ? s.allowed_actions.includes('approve') : true)
  const current = Math.max(0, s.steps.findIndex((st) => st.state === 'current'))
  const finished = s.steps.length > 0 && s.steps.every((st) => st.state === 'done')
  const counts = s.counts ?? {}
  const tabs = [
    { key: 'answers', label: t('ideas.tab.answers') },
    { key: 'documents', label: t('ideas.tab.documents'), count: counts.documents ?? undefined },
    { key: 'messages', label: t('ideas.tab.messages'), count: counts.messages ?? undefined },
    { key: 'notes', label: t('ideas.tab.notes'), count: counts.notes ?? undefined },
    { key: 'history', label: t('ideas.tab.history') },
    { key: 'related', label: t('ideas.tab.related'), count: counts.related ?? undefined },
  ]
  const sentFrom = s.channel ? t(`ideas.sentFrom.${s.channel}`, { date: dateOf(s.submitted_at) }) : t('ideas.sentOn', { date: dateOf(s.submitted_at) })
  const subtitle = [s.innovator?.name, s.program?.title, s.submitted_at ? sentFrom : null].filter(Boolean).join(' · ')

  function ask() {
    setTab('messages')
    setTimeout(() => askRef.current?.focus(), 50)
  }

  const moveButton = canMove && !finished && (
    <Button ref={moveRef} onClick={() => setDialog('move')}>
      {t('ideas.moveNext')}
      <ArrowRight size={16} aria-hidden />
    </Button>
  )

  return (
    <div className="flex flex-col gap-[14px] pb-20 lg:pb-0 2xl:gap-[22px]">
      <PageHeader
        back={
          <span className="text-[12px] text-muted">
            <Link to="/submissions" className="hover:text-text hover:underline">{t('ideas.list.title')}</Link> / {s.reference}
          </span>
        }
        title={s.title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={s.status} />
            <Button variant="secondary" onClick={ask}>{t('ideas.askMore')}</Button>
            <span className="hidden lg:inline-flex">{moveButton}</span>
            <DropdownMenu
              label={t('ideas.moreActions')}
              items={[
                { key: 'assign', label: t('ideas.assign'), onSelect: () => setDialog('assign'), hidden: !can('entries.assign') },
                { key: 'scores', label: t('ideas.allScores'), onSelect: () => navigate(`/submissions/${id}/scores`) },
                { key: 'notes', label: t('ideas.addNote'), onSelect: () => setTab('notes') },
              ]}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[minmax(0,1fr)_340px] 2xl:gap-[22px]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          {s.steps.length > 0 && <StepProgress steps={s.steps.map((st) => st.title)} current={finished ? s.steps.length : current} />}
          <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('ideas.tabsLabel')} idPrefix="idea" />
          <div role="tabpanel" id={`idea-panel-${tab}`} aria-labelledby={`idea-tab-${tab}`} className="min-w-0">
            {tab === 'answers' && <AnswersTab summary={s} />}
            {tab === 'documents' && <DocumentsTab id={id} />}
            {tab === 'messages' && <MessagesTab id={id} askRef={askRef} />}
            {tab === 'notes' && <NotesTab id={id} />}
            {tab === 'history' && <HistoryTab id={id} />}
            {tab === 'related' && <RelatedTab related={s.related} />}
          </div>
        </div>

        <aside className="flex flex-col gap-[14px]" aria-label={t('ideas.aboutIdea')}>
          <SectionCard
            title={t('ideas.innovator')}
            actions={<button type="button" onClick={ask} className="text-[13px] font-bold text-primary hover:underline">{t('ideas.message')}</button>}
          >
            <div className="flex items-center gap-3">
              <Avatar name={s.innovator?.name ?? ''} size="lg" decorative />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-text">{s.innovator?.name || EMPTY_CELL}</p>
                {(s.innovator?.district || s.innovator?.age) && (
                  <p className="text-[12px] text-muted">{[s.innovator.district?.name ?? s.innovator.district, s.innovator.age].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            </div>
            <dl className="mt-3 border-t border-border pt-2">
              <Fact label={t('ideas.phone')}>{s.innovator?.phone}</Fact>
              <Fact label={t('ideas.otherIdeas')}>
                {s.innovator?.other_ideas ? t('ideas.otherIdeasValue', { n: s.innovator.other_ideas.count, shortlisted: s.innovator.other_ideas.shortlisted }) : null}
              </Fact>
              <Fact label={t('ideas.language')}>{s.innovator?.language ? t(`ideas.lang.${s.innovator.language}`) : null}</Fact>
            </dl>
          </SectionCard>

          <SectionCard
            title={t('ideas.assignedTo')}
            actions={can('entries.assign') ? <button ref={assignRef} type="button" onClick={() => setDialog('assign')} className="text-[13px] font-bold text-primary hover:underline">{t('ideas.change')}</button> : null}
          >
            {s.assigned_to ? (
              <p className="flex items-center gap-2 text-[14px] text-text">
                <Avatar name={s.assigned_to.name} size="sm" decorative />
                {s.reply_due ? t('ideas.assignedDue', { name: s.assigned_to.name, date: dateOf(s.reply_due) }) : s.assigned_to.name}
              </p>
            ) : (
              <p className="text-[14px] text-muted">{t('ideas.notAssigned')}</p>
            )}
          </SectionCard>

          <SectionCard
            title={t('ideas.scoresSoFar')}
            actions={<Link to={`/submissions/${id}/scores`} className="text-[13px] font-bold text-primary hover:underline">{t('ideas.allScores')}</Link>}
          >
            {s.scores?.average != null ? (
              <p className="flex items-baseline gap-2">
                <span className="font-heading text-[36px] font-extrabold leading-none text-text">{Math.round(s.scores.average)}</span>
                <span className="text-[12px] text-muted">{t('ideas.scoreOf', { n: s.scores.judges_scored })}</span>
              </p>
            ) : (
              <p className="text-[14px] text-muted">
                {s.scores?.judges_assigned ? t('ideas.scoresWaiting', { done: s.scores.judges_scored ?? 0, n: s.scores.judges_assigned }) : t('ideas.noScores')}
              </p>
            )}
          </SectionCard>
        </aside>
      </div>

      {moveButton && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-end border-t border-border bg-bg px-4 py-3 lg:hidden">{moveButton}</div>
      )}

      <MoveIdeas open={dialog === 'move'} onClose={() => setDialog(null)} triggerRef={moveRef} ids={[id]} />
      <AssignIdeas open={dialog === 'assign'} onClose={() => setDialog(null)} triggerRef={assignRef} ids={[id]} />
    </div>
  )
}
