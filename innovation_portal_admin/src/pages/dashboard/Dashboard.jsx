import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Layers, ClipboardList, ListTodo, Award,
  ArrowRight, AlertCircle, CheckCircle2,
  AlertTriangle, Activity, Clock, Star,
  TrendingUp, Users, Zap, User,
} from 'lucide-react'
import PageHeader   from '../../components/ui/PageHeader'
import SectionCard  from '../../components/ui/SectionCard'
import StatCard     from '../../components/ui/StatCard'
import StatusPill   from '../../components/ui/StatusPill'
import DataTable    from '../../components/ui/DataTable'
import ErrorState   from '../../components/ui/ErrorState'
import { SkeletonStatCards, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { useAuth }  from '../../lib/auth/AuthContext'
import { useJudgeOnly } from '../../lib/auth/useJudgeOnly'
import {
  useOperationsDashboard,
  useReportsDashboard,
  useMyAssignments,
  useRecentSubmissions,
  useMyAssignedEvaluations,
} from '../../lib/queries/dashboard'
import { cn } from '../../lib/cn'


function todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function userInitials(user) {
  if (!user) return '?'
  const first = user.first_name?.[0] ?? ''
  const last  = user.last_name?.[0]  ?? ''
  return (first + last).toUpperCase() || (user.username?.[0] ?? '?').toUpperCase()
}

function userRoleLabel(user) {
  const roles = user?.roles ?? []
  if (user?.is_superuser) return 'Super Admin'
  if (roles.includes('administrator'))        return 'Administrator'
  if (roles.includes('innovation_officer'))   return 'Innovation Officer'
  if (roles.includes('judge'))                return 'Judge'
  if (roles.includes('mentor'))               return 'Mentor'
  if (roles.includes('innovator'))            return 'Innovator'
  return 'Staff'
}


const SUBMISSION_COLS = [
  { key: 'reference_number', label: 'Ref #', width: 110, sortable: true },
  {
    key: 'title', label: 'Submission', sortable: true,
    render: (v, row) => (
      <div className="min-w-0">
        <p className="text-sm font-medium text-ceda-dark truncate">{v}</p>
        <p className="text-xs text-ceda-muted truncate">
          {row.program_detail?.title ?? '—'}
        </p>
      </div>
    ),
  },
  {
    key: 'innovator_detail', label: 'Innovator',
    render: (v, row) => {
      const name  = v?.full_name ?? row.innovator_name ?? null
      const email = v?.email ?? null
      return name ? (
        <div className="min-w-0">
          <p className="text-sm text-ceda-dark truncate">{name}</p>
          {email && <p className="text-xs text-ceda-muted truncate">{email}</p>}
        </div>
      ) : <span className="text-xs text-ceda-muted">—</span>
    },
  },
  {
    key: 'current_status', label: 'Status', width: 130,
    render: (v) => <StatusPill status={v} />,
  },
  {
    key: 'submitted_at', label: 'Submitted', width: 100,
    render: (v) => v
      ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '—',
  },
]


function AssignmentRow({ item }) {
  const navigate  = useNavigate()
  const isOverdue = item.status === 'overdue'
  const dueLabel  = item.deadline
    ? new Date(item.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null

  const title = item.submission_title ?? null
  const ref   = item.submission_reference_number ?? null

  return (
    <div
      onClick={() => navigate(`/submissions/${item.submission}`)}
      className={cn(
        'flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors border-b border-ceda-border/50 last:border-0',
        'hover:bg-ceda-surface',
        isOverdue && 'bg-red-50/60'
      )}
    >
      <div className={cn(
        'w-1.5 h-1.5 rounded-full flex-shrink-0',
        item.status === 'in_progress' ? 'bg-ceda-indigo' :
        item.status === 'assigned'    ? 'bg-ceda-green'  :
        isOverdue                     ? 'bg-ceda-red'    :
        'bg-ceda-gold'
      )} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ceda-dark truncate">
          {title ?? item.role_type ?? 'Review'}
        </p>
        <p className="text-xs text-ceda-muted truncate">
          {[item.role_type, ref].filter(Boolean).join(' · ')}
          {dueLabel && (
            <span className={cn('ml-1.5', isOverdue ? 'text-ceda-red font-medium' : '')}>
              {isOverdue ? '⚠ Overdue · ' : '· Due '}
              {dueLabel}
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusPill status={item.status} />
        <ArrowRight size={12} className="text-ceda-muted" />
      </div>
    </div>
  )
}


function PriorityBanner({ overdue, pending }) {
  if (!overdue && !pending) return null

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-lg border text-sm mb-5',
      overdue > 0
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-ceda-gold-pale border-ceda-gold/25 text-amber-800'
    )}>
      <AlertTriangle size={15} className="flex-shrink-0" />
      <span>
        {overdue > 0
          ? <><strong>{overdue} overdue {overdue === 1 ? 'assignment' : 'assignments'}</strong> — immediate action required.</>
          : <><strong>{pending} pending {pending === 1 ? 'action' : 'actions'}</strong> awaiting your review.</>
        }
      </span>
      <Link to="/assignments" className="ml-auto text-xs font-semibold underline underline-offset-2 whitespace-nowrap">
        View queue →
      </Link>
    </div>
  )
}


function UserContextCard({ user }) {
  const initials  = userInitials(user)
  const roleLabel = userRoleLabel(user)
  const name      = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Staff'

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-ceda-border bg-white">
      <div className="w-10 h-10 rounded-full bg-ceda-forest text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ceda-dark truncate">{name}</p>
        <p className="text-xs text-ceda-muted truncate">{user?.email ?? ''}</p>
      </div>
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ceda-green-pale text-ceda-forest border border-ceda-green/20 flex-shrink-0">
        {roleLabel}
      </span>
    </div>
  )
}


