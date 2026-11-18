import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListTodo, Clock, AlertCircle, CheckCircle2, Zap } from 'lucide-react'
import PageHeader  from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import DataTable   from '../../components/ui/DataTable'
import StatusPill  from '../../components/ui/StatusPill'
import StatCard    from '../../components/ui/StatCard'
import Tabs        from '../../components/ui/Tabs'
import ErrorState  from '../../components/ui/ErrorState'
import { SkeletonStatCards, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { useMyAssignments, useMyEvaluationAssignments } from '../../lib/queries/tasks'
import { cn } from '../../lib/cn'

const STATUS_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Pending' },
  { key: 'accepted',  label: 'Accepted' },
  { key: 'completed', label: 'Completed' },
]

const ROLE_LABELS = {
  reviewer:   'Review',
  evaluator:  'Evaluation',
  screener:   'Screening',
  panel:      'Panel',
}
const ROLE_COLORS = {
  reviewer:  'bg-ceda-indigo-pale text-ceda-indigo',
  evaluator: 'bg-ceda-gold-pale text-ceda-gold',
  screener:  'bg-ceda-green-pale text-ceda-green-muted',
  panel:     'bg-ceda-surface text-ceda-muted',
}

const COLUMNS = [
  {
    key: 'id', label: 'ID', width: 100,
    render: v => <span className="text-xs font-mono text-ceda-muted">{v?.slice(0, 8)}…</span>,
  },
  {
    key: 'submission', label: 'Submission', sortable: true,
    render: (v, row) => (
      <div className="min-w-0">
        <p className="text-xs font-mono font-medium text-ceda-dark truncate">
          {typeof v === 'string' ? v.slice(0, 8) + '…' : v}
        </p>
        <p className="text-xs text-ceda-muted">{row.role_type ?? '—'}</p>
      </div>
    ),
  },
  {
    key: 'role_type', label: 'Type', width: 120,
    render: v => (
      <span className={cn('badge', ROLE_COLORS[v] ?? ROLE_COLORS.panel)}>
        {ROLE_LABELS[v] ?? v ?? 'Assignment'}
      </span>
    ),
  },
  {
    key: 'deadline', label: 'Due', width: 100, sortable: true,
    render: v => v ? (
      <span className="text-sm text-ceda-muted">
        {new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </span>
    ) : <span className="text-ceda-muted text-sm">—</span>,
  },
  {
    key: 'status', label: 'Status', width: 120,
    render: v => <StatusPill status={v} />,
  },
]

export default function MyTasks() {
  const [tab, setTab] = useState('all')
  const navigate = useNavigate()

  const {
    data: assignmentsData,
    isLoading: assignLoading,
    error: assignError,
    refetch: refetchAssign,
  } = useMyAssignments()

  const {
    data: evalData,
    isLoading: evalLoading,
    error: evalError,
    refetch: refetchEval,
  } = useMyEvaluationAssignments()

  const isLoading = assignLoading

  const assignments = Array.isArray(assignmentsData) ? assignmentsData : assignmentsData?.results ?? []

  const evalItems = Array.isArray(evalData) ? evalData : evalData?.results ?? []

  const allTasks = assignments

  const filtered = allTasks.filter(t => {
    if (tab === 'pending')   return t.status === 'pending'
    if (tab === 'accepted')  return ['accepted', 'in_progress'].includes(t.status)
    if (tab === 'completed') return t.status === 'completed'
    return true
  })

  const stats = {
    total:     allTasks.filter(t => t.status !== 'completed').length,
    pending:   allTasks.filter(t => t.status === 'pending').length,
    accepted:  allTasks.filter(t => t.status === 'accepted').length,
    completed: allTasks.filter(t => t.status === 'completed').length,
  }

  const tabsWithCounts = STATUS_TABS.map(t => ({
    ...t,
    count: t.key === 'all'       ? allTasks.length
         : t.key === 'pending'   ? stats.pending
         : t.key === 'accepted'  ? stats.accepted
         : stats.completed,
  }))

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tasks"
        subtitle="Your assignment queue — reviews, evaluations, and screening tasks."
      />

      {isLoading ? (
        <SkeletonStatCards count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Open Tasks"  value={stats.total}     icon={ListTodo}      color="forest" />
          <StatCard title="Pending"     value={stats.pending}   icon={Clock}         color="indigo" />
          <StatCard title="Accepted"    value={stats.accepted}  icon={Zap}           color="gold" />
          <StatCard title="Completed"   value={stats.completed} icon={CheckCircle2}  color="green" />
        </div>
      )}

      <Tabs tabs={tabsWithCounts} active={tab} onChange={setTab} className="mb-0" />
      <SectionCard padding={false}>
        {isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : assignError ? (
          <ErrorState message={assignError.message} onRetry={refetchAssign} />
        ) : (
          <DataTable
            columns={COLUMNS}
            data={filtered}
            onRowClick={row => navigate(`/tasks/${row.id}`)}
            emptyTitle={
              tab === 'pending'   ? 'No pending tasks'
              : tab === 'accepted'  ? 'No accepted tasks'
              : tab === 'completed' ? 'No completed tasks yet'
              : 'No tasks found'
            }
            emptyMessage="Check back later or try a different filter."
            emptyIcon={tab === 'completed' ? CheckCircle2 : ListTodo}
          />
        )}
      </SectionCard>

      {!evalLoading && !evalError && evalItems.length > 0 && (
        <div className="mt-5">
          <SectionCard title="Evaluation Queue" subtitle="Submissions assigned to you for scoring">
            <DataTable
              columns={[
                { key: 'id', label: 'ID', width: 100, render: v => <span className="text-xs font-mono text-ceda-muted">{String(v).slice(0, 8)}…</span> },
                { key: 'submission', label: 'Submission', render: v => <span className="text-sm text-ceda-dark font-mono">{typeof v === 'string' ? v.slice(0, 8) + '…' : v}</span> },
                { key: 'status', label: 'Status', width: 120, render: v => <StatusPill status={v} /> },
              ]}
              data={evalItems}
              onRowClick={row => navigate(`/evaluations/${row.submission_id || row.submission}`)}
              emptyTitle="No evaluation assignments"
            />
          </SectionCard>
        </div>
      )}
    </div>
  )
}
