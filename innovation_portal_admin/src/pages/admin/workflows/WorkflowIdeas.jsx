import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import SectionCard from '../../../components/ui/SectionCard'
import StatusPill from '../../../components/ui/StatusPill'
import Tag from '../../../components/ui/Tag'
import Skeleton from '../../../components/ui/Skeleton'
import EmptyState from '../../../components/ui/EmptyState'
import ErrorState from '../../../components/ui/ErrorState'
import { useT } from '../../../i18n/context'
import { client } from '../../../lib/api/client'
import { cn } from '../../../lib/cn'
import { useMediaQuery } from '../../../lib/useMediaQuery'
import { useWorkflowDefinition } from '../../../lib/queries/workflowBuilder'

// 3.22 Ideas in this workflow (Figma 136:1615 website, 136:1841 phone). ① Average days waiting per step (amber when
// over the step's time limit). ② One column per step with its count; each card shows the idea, owner and days
// waiting, overdue in amber. ③ A card opens 3.16; "Table" is the submissions list for this challenge, for bulk
// actions. Phone: steps as tabs. Data: GET /api/workflow-definitions/{id}/board/ (R-48 item 6).

function WaitBars({ rows, limits }) {
  const t = useT()
  const max = Math.max(1, ...rows.map((r) => r.days ?? 0))
  return (
    <SectionCard title={t('wfi.waitTitle')} subtitle={t('wfi.waitHint')}>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const over = limits?.[r.step] != null && r.days > limits[r.step]
          return (
            <li key={r.step} className="grid grid-cols-[minmax(0,140px)_1fr_40px] items-center gap-3 text-[14px]">
              <span className="truncate text-text">{r.step_name ?? r.step}</span>
              <span className="h-2 rounded-full bg-surface2" aria-hidden>
                <span className={cn('block h-2 rounded-full', over ? 'bg-warning' : 'bg-primary')} style={{ width: `${((r.days ?? 0) / max) * 100}%` }} />
              </span>
              <span className={cn('text-right font-bold tabular-nums', over ? 'text-warning' : 'text-text')}>{Math.round(r.days ?? 0)}</span>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

function IdeaCard({ item }) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/submissions/${item.submission_id}`)}
        className={cn(
          'flex w-full flex-col gap-1 rounded-card border bg-surface px-3 py-2.5 text-left hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          item.overdue ? 'border-warning' : 'border-border',
        )}
      >
        <span className="text-[14px] font-bold text-text">{item.title}</span>
        <span className="flex items-center justify-between gap-2 text-[12px] text-muted">
          <span className="truncate">{item.owner}</span>
          {item.status ? <StatusPill status={item.status} /> : <Tag tone={item.overdue ? 'amber' : 'neutral'}>{t('wfi.days', { n: item.days_waiting ?? 0 })}</Tag>}
        </span>
      </button>
    </li>
  )
}

export default function WorkflowIdeas() {
  const { id } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const wf = useWorkflowDefinition(id)
  const board = useQuery({ queryKey: ['workflow-definitions', id, 'board'], queryFn: () => client.get(`/api/workflow-definitions/${id}/board/`), retry: false })
  const [phoneStep, setPhoneStep] = useState(null)

  useEffect(() => {
    document.title = `${t('wfi.title')} · CEDA Innovation`
  }, [t])

  const b = board.data
  const columns = b ? [...(b.columns ?? []), ...(b.done ? [{ step: 'done', step_name: t('wfi.done'), count: b.done.count, items: (b.done.items ?? []).map((i) => ({ ...i, status: i.status ?? 'approved' })) }] : [])] : []
  const program = wf.data?.program
  const activeStep = phoneStep ?? columns[0]?.step

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={
          <span className="text-[12px] text-muted">
            <Link to="/admin/workflows" className="hover:text-text hover:underline">{t('wfl.title')}</Link>
            {wf.data?.name ? <> / <Link to={`/admin/workflows/${id}/builder`} className="hover:text-text hover:underline">{wf.data.name}</Link></> : null}
          </span>
        }
        title={t('wfi.title')}
        subtitle={t('wfi.subtitle')}
        actions={
          <Tabs
            variant="segment"
            label={t('wfi.view')}
            idPrefix="wfi"
            tabs={[{ key: 'board', label: t('wfi.board') }, { key: 'table', label: t('wfi.table') }]}
            active="board"
            onChange={(k) => k === 'table' && navigate(program ? `/submissions?program=${program}` : '/submissions')}
          />
        }
      />

      {board.isLoading ? (
        <div aria-hidden className="flex flex-col gap-3"><Skeleton className="h-40 rounded-card" /><Skeleton className="h-72 rounded-card" /></div>
      ) : board.isError ? (
        board.error?.status === 404 || board.error?.status === 405 ? (
          // TODO(R-48): the board endpoint. Until it lands, say so and offer the list.
          <EmptyState framed title={t('wfi.notYet')} message={t('wfi.notYetBody')} action={<Link to={program ? `/submissions?program=${program}` : '/submissions'} className="text-[13px] font-bold text-primary hover:underline">{t('wfi.openList')}</Link>} />
        ) : (
          <ErrorState framed title={t('wfi.loadError')} message={board.error?.message} onRetry={board.refetch} />
        )
      ) : (
        <>
          {b.average_days_waiting?.length > 0 && <WaitBars rows={b.average_days_waiting} limits={b.time_limit_days} />}
          {columns.length === 0 ? (
            <EmptyState framed title={t('wfi.empty')} message={t('wfi.emptyBody')} />
          ) : isDesktop ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))` }}>
              {columns.map((c) => (
                <section key={c.step} aria-label={c.step_name ?? c.step} className="flex min-h-[320px] flex-col gap-2 rounded-card bg-surface2 p-2.5">
                  <h2 className="flex items-center justify-between px-1 text-[14px] font-bold text-text">
                    {c.step_name ?? c.step}
                    <span className="text-[13px] text-muted">{c.count}</span>
                  </h2>
                  <ul className="flex flex-col gap-2">{(c.items ?? []).map((item) => <IdeaCard key={item.submission_id} item={item} />)}</ul>
                </section>
              ))}
            </div>
          ) : (
            <>
              <Tabs
                label={t('wfi.steps')}
                idPrefix="wfi-step"
                tabs={columns.map((c) => ({ key: c.step, label: c.step_name ?? c.step, count: c.count }))}
                active={activeStep}
                onChange={setPhoneStep}
              />
              <ul className="flex flex-col gap-2">{(columns.find((c) => c.step === activeStep)?.items ?? []).map((item) => <IdeaCard key={item.submission_id} item={item} />)}</ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
