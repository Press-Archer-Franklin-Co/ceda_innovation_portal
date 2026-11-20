import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  AlertTriangle, Clock, Inbox, RefreshCw, Flame,
  History, GitBranch, Layers, CheckCircle2,
  Circle, X, ArrowRight, UserPlus,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  useMyAssignmentInstances,
  useReviewerQueue,
  useAcceptAssignment,
  useClaimSubmissionSlot,
} from '../../lib/queries/assignmentInstances'
import { useAuth }           from '../../lib/auth/AuthContext'
import { STAFF_WORKER_ROLES } from '../../lib/auth/roleNames'
import ErrorState            from '../../components/ui/ErrorState'
import { SkeletonCards }     from '../../components/ui/LoadingSkeleton'


function formatDate(iso) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso))
}

function deadlineState(item) {
  if (!item.deadline) return 'none'
  const diff = new Date(item.deadline) - new Date()
  if (diff < 0) return 'overdue'
  if (diff < 48 * 60 * 60 * 1000) return 'soon'
  return 'ok'
}


const BADGE = {
  overdue: {
    label: 'Overdue',
    icon:  Flame,
    cls:   'bg-red-100 text-red-700 border-red-200',
  },
  soon: {
    label: 'Due Soon',
    icon:  AlertTriangle,
    cls:   'bg-amber-100 text-amber-700 border-amber-200',
  },
  active: {
    label: 'In Progress',
    icon:  Clock,
    cls:   'bg-ceda-green-pale text-ceda-forest border-ceda-green/30',
  },
  available: {
    label: 'Available',
    icon:  Circle,
    cls:   'bg-blue-50 text-blue-700 border-blue-200',
  },
}

function StatusBadge({ variant }) {
  const { label, icon: Icon, cls } = BADGE[variant] ?? BADGE.active
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
      cls,
    )}>
      <Icon size={9} strokeWidth={2.5} />
      {label}
    </span>
  )
}


function RoleTag({ label }) {
  if (!label) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ceda-surface border border-ceda-border text-ceda-muted truncate max-w-[140px]">
      {label}
    </span>
  )
}


function TaskCard({ item, variant, action, onOpen, onClaim, onInvite, busy }) {
  const isBusy = busy === item.id

  const title   = item.submission_title ?? item.title ?? `Submission ${String(item.submission_id ?? item.id).slice(0, 8)}`
  const refNum  = item.submission_reference_number ?? item.reference_number
  const roleTag = item.node_name ?? item.workflow_step_name ?? item.node_code ?? item.current_step ?? item.role_type
  const dueDate = formatDate(item.deadline)

  const cardBorder = {
    overdue:   'border-red-200 bg-red-50/40',
    soon:      'border-amber-200 bg-amber-50/30',
    active:    'border-ceda-border bg-white',
    available: 'border-blue-100 bg-blue-50/20',
    invite:    'border-purple-100 bg-purple-50/20',
  }[variant] ?? 'border-ceda-border bg-white'

  return (
    <article className={cn(
      'rounded-2xl border p-5 flex flex-col gap-3 transition-shadow hover:shadow-md',
      cardBorder,
    )}>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge variant={variant === 'invite' ? 'available' : variant} />
        <div className="flex items-center gap-1.5">
          {action === 'invite' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-purple-50 text-purple-700 border-purple-200">
              <UserPlus size={9} strokeWidth={2.5} />
              Specialist
            </span>
          )}
          <RoleTag label={roleTag} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ceda-dark leading-snug line-clamp-2">{title}</p>
        {refNum && (
          <p className="text-[11px] text-ceda-muted font-mono mt-0.5">{refNum}</p>
        )}
      </div>

      {dueDate && (
        <div className={cn(
          'flex items-center gap-1.5 text-xs',
          variant === 'overdue' ? 'text-red-600 font-semibold'
          : variant === 'soon'  ? 'text-amber-600 font-semibold'
          :                       'text-ceda-muted',
        )}>
          {variant === 'overdue' && <Flame size={11} />}
          {variant === 'soon'    && <AlertTriangle size={11} />}
          {variant === 'overdue' ? 'Overdue · ' : 'Due '}
          {dueDate}
        </div>
      )}

      <div className="pt-1">
        {action === 'invite' ? (
          <button
            disabled={isBusy}
            onClick={() => onInvite(item)}
            className="btn-sm w-full justify-center flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors"
          >
            <UserPlus size={13} />
            {isBusy ? 'Opening…' : 'Send Invitation to Specialist'}
          </button>
        ) : action === 'claim' ? (
          <button
            disabled={isBusy}
            onClick={() => onClaim(item.id)}
            className="btn-primary btn-sm w-full justify-center"
          >
            {isBusy ? 'Claiming…' : 'Claim Task'}
          </button>
        ) : (
          <button
            disabled={isBusy}
            onClick={() => onOpen(item)}
            className={cn(
              'btn-sm w-full justify-center flex items-center gap-1.5',
              variant === 'overdue' || variant === 'soon'
                ? 'btn-primary'
                : 'btn-secondary',
            )}
          >
            {isBusy ? 'Opening…' : (
              <>Open Task <ArrowRight size={13} /></>
            )}
          </button>
        )}
      </div>
    </article>
  )
}


