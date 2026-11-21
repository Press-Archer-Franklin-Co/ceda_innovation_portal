import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Eye, MessageCircle, Star, Users } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import Tag from '../../components/ui/Tag'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import { AssignIdeas } from '../../components/ideas/IdeaActionDialogs'
import ChannelLabel from '../../components/ideas/ChannelLabel'
import { useT } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { myWork } from '../../lib/api/ideas'
import { EMPTY_CELL } from '../../lib/format'

// 3.20 My work (Figma 105:1312 website, 105:1547 phone). One to-do list for staff. ① Grouped by when it is due,
// overdue first. ② An icon for each kind of task. ③ A task opens on the right with the one action that finishes
// it. Tasks come from workflows and from managers assigning work. Replaces My tasks and My assignments.

const TABS = ['open', 'done_week', 'assigned_by_me']
const ICONS = { review: Eye, quick_check: Eye, reply: MessageCircle, approve: Check, score: Star, invite: Users }
const GROUPS = ['overdue', 'today', 'week', 'later', 'none']
// R-42: why is { kind: person | workflow | applicant | invite, name }.
const WHY = { person: 'work.why.person', workflow: 'work.why.workflow', applicant: 'work.why.applicant', invite: 'work.why.invite' }

function groupOf(item, now = new Date()) {
  if (!item.due_at) return 'none'
  const due = new Date(item.due_at)
  if (item.overdue || due < now) return 'overdue'
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  if (due <= end) return 'today'
  return due.getTime() - now.getTime() < 7 * 864e5 ? 'week' : 'later'
}