function JudgeDashboard({ user }) {
  const navigate  = useNavigate()
  const firstName = user?.first_name ?? user?.username ?? 'Judge'

  const { data: assignments, isLoading: assignLoading, error: assignError, refetch: refetchAssign } = useMyAssignments()
  const { data: evaluations, isLoading: evalLoading,   error: evalError,   refetch: refetchEval }   = useMyAssignedEvaluations()

  const assignmentList    = Array.isArray(assignments) ? assignments : []
  const evaluationList    = Array.isArray(evaluations) ? evaluations : (evaluations?.results ?? [])
  const activeAssignments = assignmentList.filter(a => a.status === 'assigned' || a.status === 'accepted').slice(0, 6)
  const overdueCount      = assignmentList.filter(a => (a.status === 'assigned' || a.status === 'accepted') && a.deadline && new Date(a.deadline) < new Date()).length
  const pendingCount      = assignmentList.filter(a => a.status === 'assigned').length
  const pendingEvals      = evaluationList.filter(e => e.status !== 'completed' && e.status !== 'submitted')

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="My Dashboard"
        subtitle={`${firstName} · ${todayLabel()}`}
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-ceda-border bg-white text-xs text-ceda-muted font-mono">
            <Activity size={11} className="text-ceda-green" />
            Live
          </div>
        }
      />

      <div className="mb-5">
        <UserContextCard user={user} />
      </div>

      {!assignLoading && !assignError && (
        <PriorityBanner overdue={overdueCount} pending={pendingCount} />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard
          title="My Assignments"
          value={activeAssignments.length}
          icon={ListTodo}
          color="indigo"
          subtitle="Active items"
        />
        <StatCard
          title="Pending Review"
          value={pendingCount}
          icon={Clock}
          color="gold"
          subtitle="Awaiting action"
        />
        <StatCard
          title="Evaluations"
          value={pendingEvals.length}
          icon={Star}
          color="forest"
          subtitle="To score"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SectionCard
            title="My Assignment Queue"
            subtitle="Active reviewer items requiring action"
            padding={false}
            actions={
              <Link to="/assignments" className="btn-ghost btn-sm flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            }
          >
            {assignLoading ? (
              <SkeletonTable rows={4} cols={3} />
            ) : assignError ? (
              <ErrorState message={assignError.message} onRetry={refetchAssign} />
            ) : activeAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="w-10 h-10 rounded-full bg-ceda-green-pale border border-ceda-green/20 flex items-center justify-center mb-3">
                  <CheckCircle2 size={18} className="text-ceda-green" />
                </div>
                <p className="text-sm font-semibold text-ceda-dark">Queue clear</p>
                <p className="text-xs text-ceda-muted mt-0.5">No active assignments at this time.</p>
              </div>
            ) : (
              activeAssignments.map(item => (
                <AssignmentRow key={item.id} item={item} />
              ))
            )}
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Quick Access">
            <div className="space-y-1">
              {[
                { label: 'My Work',     to: '/assignments', icon: ListTodo, description: 'Assignments & evaluations' },
                { label: 'Evaluations', to: '/evaluations', icon: Award,   description: 'Score submissions' },
              ].map(({ label, to, icon: Icon, description }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ceda-surface transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-ceda-surface border border-ceda-border flex items-center justify-center flex-shrink-0 group-hover:border-ceda-green/30 transition-colors">
                    <Icon size={13} className="text-ceda-muted group-hover:text-ceda-forest transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ceda-dark leading-none">{label}</p>
                    <p className="text-xs text-ceda-muted mt-0.5">{description}</p>
                  </div>
                  <ArrowRight size={12} className="text-ceda-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}


function OfficerDashboard({ user }) {
  const navigate    = useNavigate()
  const firstName   = user?.first_name ?? user?.username ?? 'Staff'
  const { can }     = useAuth()
  const adminMode   = can('entries.search') // sees every programme. TODO(R-25)
  const canEvaluate = can('entries.score')  // TODO(R-25)

  const {
    data: opsData,
    isLoading: opsLoading,
    error: opsError,
  } = useOperationsDashboard()

  const {
    data: reportData,
    isLoading: reportLoading,
    error: reportError,
    refetch: refetchReport,
  } = useReportsDashboard()

  const {
    data: assignments,
    isLoading: assignLoading,
    error: assignError,
    refetch: refetchAssign,
  } = useMyAssignments()

  const {
    data: recentSubmissions,
    isLoading: subsLoading,
    error: subsError,
    refetch: refetchSubs,
  } = useRecentSubmissions({ ordering: '-submitted_at', page_size: 10 })

  const submissionsList   = Array.isArray(recentSubmissions)
    ? recentSubmissions
    : recentSubmissions?.results ?? []
  const assignmentList    = Array.isArray(assignments) ? assignments : []
  const activeAssignments = assignmentList.filter(a => a.status === 'assigned' || a.status === 'accepted').slice(0, 6)
  const overdueCount      = assignmentList.filter(a => (a.status === 'assigned' || a.status === 'accepted') && a.deadline && new Date(a.deadline) < new Date()).length
  const pendingCount      = assignmentList.filter(a => a.status === 'assigned').length

  const overdueAssignments = opsData?.overdue_assignments ?? opsData?.overdue_workflows ?? 0
  const stuckWorkflows     = opsData?.stuck_workflows ?? 0
  const avgHours           = opsData?.throughput?.average_completion_hours ?? null
  const avgLabel           = avgHours != null
    ? avgHours >= 24
      ? `${(avgHours / 24).toFixed(1)}d avg`
      : `${Math.round(avgHours)}h avg`
    : '—'

  const statsLoading = opsLoading || reportLoading
  const statusBreakdown = reportData?.submissions_by_status ?? []

  return (
    <div className="animate-fade-in">

      <PageHeader
        title="Operations Center"
        subtitle={`${firstName} · ${todayLabel()}`}
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-ceda-border bg-white text-xs text-ceda-muted font-mono">
            <Activity size={11} className="text-ceda-green" />
            Live
          </div>
        }
      />

      <div className="mb-5">
        <UserContextCard user={user} />
      </div>

      {!assignLoading && !assignError && (
        <PriorityBanner overdue={overdueCount} pending={pendingCount} />
      )}

      {statsLoading ? (
        <SkeletonStatCards count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatCard
            title="Total Submissions"
            value={reportData?.submissions_total ?? '—'}
            icon={ClipboardList}
            color="forest"
            subtitle={adminMode ? 'All programs' : 'Your programs'}
          />
          <StatCard
            title="Overdue Assignments"
            value={overdueAssignments}
            icon={AlertTriangle}
            color={overdueAssignments > 0 ? 'red' : 'gold'}
            subtitle="Require immediate action"
          />
          <StatCard
            title="Stuck Workflows"
            value={stuckWorkflows}
            icon={Zap}
            color={stuckWorkflows > 0 ? 'red' : 'indigo'}
            subtitle="Blocked or stalled"
          />
          <StatCard
            title="Avg Completion"
            value={avgLabel}
            icon={TrendingUp}
            color="green"
            subtitle="Processing time"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div className="lg:col-span-2">
          <SectionCard
            title="My Assignment Queue"
            subtitle="Active reviewer items requiring action"
            padding={false}
            actions={
              <Link to="/assignments" className="btn-ghost btn-sm flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            }
          >
            {assignLoading ? (
              <SkeletonTable rows={4} cols={3} />
            ) : assignError ? (
              <ErrorState message={assignError.message} onRetry={refetchAssign} />
            ) : activeAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="w-10 h-10 rounded-full bg-ceda-green-pale border border-ceda-green/20 flex items-center justify-center mb-3">
                  <CheckCircle2 size={18} className="text-ceda-green" />
                </div>
                <p className="text-sm font-semibold text-ceda-dark">Queue clear</p>
                <p className="text-xs text-ceda-muted mt-0.5">No active assignments at this time.</p>
              </div>
            ) : (
              activeAssignments.map(item => (
                <AssignmentRow key={item.id} item={item} />
              ))
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">

          <SectionCard title="Submission Pipeline" subtitle="Status breakdown">
            {reportLoading ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div className="w-2 h-2 rounded-full bg-ceda-border animate-pulse" />
                    <div className="flex-1 h-3 bg-ceda-border/60 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-ceda-border/60 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : reportError ? (
              <ErrorState message={reportError.message} onRetry={refetchReport} className="py-6" />
            ) : statusBreakdown.length > 0 ? (
              <div className="space-y-1">
                {statusBreakdown.slice(0, 6).map(item => {
                  const status = item.current_status ?? item.status ?? ''
                  const count  = item.total ?? item.count ?? 0
                  return (
                    <button
                      key={status}
                      onClick={() => navigate(`/submissions?status=${status}`)}
                      className="w-full flex items-center gap-3 px-1 py-2 rounded hover:bg-ceda-surface transition-colors text-left group"
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-ceda-indigo" />
                      <span className="flex-1 text-sm text-ceda-dark capitalize truncate">
                        {status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-bold text-ceda-dark tabular-nums">
                        {count}
                      </span>
                      <ArrowRight size={11} className="text-ceda-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-ceda-muted text-center py-6">No pipeline data available</p>
            )}
          </SectionCard>

          <SectionCard title="Quick Access">
            <div className="space-y-1">
              {[
                { label: 'Programs',        to: '/programs',    icon: Layers,        description: 'Manage programs' },
                { label: 'All Submissions', to: '/submissions', icon: ClipboardList, description: 'View & filter' },
                ...(canEvaluate ? [{ label: 'Evaluations', to: '/evaluations', icon: Award, description: 'Score submissions' }] : []),
                { label: 'My Work',         to: '/assignments', icon: ListTodo,      description: 'Assignments & tasks' },
              ].map(({ label, to, icon: Icon, description }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ceda-surface transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-ceda-surface border border-ceda-border flex items-center justify-center flex-shrink-0 group-hover:border-ceda-green/30 transition-colors">
                    <Icon size={13} className="text-ceda-muted group-hover:text-ceda-forest transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ceda-dark leading-none">{label}</p>
                    <p className="text-xs text-ceda-muted mt-0.5">{description}</p>
                  </div>
                  <ArrowRight size={12} className="text-ceda-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4">
        <SectionCard
          title="Recent Submissions"
          subtitle={adminMode ? 'Latest activity across all programs' : 'Latest activity on your programs'}
          padding={false}
          actions={
            <Link to="/submissions" className="btn-ghost btn-sm flex items-center gap-1">
              All submissions <ArrowRight size={12} />
            </Link>
          }
        >
          {subsLoading ? (
            <SkeletonTable rows={5} cols={5} />
          ) : subsError ? (
            <ErrorState message={subsError.message} onRetry={refetchSubs} />
          ) : (
            <DataTable
              columns={SUBMISSION_COLS}
              data={submissionsList}
              onRowClick={(row) => navigate(`/submissions/${row.id}`)}
              emptyTitle="No submissions yet"
              emptyMessage="Submissions will appear here once the program receives entries."
            />
          )}
        </SectionCard>
      </div>
    </div>
  )
}


export default function Dashboard() {
  const { user } = useAuth()
  const judgeOnly = useJudgeOnly()

  if (judgeOnly) return <JudgeDashboard user={user} />
  return <OfficerDashboard user={user} />
}
