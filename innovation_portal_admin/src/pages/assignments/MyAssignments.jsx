import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ClipboardList, Clock, CheckCircle2, ChevronRight, RefreshCw, Inbox, GitBranch, Layers } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  useMyAssignmentInstances,
  useClaimAssignment,
  useAcceptAssignment,
} from '../../lib/queries/assignmentInstances'
import { useAuth } from '../../lib/auth/AuthContext'
import { isAdminOrManager } from '../../lib/auth/permissions'
import AssignmentStatusBadge, { statusGroup } from '../../components/assignments/AssignmentStatusBadge'
import ErrorState from '../../components/ui/ErrorState'
import { SkeletonCards } from '../../components/ui/LoadingSkeleton'


function formatDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}


function AssignmentCard({ item, onClaim, onAccept, claiming, accepting }) {
  const navigate = useNavigate()
  const isClaiming  = claiming  === item.id
  const isAccepting = accepting === item.id

  const handleAction = (e, fn) => {
    e.stopPropagation()
    fn(item.id)
  }

  return (
    <div
      onClick={() => navigate(`/assignments/${item.id}`)}
      className="card p-5 cursor-pointer hover:shadow-md hover:border-ceda-green/30 transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ceda-muted font-medium uppercase tracking-wider mb-0.5">
            {item.node_code ?? item.role_type ?? 'Assignment'}
          </p>
          <p className="text-sm font-semibold text-ceda-dark truncate">
            {item.submission_title ?? item.assignee_name ?? `Assignment ${item.id.slice(0, 8)}`}
          </p>
          {item.submission_reference_number && (
            <p className="text-xs text-ceda-muted truncate mt-0.5">{item.submission_reference_number}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <AssignmentStatusBadge status={item.status} />
          <ChevronRight size={16} className="text-ceda-border group-hover:text-ceda-green transition-colors" />
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-ceda-muted mb-4">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          Assigned {formatDate(item.assigned_at)}
        </span>
        {item.claimed_by_name && (
          <span>Claimed by {item.claimed_by_name}</span>
        )}
      </div>

      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        {item.status === 'available' && (
          <button
            className="btn-primary btn-sm"
            disabled={isClaiming}
            onClick={(e) => handleAction(e, onClaim)}
          >
            {isClaiming ? 'Claiming…' : 'Accept'}
          </button>
        )}
        {item.status === 'pending' && (
          <button
            className="btn-primary btn-sm"
            disabled={isAccepting}
            onClick={(e) => handleAction(e, onAccept)}
          >
            {isAccepting ? 'Accepting…' : 'Accept'}
          </button>
        )}
        {!['available', 'pending'].includes(item.status) && (
          <span className="text-xs text-ceda-muted">Open task →</span>
        )}
      </div>
    </div>
  )
}


function Group({ title, icon: Icon, items, color, onClaim, onAccept, claiming, accepting }) {
  if (!items.length) return null
  return (
    <section className="mb-8">
      <div className={cn('flex items-center gap-2 mb-4 pb-2 border-b', color.border)}>
        <Icon size={16} className={color.icon} />
        <h2 className={cn('text-sm font-semibold', color.text)}>{title}</h2>
        <span className={cn('ml-auto text-xs font-medium px-2 py-0.5 rounded-full', color.badge)}>
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map(item => (
          <AssignmentCard
            key={item.id}
            item={item}
            onClaim={onClaim}
            onAccept={onAccept}
            claiming={claiming}
            accepting={accepting}
          />
        ))}
      </div>
    </section>
  )
}


function EmptyAssignments({ isAdmin }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-ceda-surface flex items-center justify-center mb-4 border border-ceda-border">
        <Inbox size={24} className="text-ceda-muted" strokeWidth={1.5} />
      </div>
      <p className="text-base font-semibold text-ceda-dark mb-1">No assignments yet</p>
      <p className="text-sm text-ceda-muted max-w-sm mb-6">
        Workflow tasks appear here when an active workflow assigns work to you.
      </p>

      {isAdmin && (
        <div className="bg-ceda-surface border border-ceda-border rounded-xl p-5 max-w-sm text-left space-y-3">
          <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide">Admin next steps</p>
          <div className="space-y-2.5">
            <Link
              to="/admin/workflows"
              className="flex items-center gap-3 text-sm text-ceda-dark hover:text-ceda-green transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg bg-ceda-green-pale flex items-center justify-center flex-shrink-0">
                <GitBranch size={13} className="text-ceda-forest" />
              </div>
              <div>
                <p className="font-medium group-hover:underline">Workflow Definitions</p>
                <p className="text-xs text-ceda-muted">Create and activate workflows</p>
              </div>
            </Link>
            <Link
              to="/programs"
              className="flex items-center gap-3 text-sm text-ceda-dark hover:text-ceda-green transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg bg-ceda-surface border border-ceda-border flex items-center justify-center flex-shrink-0">
                <Layers size={13} className="text-ceda-muted" />
              </div>
              <div>
                <p className="font-medium group-hover:underline">Programs</p>
                <p className="text-xs text-ceda-muted">Review programs that use workflows</p>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}


function ContextHint({ isAdmin }) {
  return (
    <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-ceda-surface border border-ceda-border text-sm text-ceda-muted">
      <ClipboardList size={15} className="flex-shrink-0 mt-0.5" />
      <span>
        This page shows workflow tasks assigned to you.{' '}
        {isAdmin && (
          <>
            To configure workflows, go to{' '}
            <Link to="/admin/workflows" className="text-ceda-green hover:underline font-medium">
              Workflow Definitions
            </Link>
            .
          </>
        )}
      </span>
    </div>
  )
}


export default function MyAssignments() {
  const { data: assignments = [], isLoading, error, refetch, isFetching } = useMyAssignmentInstances()
  const { user } = useAuth()
  const isAdmin  = isAdminOrManager(user)
  const claimMut   = useClaimAssignment()
  const acceptMut  = useAcceptAssignment()

  const [claiming,  setClaiming]  = useState(null)
  const [accepting, setAccepting] = useState(null)
  const [actionError, setActionError] = useState(null)

  const handleClaim = async (id) => {
    setClaiming(id); setActionError(null)
    try { await claimMut.mutateAsync(id) }
    catch (err) { setActionError(err.message) }
    finally { setClaiming(null) }
  }

  const handleAccept = async (id) => {
    setAccepting(id); setActionError(null)
    try { await acceptMut.mutateAsync(id) }
    catch (err) { setActionError(err.message) }
    finally { setAccepting(null) }
  }

  const pending    = assignments.filter(a => statusGroup(a.status) === 'pending')
  const inProgress = assignments.filter(a => statusGroup(a.status) === 'inprogress')
  const done       = assignments.filter(a => statusGroup(a.status) === 'done')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ceda-dark">My Assignments</h1>
          <p className="text-sm text-ceda-muted mt-0.5">Workflow tasks assigned to you</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary btn-sm flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {!isLoading && !error && <ContextHint isAdmin={isAdmin} />}

      {actionError && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-ceda-red-pale border border-ceda-red/20 text-ceda-red text-sm">
          <span className="font-semibold">Action failed:</span>
          <span>{actionError}</span>
          <button className="ml-auto text-xs underline" onClick={() => setActionError(null)}>Dismiss</button>
        </div>
      )}

      {isLoading && <SkeletonCards count={6} />}

      {error && !isLoading && (
        <ErrorState message={error.message} onRetry={refetch} />
      )}

      {!isLoading && !error && (
        <>
          {assignments.length === 0 ? (
            <EmptyAssignments isAdmin={isAdmin} />
          ) : (
            <>
              <Group
                title="Needs Attention"
                icon={ClipboardList}
                items={pending}
                color={{ border: 'border-amber-200', icon: 'text-amber-500', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' }}
                onClaim={handleClaim} onAccept={handleAccept} claiming={claiming} accepting={accepting}
              />
              <Group
                title="In Progress"
                icon={Clock}
                items={inProgress}
                color={{ border: 'border-ceda-green/30', icon: 'text-ceda-green', text: 'text-ceda-forest', badge: 'bg-ceda-green-pale text-ceda-forest' }}
                onClaim={handleClaim} onAccept={handleAccept} claiming={claiming} accepting={accepting}
              />
              <Group
                title="Completed"
                icon={CheckCircle2}
                items={done}
                color={{ border: 'border-ceda-border', icon: 'text-ceda-muted', text: 'text-ceda-muted', badge: 'bg-ceda-surface text-ceda-muted' }}
                onClaim={handleClaim} onAccept={handleAccept} claiming={claiming} accepting={accepting}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
