import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, List, ShieldAlert } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import DataTable from '../../components/ui/DataTable'
import StatusPill from '../../components/ui/StatusPill'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import { useT } from '../../i18n/context'
import { judgingList, judgingSummary } from '../../lib/api/ideas'
import { EMPTY_CELL } from '../../lib/format'
import { DeclareConflict } from './DeclareConflict'

// 3.17 A judge's assignments (Figma 104:877 website, 104:1293 phone). ① Progress and the deadline. ② Conflicts of
// interest are declared before an idea opens (the "No conflict" tick is on 3.18). ③ The shared table; "Score"
// opens 3.18. Only ideas assigned to this judge, never other judges' names. Phone: cards (DataTable).

const dayOf = (v) => (v ? new Date(v).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' }) : '')

export default function Judging() {
  const t = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const reviewRef = useRef(null)
  const [reviewing, setReviewing] = useState(false)
  const [declaring, setDeclaring] = useState(null)

  const list = useQuery({ queryKey: ['ideas', 'judging'], queryFn: judgingList })
  const rows = useMemo(() => list.data ?? [], [list.data])
  const summary = useQuery({ queryKey: ['ideas', 'judging', 'summary'], queryFn: judgingSummary })

  useEffect(() => {
    document.title = `${t('judging.title')} · CEDA Innovation`
  }, [t])

  const s = summary.data
  const due = s?.due_at ? new Date(s.due_at) : null
  const daysLeft = due ? Math.max(0, Math.ceil((due.getTime() - Date.now()) / 864e5)) : null
  const programs = useMemo(() => [...new Set(rows.map((r) => r.program?.title).filter(Boolean))], [rows])
  const open = rows.filter((r) => r.status !== 'completed' && r.conflict !== 'declared')

  const columns = [
    {
      key: 'title',
      label: t('ideas.col.idea'),
      render: (_, r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold text-text">{r.title}</span>
          <span className="text-[12px] text-muted">{r.reference}</span>
        </span>
      ),
    },
    { key: 'program', label: t('ideas.col.challenge'), render: (v) => v?.title ?? EMPTY_CELL },
    { key: 'due_at', label: t('judging.col.due'), sortable: true, width: 110, render: (v) => dayOf(v) || EMPTY_CELL },
    { key: 'status', label: t('ideas.col.status'), width: 130, render: (v) => <StatusPill status={v} /> },
    { key: 'my_score', label: t('judging.col.yourScore'), width: 100, render: (v) => (v == null ? EMPTY_CELL : <span className="font-bold tabular-nums">{Math.round(v)}</span>) },
    {
      key: 'action',
      label: '',
      width: 100,
      align: 'right',
      render: (_, r) =>
        r.conflict === 'declared' ? (
          <span className="text-[12px] text-muted">{t('judging.conflictDeclared')}</span>
        ) : r.status === 'completed' ? (
          <Link to={`/judging/${r.id}`} className="text-[13px] font-bold text-primary hover:underline">{t('judging.view')}</Link>
        ) : (
          <Link to={`/judging/${r.id}`} className={buttonClasses({ size: 'sm' })}>{t('judging.score')}</Link>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('judging.crumb')}</span>}
        title={t('judging.title')}
        subtitle={[programs.join(', '), due ? t('judging.dueOn', { date: dayOf(due) }) : null].filter(Boolean).join(' · ') || undefined}
      />

      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
        <StatCard
          title={t('judging.assigned')}
          value={list.isSuccess ? rows.length : EMPTY_CELL}
          icon={List}
          color="indigo"
          subtitle={s?.programs ? t('judging.fromChallenges', { n: s.programs }) : undefined}
          loading={list.isLoading}
        />
        <StatCard
          title={t('judging.scored')}
          value={s ? s.scored : EMPTY_CELL}
          icon={Check}
          color="green"
          subtitle={s && s.assigned ? t('judging.percentDone', { n: Math.round((s.scored / s.assigned) * 100) }) : undefined}
          loading={list.isLoading || summary.isLoading}
        />
        <StatCard
          title={t('judging.untilDue')}
          value={daysLeft == null ? EMPTY_CELL : t('judging.days', { n: daysLeft })}
          icon={Clock}
          color="gold"
          subtitle={due ? due.toLocaleString('en-BW', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : undefined}
          loading={list.isLoading || summary.isLoading}
        />
      </div>

      {open.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-warning-soft px-4 py-3">
          <ShieldAlert size={20} aria-hidden className="shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-text">{t('judging.conflictTitle')}</p>
            <p className="text-[13px] text-text">{t('judging.conflictBody')}</p>
          </div>
          <Button ref={reviewRef} variant="secondary" size="sm" onClick={() => setReviewing(true)}>{t('judging.reviewList')}</Button>
        </div>
      )}

      <DataTable
        caption={t('judging.title')}
        columns={columns}
        data={rows}
        loading={list.isLoading}
        error={list.isError ? list.error : null}
        onRetry={() => list.refetch()}
        onRowClick={(r) => r.conflict !== 'declared' && navigate(`/judging/${r.id}`)}
        pageSize={20}
        emptyTitle={t('judging.empty')}
        emptyMessage={t('judging.emptyBody')}
      />

      <Modal
        open={reviewing}
        onClose={() => setReviewing(false)}
        triggerRef={reviewRef}
        title={t('judging.reviewTitle')}
        description={t('judging.reviewHint')}
        footer={<Button onClick={() => setReviewing(false)}>{t('common.close')}</Button>}
      >
        <ul className="flex flex-col divide-y divide-border">
          {open.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-text">{r.title}</span>
                <span className="block text-[12px] text-muted">{r.reference}</span>
              </span>
              <Button variant="link" size="sm" onClick={() => setDeclaring(r)}>{t('judging.declare')}</Button>
            </li>
          ))}
        </ul>
      </Modal>

      <DeclareConflict
        idea={declaring}
        onClose={() => setDeclaring(null)}
        onDone={() => {
          setDeclaring(null)
          qc.invalidateQueries({ queryKey: ['ideas', 'judging'] })
        }}
      />
    </div>
  )
}
