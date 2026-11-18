import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  History as HistoryIcon, CheckCircle2, ArrowLeft,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useMyAssignmentInstances } from '../../lib/queries/assignmentInstances'
import { useAuth } from '../../lib/auth/AuthContext'
import { statusGroup } from '../../components/assignments/AssignmentStatusBadge'
import StatusPill      from '../../components/ui/StatusPill'
import ErrorState      from '../../components/ui/ErrorState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'


function fmt(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso))
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function fmtNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
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

function ScoreSnapshot({ snapshot }) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-ceda-border bg-ceda-soft/40 p-4 text-sm text-ceda-muted">
        No score snapshot was found for this completed assignment.
      </div>
    )
  }

  const scores = Array.isArray(snapshot.scores) ? snapshot.scores : []
  const percent = Number(snapshot.percentage)

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Score snapshot</p>
          <p className="mt-1 text-sm font-semibold text-ceda-dark">
            {snapshot.reviewer_name || 'Reviewer'} submitted this review
          </p>
          <p className="text-xs text-ceda-muted">
            {fmtDateTime(snapshot.submitted_at)}
            {snapshot.cycle_number ? ` · Cycle ${snapshot.cycle_number}` : ''}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-2xl font-bold text-ceda-dark">
            {fmtNumber(snapshot.total_score)}
            <span className="text-sm font-semibold text-ceda-muted">/{fmtNumber(snapshot.max_score)}</span>
          </p>
          {Number.isFinite(percent) ? (
            <p className="text-xs font-semibold text-emerald-800">{fmtNumber(percent)}%</p>
          ) : null}
        </div>
      </div>

      {snapshot.overall_comment ? (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-white/80 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ceda-muted">Overall comment</p>
          <p className="mt-1 text-sm text-ceda-dark whitespace-pre-wrap">{snapshot.overall_comment}</p>
        </div>
      ) : null}

      {scores.length ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-emerald-100 bg-white">
          {scores.map((score) => (
            <div key={score.id} className="border-b border-ceda-border/60 p-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-ceda-dark">{score.criterion_name || 'Criterion'}</p>
                <p className="shrink-0 text-sm font-semibold text-ceda-dark">
                  {fmtNumber(score.raw_score)}
                  <span className="text-xs text-ceda-muted">/{fmtNumber(score.max_score)}</span>
                </p>
              </div>
              {score.comment ? (
                <p className="mt-2 text-xs text-ceda-muted whitespace-pre-wrap">{score.comment}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}


function AssignmentHistory() {
  const navigate = useNavigate()
  const { user, activeRole, setActiveRole } = useAuth()
  const { data: raw = [], isLoading, error, refetch } = useMyAssignmentInstances({ role: activeRole })
  const completed = raw.filter(a => statusGroup(a.status) === 'done')
  const [openId, setOpenId] = useState(null)

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-ceda-border flex items-center justify-between">
        <p className="text-sm font-semibold text-ceda-dark">Work History</p>
        <RoleSelector roles={user?.roles ?? []} value={activeRole ?? ''} onChange={setActiveRole} />
      </div>
      {isLoading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : error ? (
        <div className="p-6"><ErrorState message={error.message} onRetry={refetch} /></div>
      ) : (
        completed.length === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle2 size={20} className="text-ceda-muted mx-auto mb-2" />
            <p className="text-sm font-medium text-ceda-dark">No completed assignments</p>
            <p className="text-xs text-ceda-muted">When you complete an assignment it will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-ceda-border/60">
            {completed.map((row) => {
              const isOpen = openId === row.id
              return (
                <div key={row.id} className="p-4">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setOpenId((prev) => (prev === row.id ? null : row.id))}
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ceda-dark truncate">{row.submission_title || '—'}</p>
                        <p className="text-xs text-ceda-muted">{row.submission_reference_number || '—'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`/history/${row.id}`)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.stopPropagation()
                              navigate(`/history/${row.id}`)
                            }
                          }}
                          className="btn-secondary btn-sm"
                        >
                          View Snapshot
                        </span>
                        <StatusPill status={row.status} />
                        <span className="text-xs text-ceda-muted">{fmt(row.completed_at || row.updated_at)}</span>
                      </div>
                    </div>
                  </button>
                  <div className={cn('transition-all duration-200 ease-out', isOpen ? 'mt-3 max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-ceda-muted">
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-ceda-muted">Step</p>
                        <p className="text-sm text-ceda-dark">{row.node_code || '—'}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-ceda-muted">Deadline</p>
                        <p className="text-sm text-ceda-dark">{fmt(row.deadline)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <ScoreSnapshot snapshot={row.scorecard_snapshot} />
                    </div>
                    <button
                      onClick={() => navigate(`/history/${row.id}`)}
                      className="btn-secondary btn-sm mt-3"
                    >
                      View Snapshot
                    </button>
                    <button
                      onClick={() => navigate(`/evaluate/${row.submission_id || row.submission}`)}
                      className="btn-ghost btn-sm mt-3 ml-2"
                    >
                      View Current Live Submission
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}


export default function History() {
  const navigate = useNavigate()

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate('/assignments')}
              className="btn-ghost btn-sm -ml-2 flex items-center gap-1"
            >
              <ArrowLeft size={14} /> My Work
            </button>
          </div>
          <h1 className="text-2xl font-bold text-ceda-dark flex items-center gap-2">
            <HistoryIcon size={22} className="text-ceda-muted" />
            History
          </h1>
          <p className="text-sm text-ceda-muted mt-0.5">
            Completed assignments. Use View Snapshot to see what you marked and commented at that time.
          </p>
        </div>
      </div>

      <AssignmentHistory />
    </div>
  )
}
