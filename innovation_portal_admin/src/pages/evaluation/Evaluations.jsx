import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, CheckCircle2, Clock } from 'lucide-react'
import PageHeader  from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import DataTable   from '../../components/ui/DataTable'
import StatusPill  from '../../components/ui/StatusPill'
import Tabs        from '../../components/ui/Tabs'
import ErrorState  from '../../components/ui/ErrorState'
import { SkeletonStatCards, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { useMyAssignedEvaluations } from '../../lib/queries/evaluations'
import { cn } from '../../lib/cn'

const COLUMNS = [
  {
    key: 'id', label: 'ID', width: 110,
    render: v => <span className="text-xs font-mono text-ceda-muted">{String(v).slice(0, 8)}…</span>,
  },
  {
    key: 'submission_title', label: 'Submission', sortable: true,
    render: (v, row) => (
      <div className="min-w-0">
        <p className="text-sm font-medium text-ceda-dark truncate">{v || row.reference_number || '—'}</p>
        <p className="text-xs text-ceda-muted truncate">{row.reference_number ?? row.workflow_step ?? '—'}</p>
      </div>
    ),
  },
  {
    key: 'status', label: 'Status', width: 120,
    render: v => <StatusPill status={v} />,
  },
  {
    key: 'deadline', label: 'Due', width: 100,
    render: v => v
      ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '—',
  },
]

const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'completed',label: 'Completed' },
]

export default function Evaluations() {
  const [tab, setTab] = useState('all')
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = useMyAssignedEvaluations()

  const items = Array.isArray(data) ? data : data?.results ?? []

  const filtered = items.filter(e => {
    if (tab === 'all')       return true
    if (tab === 'pending')   return e.status === 'pending'
    if (tab === 'accepted')  return ['accepted', 'in_progress'].includes(e.status)
    if (tab === 'completed') return e.status === 'completed'
    return true
  })

  const tabsWithCounts = TABS.map(t => ({
    ...t,
    count: t.key === 'all' ? items.length : items.filter(e => {
      if (t.key === 'pending')   return e.status === 'pending'
      if (t.key === 'accepted')  return ['accepted', 'in_progress'].includes(e.status)
      if (t.key === 'completed') return e.status === 'completed'
      return false
    }).length,
  }))

  const pendingCount   = items.filter(e => e.status === 'pending').length
  const completedCount = items.filter(e => e.status === 'completed').length

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="My Evaluations"
        subtitle="Submissions assigned to you for scoring and review."
      />

      {isLoading ? (
        <SkeletonStatCards count={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Assigned', value: items.length,   icon: Star,         color: 'text-ceda-forest' },
            { label: 'Pending',        value: pendingCount,   icon: Clock,        color: 'text-ceda-indigo' },
            { label: 'Completed',      value: completedCount, icon: CheckCircle2, color: 'text-ceda-green'  },
          ].map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-ceda-surface flex items-center justify-center flex-shrink-0">
                  <Icon size={17} className={s.color} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-xl font-bold text-ceda-dark leading-none">{s.value}</p>
                  <p className="text-xs text-ceda-muted mt-0.5">{s.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Tabs tabs={tabsWithCounts} active={tab} onChange={setTab} className="mb-0" />
      <SectionCard padding={false}>
        {isLoading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : error ? (
          <ErrorState
            message={error.message}
            onRetry={refetch}
          />
        ) : (
          <DataTable
            columns={COLUMNS}
            data={filtered}
            onRowClick={row => navigate(`/evaluations/${row.submission_id}`)}
            emptyTitle="No evaluations found"
            emptyMessage="Evaluations will appear here once submissions are assigned to you."
            emptyIcon={Star}
          />
        )}
      </SectionCard>
    </div>
  )
}