const dueWords = (item, t) => {
  if (!item.due_at) return null
  const due = new Date(item.due_at)
  const day = due.toLocaleDateString('en-BW', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = due.toLocaleTimeString('en-BW', { hour: '2-digit', minute: '2-digit' })
  return t('work.due', { when: `${day}, ${time}` })
}

function Detail({ item, onReassign, reassignRef }) {
  const t = useT()
  const { can } = useAuth()
  const s = item.submission
  const sent = s?.sent_at ? new Date(s.sent_at).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' }) : null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.overdue && <Tag tone="red">{t('work.overdue')}</Tag>}
        <span className="text-[13px] text-muted">{t(`work.kind.${item.kind}`)}</span>
      </div>
      <h2 className="font-heading text-[20px] font-bold text-text">{s?.title ?? item.title}</h2>
      {s && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
          {[s.innovator?.name ?? s.innovator, s.program?.title ?? s.program, sent ? t('work.sent', { date: sent }) : null].filter(Boolean).join(' · ')}
          {s.channel && <><span aria-hidden>·</span><ChannelLabel channel={s.channel} /></>}
        </p>
      )}
      <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-3 text-[14px]">
        <dt className="text-muted">{t('work.whyYou')}</dt>
        <dd className="text-text">{item.why?.name && WHY[item.why.kind] ? t(WHY[item.why.kind], { name: item.why.name }) : EMPTY_CELL}</dd>
        <dt className="text-muted">{t('work.step')}</dt>
        <dd className="text-text">{item.step ? (item.step.number ? t('work.stepOf', { name: item.step.name, n: item.step.number, total: item.step.of }) : item.step.name) : EMPTY_CELL}</dd>
        <dt className="text-muted">{t('work.dueLabel')}</dt>
        <dd className={cn('text-text', item.overdue && 'font-bold text-danger')}>{item.due_at ? new Date(item.due_at).toLocaleString('en-BW', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : EMPTY_CELL}</dd>
      </dl>
      {s?.one_line && (
        <div className="rounded-control bg-surface2 px-4 py-3">
          <p className="text-[12px] font-bold text-muted">{t('work.oneLine')}</p>
          <p className="mt-1 text-[14px] text-text">{s.one_line}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {item.link && (
          <Link to={item.link} className={buttonClasses({ className: 'flex-1' })}>
            {item.kind === 'score' ? t('work.openScore') : t('work.openIdea')}
          </Link>
        )}
        {item.assignment_id && s?.id && can('entries.assign') && (
          <Button ref={reassignRef} variant="secondary" onClick={onReassign}>{t('work.reassign')}</Button>
        )}
      </div>
    </div>
  )
}

export default function MyWork() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const reassignRef = useRef(null)
  const [reassigning, setReassigning] = useState(false)
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'open'
  const work = useQuery({ queryKey: ['ideas', 'my-work', tab], queryFn: () => myWork(tab) })
  const items = work.data?.items ?? []
  const counts = work.data?.counts ?? {}
  const selectedId = params.get('item')
  const selected = items.find((i) => String(i.id) === selectedId) ?? (isDesktop ? items[0] : null)

  useEffect(() => {
    document.title = `${t('work.title')} · CEDA Innovation`
  }, [t])

  const set = (patch) => setParams((p) => {
    const n = new URLSearchParams(p)
    for (const [k, v] of Object.entries(patch)) if (v) n.set(k, v); else n.delete(k)
    return n
  }, { replace: true })

  const groups = GROUPS.map((g) => ({ key: g, items: items.filter((i) => groupOf(i) === g) })).filter((g) => g.items.length)

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader back={<span className="text-[12px] text-muted">{t('work.crumb')}</span>} title={t('work.title')} subtitle={t('work.subtitle')} />

      <Tabs
        variant="segment"
        label={t('work.title')}
        idPrefix="work"
        tabs={TABS.map((k) => ({ key: k, label: t(`work.tab.${k}`), count: counts[k] ?? undefined }))}
        active={tab}
        onChange={(k) => set({ tab: k === 'open' ? '' : k, item: '' })}
      />

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[minmax(0,1fr)_400px] 2xl:gap-[22px]">
        <div className="flex min-w-0 flex-col gap-4">
          {work.isLoading ? (
            <div aria-hidden className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-card" />)}</div>
          ) : work.isError ? (
            <ErrorState framed title={t('work.loadError')} message={work.error?.message} onRetry={work.refetch} retrying={work.isFetching} />
          ) : items.length === 0 ? (
            <EmptyState framed title={t(`work.empty.${tab}`)} message={tab === 'open' ? t('work.emptyBody') : undefined} />
          ) : (
            groups.map((g) => (
              <section key={g.key} aria-labelledby={`work-${g.key}`} className="flex flex-col gap-2">
                <h2 id={`work-${g.key}`} className={cn('text-[11px] font-bold uppercase tracking-[0.08em]', g.key === 'overdue' ? 'text-danger' : 'text-muted')}>
                  {t(`work.group.${g.key}`)}
                </h2>
                <ul className="flex flex-col gap-2">
                  {g.items.map((item) => {
                    const Icon = ICONS[item.kind] ?? Eye
                    const on = selected?.id === item.id
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => set({ item: String(item.id) })}
                          aria-current={on || undefined}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-card border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            on ? 'border-primary' : 'border-border',
                            item.overdue && 'bg-primary-soft',
                          )}
                        >
                          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface2 text-text">
                            <Icon size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-bold text-text">{t(`work.task.${item.kind}`, { title: item.title })}</span>
                            <span className={cn('block truncate text-[12px]', item.overdue ? 'text-danger' : 'text-muted')}>
                              {[item.context, dueWords(item, t)].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {isDesktop && selected && (
          <aside aria-label={t('work.detail')} className="self-start rounded-card border border-border bg-surface p-5 lg:sticky lg:top-4">
            <Detail item={selected} onReassign={() => setReassigning(true)} reassignRef={reassignRef} />
          </aside>
        )}
      </div>

      {!isDesktop && (
        <Modal open={Boolean(selected)} onClose={() => set({ item: '' })} title={selected ? t(`work.kind.${selected.kind}`) : ''}>
          {selected && <Detail item={selected} onReassign={() => setReassigning(true)} reassignRef={reassignRef} />}
        </Modal>
      )}

      {selected?.submission?.id && (
        <AssignIdeas
          open={reassigning}
          onClose={() => setReassigning(false)}
          triggerRef={reassignRef}
          ids={[selected.submission.id]}
          assignmentId={selected.assignment_id}
          roleType={selected.kind === 'score' ? 'judge' : 'reviewer'}
          onDone={() => set({ item: '' })}
        />
      )}
    </div>
  )
}