function Section({
  title, subtitle, count, variant,
  icon: Icon, iconCls, headerBorderCls, badgeCls,
  children,
}) {
  if (count === 0) return null
  return (
    <section className="mb-10">
      <div className={cn('flex items-center gap-2.5 pb-3 mb-5 border-b', headerBorderCls)}>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', {
          'bg-red-100':       variant === 'attention',
          'bg-ceda-green-pale': variant === 'active',
          'bg-blue-50':       variant === 'available',
        })}>
          <Icon size={14} className={iconCls} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ceda-dark">{title}</p>
          {subtitle && <p className="text-xs text-ceda-muted mt-0.5">{subtitle}</p>}
        </div>
        <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full', badgeCls)}>
          {count}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  )
}


function EmptyState({ isAdmin }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-ceda-surface flex items-center justify-center mb-4 border border-ceda-border">
        <CheckCircle2 size={24} className="text-ceda-green" strokeWidth={1.5} />
      </div>
      <p className="text-base font-semibold text-ceda-dark mb-1">All clear</p>
      <p className="text-sm text-ceda-muted max-w-sm mb-6">
        No active tasks right now. New tasks appear here when workflow steps are assigned to your role.
      </p>
      <Link to="/history" className="btn-secondary btn-sm flex items-center gap-1.5">
        <History size={13} /> View Completed Work
      </Link>
      {isAdmin && (
        <div className="mt-8 bg-ceda-surface border border-ceda-border rounded-2xl p-5 max-w-sm text-left space-y-3">
          <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide">Setup</p>
          <div className="space-y-3">
            <Link
              to="/admin/workflows"
              className="flex items-center gap-3 text-sm text-ceda-dark hover:text-ceda-green transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-ceda-green-pale flex items-center justify-center flex-shrink-0">
                <GitBranch size={14} className="text-ceda-forest" />
              </div>
              <div>
                <p className="font-medium group-hover:underline">Workflow Definitions</p>
                <p className="text-xs text-ceda-muted">Configure workflow steps and roles</p>
              </div>
            </Link>
            <Link
              to="/programs"
              className="flex items-center gap-3 text-sm text-ceda-dark hover:text-ceda-green transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-ceda-surface border border-ceda-border flex items-center justify-center flex-shrink-0">
                <Layers size={14} className="text-ceda-muted" />
              </div>
              <div>
                <p className="font-medium group-hover:underline">Programs</p>
                <p className="text-xs text-ceda-muted">Manage programs with active workflows</p>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}


function ActionErrorBanner({ message, onDismiss }) {
  if (!message) return null
  return (
    <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="flex-shrink-0 hover:opacity-70">
        <X size={14} />
      </button>
    </div>
  )
}

function RoleSelector({ roles = [], value, onChange }) {
  if (!roles.length) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ceda-muted">Role</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-ceda-border rounded-lg px-2 py-1 bg-white"
      >
        {roles.map((r) => (
          <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
        ))}
      </select>
    </div>
  )
}


export default function MyWork() {
  const { user, activeRole, setActiveRole, can } = useAuth()
  const navigate   = useNavigate()
  const isAdmin    = can('entries.assign') // assigns reviewers (IsOfficerOrAdmin)
  const canWork    = can('entries.review') // claims queue work (IsStaffWorker)
  const staffRoles = useMemo(
    () => (user?.roles ?? []).filter((role) => STAFF_WORKER_ROLES.includes(role)),
    [user?.roles]
  )
  const workRole = staffRoles.includes(activeRole) ? activeRole : (staffRoles[0] ?? activeRole)

  useEffect(() => {
    if (workRole && workRole !== activeRole) {
      setActiveRole(workRole)
    }
  }, [activeRole, setActiveRole, workRole])

  const {
    data: assignments = [], isLoading, error, refetch, isFetching,
  } = useMyAssignmentInstances({ role: workRole })

  const {
    data: queueRaw = [], isLoading: queueLoading, refetch: refetchQueue,
  } = useReviewerQueue({ unassigned: true, role: workRole }, { enabled: canWork && !!workRole })

  const acceptMut = useAcceptAssignment()
  const claimMut  = useClaimSubmissionSlot()

  const [busyId,      setBusyId]      = useState(null)
  const [actionError, setActionError] = useState(null)

  const handleOpen = async (item) => {
    const subId = item.submission_id ?? item.submission
    if (!subId) return
    setBusyId(item.id)
    setActionError(null)
    try {
      if (item.status === 'pending') {
        await acceptMut.mutateAsync(item.id)
      }
      navigate(`/evaluate/${subId}`)
    } catch (e) {
      setActionError(e?.message ?? 'Could not open task. Please try again.')
      setBusyId(null)
    }
  }

  const handleClaim = async (submissionId) => {
    setBusyId(submissionId)
    setActionError(null)
    try {
      await claimMut.mutateAsync(submissionId)
      navigate(`/evaluate/${submissionId}`)
    } catch (e) {
      setActionError(e?.message ?? 'Could not claim task. Please try again.')
      setBusyId(null)
    }
  }

  const handleInvite = (item) => {
    const subId = item.id
    if (subId) navigate(`/submissions/${subId}`)
  }

  const TERMINAL = new Set(['completed', 'declined', 'cancelled'])
  const active    = assignments.filter(a => !TERMINAL.has(a.status))
  const needsAttention = active.filter(a => {
    const ds = deadlineState(a)
    return ds === 'overdue' || ds === 'soon'
  })

  const myActiveWork = active.filter(a => {
    if (a.status !== 'accepted') return false
    const ds = deadlineState(a)
    return ds === 'none' || ds === 'ok'
  })

  const myPending = active.filter(a => {
    if (a.status !== 'pending') return false
    const ds = deadlineState(a)
    return ds === 'none' || ds === 'ok'
  })

  const available = queueRaw.filter(q => q.can_claim && !q.requires_invitation)

  const specialistPending = can('entries.assign')
    ? queueRaw.filter(q => q.requires_invitation && !q.my_assignment_id)
    : []

  const hasWork = needsAttention.length > 0 || myActiveWork.length > 0
    || myPending.length > 0 || available.length > 0 || specialistPending.length > 0
  const loading  = isLoading || queueLoading

  return (
    <div className="animate-fade-in">

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ceda-dark">My Work</h1>
          <p className="text-sm text-ceda-muted mt-0.5">
            Your active tasks and available work for today.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <RoleSelector roles={staffRoles} value={workRole ?? ''} onChange={setActiveRole} />
          <Link to="/history" className="btn-secondary btn-sm flex items-center gap-1.5">
            <History size={13} /> History
          </Link>
          <button
            onClick={() => { refetch(); refetchQueue() }}
            disabled={isFetching || queueLoading}
            className="btn-secondary btn-sm flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={(isFetching || queueLoading) ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <ActionErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      {loading && <SkeletonCards count={6} />}
      {error && !loading && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && (
        !hasWork ? (
          <EmptyState isAdmin={isAdmin} />
        ) : (
          <>
            <Section
              title="Needs Attention"
              subtitle="Overdue or due within 48 hours — act now"
              count={needsAttention.length}
              variant="attention"
              icon={Flame}
              iconCls="text-red-600"
              headerBorderCls="border-red-200"
              badgeCls="bg-red-100 text-red-700"
            >
              {needsAttention.map(item => (
                <TaskCard
                  key={item.id}
                  item={item}
                  variant={deadlineState(item) === 'overdue' ? 'overdue' : 'soon'}
                  action="open"
                  onOpen={handleOpen}
                  busy={busyId}
                />
              ))}
            </Section>

            <Section
              title="My Active Work"
              subtitle="Tasks assigned to you — currently in progress"
              count={myActiveWork.length + myPending.length}
              variant="active"
              icon={Clock}
              iconCls="text-ceda-forest"
              headerBorderCls="border-ceda-green/20"
              badgeCls="bg-ceda-green-pale text-ceda-forest"
            >
              {myActiveWork.map(item => (
                <TaskCard
                  key={item.id}
                  item={item}
                  variant="active"
                  action="open"
                  onOpen={handleOpen}
                  busy={busyId}
                />
              ))}
              {myPending.map(item => (
                <TaskCard
                  key={item.id}
                  item={item}
                  variant="active"
                  action="open"
                  onOpen={handleOpen}
                  busy={busyId}
                />
              ))}
            </Section>

            <Section
              title="Available Tasks"
              subtitle="Open tasks your role can claim"
              count={available.length}
              variant="available"
              icon={Inbox}
              iconCls="text-blue-600"
              headerBorderCls="border-blue-100"
              badgeCls="bg-blue-50 text-blue-700"
            >
              {available.map(item => (
                <TaskCard
                  key={item.id}
                  item={item}
                  variant="available"
                  action="claim"
                  onClaim={handleClaim}
                  busy={busyId}
                />
              ))}
            </Section>

            <Section
              title="Awaiting Specialist"
              subtitle="These steps require a specialist — send an invitation to assign"
              count={specialistPending.length}
              variant="available"
              icon={UserPlus}
              iconCls="text-purple-600"
              headerBorderCls="border-purple-100"
              badgeCls="bg-purple-50 text-purple-700"
            >
              {specialistPending.map(item => (
                <TaskCard
                  key={item.id}
                  item={item}
                  variant="invite"
                  action="invite"
                  onInvite={handleInvite}
                  busy={busyId}
                />
              ))}
            </Section>
          </>
        )
      )}

    </div>
  )
}
