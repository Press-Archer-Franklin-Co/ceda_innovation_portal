import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, FileText, User, Building2, Calendar,
  Star, XCircle, CheckCircle2, MessageSquare,
  Paperclip, Clock, AlertCircle, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Minus, RotateCcw, UserPlus, Send, Trash2, Mail,
} from 'lucide-react'
import PageHeader        from '../../components/ui/PageHeader'
import SectionCard       from '../../components/ui/SectionCard'
import StatusPill        from '../../components/ui/StatusPill'
import Tabs              from '../../components/ui/Tabs'
import WorkflowTimeline  from '../../components/ui/WorkflowTimeline'
import Modal             from '../../components/ui/Modal'
import ErrorState        from '../../components/ui/ErrorState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import EvaluationTab     from '../../components/evaluation/EvaluationTab'
import AiHelperCard      from '../../components/assistant/AiHelperCard'
import RelatedIdeas      from '../../components/assistant/RelatedIdeas'
import { useAssistantStatus } from '../../lib/queries/assistant'
import { useT }          from '../../i18n/context'
import {
  useSubmission,
  useSubmissionWorkflow,
  useSubmissionNotes,
  useAddNote,
  useWorkflowAction,
} from '../../lib/queries/submissions'
import { assignments as assignmentsApi, documents as documentsApi, submissions as submissionsApi, evaluations, tasks as tasksApi, specialistInvitations as specialistInvitationsApi } from '../../lib/api/endpoints'
import DocumentLink from '../../components/documents/DocumentLink'
import { useAuth } from '../../lib/auth/AuthContext'
import { cn } from '../../lib/cn'
import {
  formatDisplayLabel,
  formatResponseValue,
  getResponseFiles,
  groupResponses,
  hasDisplayValue,
  normalizeResponses,
} from '../../lib/applicantDisplay'

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-ceda-border/60 last:border-0">
      <Icon size={14} className="text-ceda-muted mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-ceda-muted uppercase tracking-wide font-medium">{label}</p>
        <p className="text-sm text-ceda-dark mt-0.5 break-words">{value ?? '—'}</p>
      </div>
    </div>
  )
}

function ResponseValue({ value }) {
  const files = getResponseFiles(value)

  if (files.length > 0) {
    return (
      <div className="mt-1 space-y-1.5">
        {files.map((file, index) => (
          file.documentId ? (
            <DocumentLink
              key={file.documentId}
              doc={{ id: file.documentId, original_filename: file.name }}
              className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-ceda-green hover:underline text-left"
            >
              <Paperclip size={13} className="flex-shrink-0" />
              <span className="truncate">{file.name}</span>
            </DocumentLink>
          ) : file.url ? (
            <a
              key={file.id ?? index}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-ceda-green hover:underline"
            >
              <Paperclip size={13} className="flex-shrink-0" />
              <span className="truncate">{file.name}</span>
            </a>
          ) : (
            <span key={file.id ?? index} className="inline-flex max-w-full items-center gap-1.5 text-sm text-ceda-dark">
              <Paperclip size={13} className="flex-shrink-0 text-ceda-muted" />
              <span className="truncate">{file.name}</span>
            </span>
          )
        ))}
      </div>
    )
  }

  return (
    <p className="text-sm text-ceda-dark leading-relaxed whitespace-pre-wrap break-words">
      {formatResponseValue(value)}
    </p>
  )
}

function ActionBar({ submission, workflow, onAction }) {
  const allowed = workflow?.allowed_actions ?? []
  const canReject = allowed.includes('reject')

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canReject && (
        <button onClick={() => onAction('reject')} className="btn-danger btn-sm">
          <XCircle size={13} /> Reject
        </button>
      )}
    </div>
  )
}

function normalizeWorkflowSteps(workflow, programWorkflow) {
  if (!workflow) return []
  if (Array.isArray(workflow)) return workflow
  if (Array.isArray(workflow.steps)) return workflow.steps
  if (Array.isArray(workflow.definition?.steps)) return workflow.definition.steps
  if (Array.isArray(programWorkflow?.steps)) return programWorkflow.steps
  if (Array.isArray(workflow.step_history)) return workflow.step_history
  return []
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtPct(val) {
  if (val == null) return null
  return `${parseFloat(val).toFixed(1)}%`
}

const OUTCOME_META = {
  pass:                 { label: 'Passed',             icon: CheckCircle2,  cls: 'text-ceda-green',  bg: 'bg-ceda-green-pale',  border: 'border-ceda-green/30'  },
  return_for_correction:{ label: 'Returned',           icon: RotateCcw,     cls: 'text-amber-600',  bg: 'bg-amber-50',        border: 'border-amber-200'     },
  reject:               { label: 'Rejected',           icon: XCircle,       cls: 'text-red-600',    bg: 'bg-red-50',          border: 'border-red-200'       },
  pending:              { label: 'In Progress',         icon: Clock,         cls: 'text-ceda-muted',  bg: 'bg-ceda-surface',     border: 'border-ceda-border'    },
}

function outcomeOf(cycle) {
  if (cycle.status === 'needs_attention') {
    return { label: 'Needs attention', icon: AlertCircle, cls: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' }
  }
  return OUTCOME_META[cycle.outcome] ?? OUTCOME_META.pending
}

function CycleSummaryBody({ submissionId, cycleId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', submissionId, 'cycle-summary', cycleId],
    queryFn: () => evaluations.cycleSummary(submissionId, cycleId),
    staleTime: 60_000,
  })

  if (isLoading) return (
    <div className="space-y-2 mt-3">
      {[1,2].map(i => <div key={i} className="h-12 bg-ceda-border/30 rounded-lg animate-pulse" />)}
    </div>
  )

  const scorecards = data?.scorecards ?? data?.data?.scorecards ?? []
  if (!scorecards.length) return (
    <p className="text-xs text-ceda-muted mt-3">No reviewer scorecards recorded for this cycle.</p>
  )

  return (
    <div className="mt-3 space-y-3">
      {scorecards.map((sc) => {
        const scoreMax = (sc.scores ?? []).reduce((sum, score) => sum + Number(score.max_score || 0), 0)
        const pct = sc.total_score != null && scoreMax > 0
          ? ((sc.total_score / scoreMax) * 100).toFixed(1)
          : null
        return (
          <div key={sc.scorecard_id} className="rounded-xl border border-ceda-border bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-ceda-surface border-b border-ceda-border">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-ceda-forest flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[9px] font-semibold">
                    {(sc.reviewer?.name ?? 'R').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ceda-dark truncate">{sc.reviewer?.name ?? 'Reviewer'}</p>
                  <p className="text-[10px] text-ceda-muted truncate">{fmtDate(sc.submitted_at)}</p>
                </div>
              </div>
              {sc.total_score != null && (
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-ceda-dark">{fmtPct(pct)}</p>
                  <p className="text-[10px] text-ceda-muted">{sc.total_score?.toFixed(1)} pts</p>
                </div>
              )}
            </div>
            <div className="divide-y divide-ceda-border/60">
              {(sc.scores ?? []).map((s) => (
                <div key={s.criterion_id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-ceda-muted flex-1 min-w-0 truncate">{s.criterion_name}</p>
                    <span className={cn(
                      'text-[11px] font-semibold flex-shrink-0',
                      s.raw_score >= (s.max_score * 0.7) ? 'text-ceda-green' :
                      s.raw_score >= (s.max_score * 0.4) ? 'text-amber-600' : 'text-red-600'
                    )}>
                      {s.raw_score} / {s.max_score}
                    </span>
                  </div>
                  {s.comment && (
                    <p className="text-[11px] text-ceda-muted/80 mt-0.5 italic leading-snug">"{s.comment}"</p>
                  )}
                </div>
              ))}
            </div>
            {sc.overall_comment && (
              <div className="px-3 py-2 bg-ceda-surface/60 border-t border-ceda-border">
                <p className="text-[10px] text-ceda-muted font-semibold uppercase tracking-wide mb-0.5">Overall comment</p>
                <p className="text-[11px] text-ceda-dark italic">"{sc.overall_comment}"</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CycleRow({ cycle, submissionId, defaultOpen, onAction, actionPending }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const meta = outcomeOf(cycle)
  const Icon = meta.icon
  const isTimed = Boolean(cycle.closes_at)
  const isOpen = cycle.status === 'open'
  const isAttention = cycle.status === 'needs_attention'

  return (
    <div className={cn('rounded-xl border overflow-hidden', meta.border)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
          meta.bg, 'hover:opacity-90'
        )}
      >
        <Icon size={14} className={cn('flex-shrink-0', meta.cls)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-ceda-dark">Round {cycle.cycle_number}</span>
            <span className={cn('text-[10px] font-semibold', meta.cls)}>{meta.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {cycle.aggregate_pct != null && (
              <span className="text-[11px] text-ceda-muted">Score: <span className="font-semibold text-ceda-dark">{fmtPct(cycle.aggregate_pct)}</span></span>
            )}
            <span className="text-[11px] text-ceda-muted">{cycle.completed_count} reviewer{cycle.completed_count !== 1 ? 's' : ''}</span>
            {cycle.closes_at && <span className="text-[11px] text-ceda-muted">Closes {fmtDate(cycle.closes_at)}</span>}
            {cycle.closed_at && <span className="text-[11px] text-ceda-muted">{fmtDate(cycle.closed_at)}</span>}
          </div>
        </div>
        {open ? <ChevronDown size={13} className="text-ceda-muted flex-shrink-0" /> : <ChevronRight size={13} className="text-ceda-muted flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 bg-white">
          {cycle.decision_note?.trim() && (
            <div className="mt-2 rounded-lg bg-ceda-surface border border-ceda-border px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ceda-muted mb-1">Decision note</p>
              <p className="text-[11px] text-ceda-dark leading-relaxed whitespace-pre-line">{cycle.decision_note.trim()}</p>
            </div>
          )}
          {isTimed && (
            <div className="mt-2 rounded-lg bg-ceda-surface border border-ceda-border px-3 py-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ceda-muted">Timed review window</p>
                  <p className="text-[11px] text-ceda-dark mt-0.5">
                    {isAttention ? 'Needs attention' : isOpen ? `Open until ${fmtDate(cycle.closes_at)}` : 'Window closed'}
                    {cycle.extended_count ? ` · reset/extended ${cycle.extended_count} time${cycle.extended_count === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => onAction?.({ cycleId: cycle.id, action: 'reset', body: { hours: 48 } })}
                    className="btn-ghost btn-sm"
                    title="Reset timer to 48 hours from now"
                  >
                    <RotateCcw size={13} /> Reset 48h
                  </button>
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => onAction?.({ cycleId: cycle.id, action: 'extend', body: { hours: 24 } })}
                    className="btn-ghost btn-sm"
                    title="Add 24 hours to this review window"
                  >
                    <Clock size={13} /> +24h
                  </button>
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => onAction?.({ cycleId: cycle.id, action: 'close-now' })}
                    className="btn-ghost btn-sm"
                  >
                    Close now
                  </button>
                  <button
                    type="button"
                    disabled={actionPending || !cycle.completed_count}
                    onClick={() => onAction?.({ cycleId: cycle.id, action: 'proceed' })}
                    className="btn-primary btn-sm"
                  >
                    Proceed
                  </button>
                </div>
              </div>
            </div>
          )}
          <CycleSummaryBody submissionId={submissionId} cycleId={cycle.id} />
        </div>
      )}
    </div>
  )
}

function StatusTransitionRow({ entry }) {
  const [open, setOpen] = useState(false)
  const hasComment = entry.comment?.trim() && entry.comment !== entry.reason

  const statusLabel = (s) => s?.replace(/_/g, ' ') ?? '—'

  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center flex-shrink-0 mt-1">
        <div className="w-2 h-2 rounded-full bg-ceda-border flex-shrink-0" />
      </div>
      <div className="pb-3 min-w-0 flex-1">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => entry.comment?.trim() && setOpen(v => !v)}
        >
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[11px] text-ceda-muted">{statusLabel(entry.from_status)}</span>
            <span className="text-[10px] text-ceda-muted">→</span>
            <span className="text-[11px] font-semibold text-ceda-dark">{statusLabel(entry.to_status)}</span>
            <span className="text-[10px] text-ceda-muted ml-auto">{fmtDate(entry.created_at)}</span>
            {entry.comment?.trim() && (
              open ? <ChevronDown size={11} className="text-ceda-muted" /> : <ChevronRight size={11} className="text-ceda-muted" />
            )}
          </div>
        </button>
        {open && entry.comment?.trim() && (
          <p className="mt-1 text-[11px] text-ceda-muted/90 italic leading-snug border-l-2 border-ceda-border pl-2">
            "{entry.comment.trim()}"
          </p>
        )}
      </div>
    </div>
  )
}

function ReviewHistoryPanel({ submissionId }) {
  const qc = useQueryClient()
  const { data: cyclesRaw, isLoading: cyclesLoading } = useQuery({
    queryKey: ['evaluations', submissionId, 'cycles'],
    queryFn: () => evaluations.listCycles(submissionId),
    enabled: !!submissionId,
    staleTime: 30_000,
  })

  const { data: historyRaw, isLoading: histLoading } = useQuery({
    queryKey: ['submissions', submissionId, 'status-history'],
    queryFn: () => submissionsApi.history(submissionId),
    enabled: !!submissionId,
    staleTime: 30_000,
  })

  const cycles  = (cyclesRaw?.data ?? cyclesRaw ?? []).slice().reverse()
  const history = historyRaw?.data ?? historyRaw ?? []
  const cycleAction = useMutation({
    mutationFn: ({ cycleId, action, body }) => evaluations.cycleAction(submissionId, cycleId, action, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations', submissionId, 'cycles'] })
      qc.invalidateQueries({ queryKey: ['submissions', submissionId, 'workflow'] })
      qc.invalidateQueries({ queryKey: ['submissions', submissionId] })
    },
  })

  const loading = cyclesLoading || histLoading

  return (
    <SectionCard title="Review History" subtitle="All review rounds and status changes">
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-10 bg-ceda-border/30 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {cycles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ceda-muted">Scoring Rounds</p>
              {cycles.map((c, i) => (
                <CycleRow
                  key={c.id}
                  cycle={c}
                  submissionId={submissionId}
                  defaultOpen={i === 0}
                  onAction={(payload) => cycleAction.mutate(payload)}
                  actionPending={cycleAction.isPending}
                />
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ceda-muted mb-2">Status Timeline</p>
              <div className="space-y-0">
                {[...history].reverse().map((entry, i) => (
                  <StatusTransitionRow key={entry.id ?? i} entry={entry} />
                ))}
              </div>
            </div>
          )}

          {!cycles.length && !history.length && (
            <p className="text-sm text-ceda-muted">No review history yet.</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

export default function SubmissionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, can } = useAuth()
  const t = useT()
  const aiStatus = useAssistantStatus({ enabled: can('assistant.hints') })
  const showRelated = can('assistant.hints') && Boolean(aiStatus.data?.features?.related)
  // Assignments, suggestions and specialist invitations are officer endpoints (entries.assign).
  const canAssign = can('entries.assign')
  const [tab, setTab]         = useState('overview')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [noteText, setNoteText] = useState('')
  const [assignmentUserId, setAssignmentUserId] = useState('')
  const [assignmentDeadline, setAssignmentDeadline] = useState('')
  const [assignmentError, setAssignmentError] = useState(null)

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteForm, setInviteForm] = useState({ invitee_name: '', invitee_email: '', required_review_count: 1, message: '' })
  const [inviteError, setInviteError] = useState(null)

  const { data: submission, isLoading, error, refetch } = useSubmission(id)
  const { data: workflow,   isLoading: wfLoading }      = useSubmissionWorkflow(id)
  const { data: notesData,  isLoading: notesLoading }   = useSubmissionNotes(id)
  const { data: assignmentsData, refetch: refetchAssignments } = useQuery({
    queryKey: ['submissions', id, 'assignments'],
    queryFn: () => submissionsApi.assignments(id),
    enabled: canAssign,
  })
  const { data: documentsData } = useQuery({
    queryKey: ['submissions', id, 'documents'],
    queryFn: () => documentsApi.forSubmission(id, { grouped: true }),
    enabled: !!id,
  })
  const { data: suggestionsData } = useQuery({
    queryKey: ['submissions', id, 'assignment-suggestions', workflow?.assignment_summary?.required_role],
    queryFn: () => assignmentsApi.suggestions({ submission: id, role_type: workflow?.assignment_summary?.required_role || 'judge' }),
    enabled: canAssign && !!workflow?.assignment_summary?.required,
  })
  const assignMutation = useMutation({
    mutationFn: (body) => submissionsApi.assign(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', id, 'timeline'] })
      qc.invalidateQueries({ queryKey: ['submissions', id, 'assignments'] })
      qc.invalidateQueries({ queryKey: ['assignments'] })
      refetchAssignments()
    },
  })

  const { data: specialistInvitesData, refetch: refetchInvites } = useQuery({
    queryKey: ['submissions', id, 'specialist-invitations'],
    queryFn: () => submissionsApi.specialistInvites(id),
    enabled: canAssign,
  })
  const specialistInvites = Array.isArray(specialistInvitesData)
    ? specialistInvitesData
    : specialistInvitesData?.results ?? []

  const sendInviteMutation = useMutation({
    mutationFn: (body) => submissionsApi.inviteSpecialist(id, body),
    onSuccess: () => {
      refetchInvites()
      setShowInviteForm(false)
      setInviteForm({ invitee_name: '', invitee_email: '', required_review_count: 1, message: '' })
      setInviteError(null)
    },
    onError: (err) => setInviteError(err.message || 'Failed to send invitation.'),
  })
  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId) => specialistInvitationsApi.revoke(inviteId),
    onSuccess: () => refetchInvites(),
  })
  const resendInviteMutation = useMutation({
    mutationFn: (inviteId) => specialistInvitationsApi.resend(inviteId),
    onSuccess: () => refetchInvites(),
  })

  const addNote        = useAddNote()
  const workflowAction = useWorkflowAction()

  const completeMyTask = useMutation({
    mutationFn: (taskId) => tasksApi.complete(taskId, { outcome: 'approve' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', id, 'workflow'] })
      qc.invalidateQueries({ queryKey: ['submissions', id] })
    },
  })

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="h-8 w-80 bg-ceda-border/60 rounded animate-pulse mb-2" />
        <div className="h-4 w-48 bg-ceda-border/40 rounded animate-pulse mb-6" />
        <SkeletonTable rows={5} cols={4} />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  if (!submission) {
    return (
      <div className="text-center py-24">
        <p className="text-ceda-muted">Submission not found.</p>
        <button onClick={() => navigate('/submissions')} className="btn-ghost mt-3">← Back</button>
      </div>
    )
  }

  const program    = submission.program_detail ?? {}
  const innovator  = submission.innovator_detail ?? submission.innovator
  const notes = Array.isArray(notesData) ? notesData : notesData?.results ?? []
  const assignments = Array.isArray(assignmentsData) ? assignmentsData : assignmentsData?.results ?? []
  const steps = normalizeWorkflowSteps(workflow, program.active_workflow_definition)
  const innovatorName = typeof innovator === 'object'
    ? (innovator?.full_name || [innovator?.first_name, innovator?.last_name].filter(Boolean).join(' '))
    : innovator ?? '—'
  const innovatorEmail = typeof innovator === 'object' ? innovator?.email : null
  const groupedDocuments = documentsData?.grouped_by_field ?? {}
  const normalizedResponses = normalizeResponses(submission.responses ?? [], submission.title)
  const groupedResponses = groupResponses(normalizedResponses)
  const suggestedUsers = suggestionsData?.suggestions ?? []
  const currentAssignment = assignments.find((item) => ['assigned', 'accepted', 'pending'].includes(item.status))
  const isSpecialistStep = workflow?.role_required === 'specialist' || workflow?.assignment_summary?.required_role === 'specialist'

  const handleAction = (action) => {
    if (action === 'reject') setRejectOpen(true)
  }

  const handleAddNote = () => {
    if (!noteText.trim()) return
    addNote.mutate(
      { id, body: { note: noteText } },
      { onSuccess: () => setNoteText('') }
    )
  }

  const handleReject = () => {
    if (!rejectReason.trim()) return
    workflowAction.mutate(
      { id, body: { action: 'reject', comment: rejectReason } },
      {
        onSuccess: () => {
          setRejectOpen(false)
          setRejectReason('')
        }
      }
    )
  }

  const handleAssign = async (action) => {
    setAssignmentError(null)
    try {
      const body = {
        action,
        assignee: assignmentUserId,
        role_type: workflow?.assignment_summary?.required_role || currentAssignment?.role_type || 'judge',
      }
      if (assignmentDeadline) body.deadline = new Date(assignmentDeadline).toISOString()
      if (action !== 'assign' && currentAssignment?.id) body.assignment_id = currentAssignment.id
      await assignMutation.mutateAsync(body)
      setAssignmentUserId('')
      setAssignmentDeadline('')
    } catch (err) {
      setAssignmentError(err.message)
    }
  }

  const TABS_DEF = [
    { key: 'overview',    label: 'Overview' },
    { key: 'workflow',    label: 'Workflow' },
    { key: 'evaluation',  label: 'Evaluation' },
    { key: 'notes',       label: 'Notes', count: notes.length },
    ...(showRelated ? [{ key: 'related', label: t('ai.related.tab') }] : []),
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={submission.title}
        subtitle={`${submission.reference_number ?? '—'} · ${program.title ?? '—'}`}
        back={
          <button onClick={() => navigate('/submissions')} className="btn-ghost btn-sm -ml-2">
            <ArrowLeft size={14} /> Submissions
          </button>
        }
        badge={<StatusPill status={submission.current_status} />}
        actions={<ActionBar submission={submission} workflow={workflow} onAction={handleAction} />}
      />

      <Tabs tabs={TABS_DEF} active={tab} onChange={setTab} className="mb-5" />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <SectionCard title="Submission Details">
              {normalizedResponses.length > 0 ? (
                <div className="space-y-6">
                  {[
                    { key: 'applicant', title: 'Applicant Information' },
                    { key: 'contact', title: 'Contact Information' },
                    { key: 'identity', title: 'Identity Information' },
                    { key: 'solution', title: 'Solution Information' },
                    { key: 'supporting', title: 'Supporting Information' },
                  ].map((section) => {
                    const items = (groupedResponses[section.key] ?? []).filter((item) => hasDisplayValue(item.value))
                    if (items.length === 0) return null
                    return (
                      <div key={section.key}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ceda-muted mb-2">
                          {section.title}
                        </p>
                        <div className="space-y-4">
                          {items.map((r, i) => (
                            <div key={r.id ?? i}>
                              <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide mb-1">
                                {formatDisplayLabel(r.field_label ?? r.field_key ?? r.form_field ?? `Question ${i + 1}`)}
                              </p>
                              <ResponseValue value={r.value} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-ceda-muted leading-relaxed">
                  No form responses available for this submission.
                </p>
              )}
            </SectionCard>

            <SectionCard title="Current Stage">
              {wfLoading ? (
                <div className="h-8 bg-ceda-border/40 rounded animate-pulse" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-ceda-indigo-pale flex items-center justify-center flex-shrink-0">
                    <Clock size={18} className="text-ceda-indigo" />
                  </div>
                  <div>
                    <p className="font-semibold text-ceda-dark">
                      {workflow?.current_step ?? workflow?.current_step_detail?.name ?? submission.current_status ?? 'Not started'}
                    </p>
                    <p className="text-xs text-ceda-muted">
                      {workflow?.workflow_status
                        ? `Workflow: ${workflow.workflow_status.replace(/_/g, ' ')}`
                        : 'No active workflow step'}
                    </p>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-5">
            <AiHelperCard submissionId={id} />
            <SectionCard title="Innovator">
              <InfoRow icon={User}      label="Name"   value={innovatorName} />
              {innovatorEmail && (
                <InfoRow icon={FileText} label="Email"  value={innovatorEmail} />
              )}
            </SectionCard>

            <SectionCard title="Submission Info">
              <InfoRow
                icon={Calendar}
                label="Submitted"
                value={submission.submitted_at
                  ? new Date(submission.submitted_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
                  : null}
              />
              <InfoRow icon={FileText} label="Program"   value={program.title} />
              <InfoRow
                icon={FileText}
                label="Type"
                value={submission.submission_type === 'hackathon' ? 'Hackathon Application' : 'Idea Submission'}
              />
              <InfoRow
                icon={FileText}
                label="Reference"
                value={submission.reference_number}
              />
              {submission.final_decision && (
                <InfoRow icon={Star} label="Decision" value={submission.final_decision} />
              )}
            </SectionCard>

            <SectionCard title="Attachments">
              {Object.keys(groupedDocuments).length === 0 ? (
                <p className="text-sm text-ceda-muted">No attachments uploaded.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedDocuments).map(([fieldKey, items]) => (
                    <div key={fieldKey}>
                      <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide mb-1">{fieldKey}</p>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <DocumentLink
                            key={item.id}
                            doc={item}
                            className="flex items-center gap-2 text-sm text-ceda-forest hover:underline text-left"
                          >
                            <Paperclip size={14} />
                            {item.original_filename || item.field_key}
                          </DocumentLink>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <ReviewHistoryPanel submissionId={id} />
          </div>
        </div>
      )}

      {tab === 'workflow' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <SectionCard title="Workflow Progress" subtitle="Step-by-step lifecycle for this submission">
              {wfLoading ? (
                <SkeletonTable rows={5} cols={3} />
              ) : steps.length > 0 ? (
                <WorkflowTimeline collapsible steps={steps.map(s => ({
                  id:          s.id,
                  label:       s.name ?? s.code,
                  description: s.submission_status ?? s.code,
                  status:      workflow?.current_step?.id === s.id
                    ? 'active'
                    : (workflow?.completed_steps ?? []).includes(s.id)
                      ? 'completed'
                      : 'pending',
                  actor:       null,
                  completedAt: null,
                }))} />
              ) : workflow ? (
                <div className="space-y-4">
                  <InfoRow icon={Clock} label="Current Step" value={workflow.current_step ?? '—'} />
                  <InfoRow icon={FileText} label="Workflow" value={workflow.workflow_definition_name ?? '—'} />
                  <InfoRow icon={CheckCircle2} label="Status" value={(workflow.workflow_status ?? '').replace(/_/g, ' ')} />
                  {workflow.allowed_actions?.length > 0 && (
                    <InfoRow icon={Star} label="Allowed Actions" value={workflow.allowed_actions.join(', ')} />
                  )}
                  {workflow.assignment_summary?.required && (
                    <InfoRow
                      icon={User}
                      label="Assignments"
                      value={`${workflow.assignment_summary.active_count ?? 0} / ${workflow.assignment_summary.required_count ?? 0} ${workflow.assignment_summary.required_role ?? ''}`}
                    />
                  )}
                  {workflow.evaluation_summary?.required && (
                    <InfoRow
                      icon={Star}
                      label="Evaluations"
                      value={`${workflow.evaluation_summary.completed_evaluators ?? 0} / ${workflow.evaluation_summary.required_count ?? 0} completed${workflow.evaluation_summary.average_score != null ? ` · Avg: ${workflow.evaluation_summary.average_score}` : ''}`}
                    />
                  )}
                  {workflow.evaluation_summary?.readiness?.blocked_reasons?.length > 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold mb-0.5">Blocked</p>
                        {workflow.evaluation_summary.readiness.blocked_reasons.map((r, i) => <p key={i}>{r}</p>)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ceda-muted">No workflow steps found for this submission.</p>
              )}
            </SectionCard>
          </div>
          {(() => {
            const allowed = workflow?.allowed_actions ?? []
            const isBlocked = (workflow?.evaluation_summary?.readiness?.blocked_reasons?.length ?? 0) > 0
            const canApprove = allowed.includes('approve') && !isBlocked
            const canReturn  = allowed.includes('return')

            const requiresAssignment = workflow?.requires_assignment
            const requiresEvaluation = workflow?.requires_evaluation
            const taskItems = workflow?.task_summary?.items ?? []
            const myTask = requiresAssignment && !requiresEvaluation
              ? taskItems.find(t => t.assignee_id === user?.id && ['pending', 'claimed'].includes(t.status))
              : null

            if (!canApprove && !canReturn && !myTask) return null
            return (
              <SectionCard title="Quick Actions">
                <div className="space-y-2">
                  {myTask && (
                    <button
                      onClick={() => completeMyTask.mutate(myTask.task_id)}
                      disabled={completeMyTask.isPending}
                      className="btn-primary w-full justify-center"
                    >
                      {completeMyTask.isPending ? 'Submitting…' : 'Submit My Review'}
                    </button>
                  )}
                  {canApprove && (
                    <button
                      onClick={() => workflowAction.mutate({ id, body: { action: 'approve', comment: 'Advanced by staff.' } })}
                      disabled={workflowAction.isPending}
                      className="btn-secondary w-full justify-center"
                    >
                      {workflowAction.isPending ? 'Processing…' : 'Approve / Advance'}
                    </button>
                  )}
                  {canReturn && (
                    <button
                      onClick={() => workflowAction.mutate({ id, body: { action: 'return', comment: 'Returned for correction.' } })}
                      disabled={workflowAction.isPending}
                      className="btn-ghost w-full justify-center"
                    >
                      Return for Correction
                    </button>
                  )}
                </div>
                {completeMyTask.isError && (
                  <p className="text-xs text-ceda-red mt-2">{completeMyTask.error?.message}</p>
                )}
                {workflowAction.isError && (
                  <p className="text-xs text-ceda-red mt-2">{workflowAction.error?.message}</p>
                )}
              </SectionCard>
            )
          })()}

          {canAssign && (
            <SectionCard title="Assignments" subtitle="Create or update the live reviewer assignment for this submission.">
              <div className="space-y-3">
                {assignments.length > 0 ? (
                  <div className="space-y-2">
                    {assignments.map((item) => (
                      <div key={item.id} className="rounded-lg border border-ceda-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-ceda-dark">{item.assignee_name || 'Unassigned'}</p>
                          <StatusPill status={item.status} />
                        </div>
                        <p className="text-xs text-ceda-muted mt-1">{item.workflow_step_name || item.role_type}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ceda-muted">No assignment records yet.</p>
                )}

                <select className="input" value={assignmentUserId} onChange={(e) => setAssignmentUserId(e.target.value)}>
                  <option value="">Select reviewer…</option>
                  {suggestedUsers.map((item) => (
                    <option key={item.user_id} value={item.user_id}>
                      {item.full_name} ({item.active_assignment_count} active)
                    </option>
                  ))}
                </select>
                <input className="input" type="datetime-local" value={assignmentDeadline} onChange={(e) => setAssignmentDeadline(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAssign(currentAssignment ? 'reassign' : 'assign')}
                    disabled={assignMutation.isPending || !assignmentUserId}
                    className="btn-primary flex-1 justify-center"
                  >
                    {currentAssignment ? 'Reassign' : 'Assign Reviewer'}
                  </button>
                  {currentAssignment && (
                    <button
                      onClick={() => handleAssign('unassign')}
                      disabled={assignMutation.isPending}
                      className="btn-ghost justify-center"
                    >
                      Unassign
                    </button>
                  )}
                </div>
                {assignmentError && <p className="text-xs text-ceda-red">{assignmentError}</p>}
              </div>
            </SectionCard>
          )}

          {canAssign && (
            <SectionCard
              title="Specialist Invitations"
              subtitle="Invite an external specialist to review this submission via magic link."
            >
              <div className="space-y-3">
                {specialistInvites.length > 0 && (
                  <div className="space-y-2">
                    {specialistInvites.map((inv) => {
                      const statusColors = {
                        pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
                        accepted:  'bg-blue-50 text-blue-700 border-blue-200',
                        completed: 'bg-green-50 text-green-700 border-green-200',
                        expired:   'bg-gray-100 text-gray-500 border-gray-200',
                        revoked:   'bg-red-50 text-red-600 border-red-200',
                      }
                      const pillCls = statusColors[inv.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                      const isActive = ['pending', 'accepted'].includes(inv.status)
                      return (
                        <div key={inv.id} className="rounded-lg border border-ceda-border px-3 py-2.5 flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-ceda-forest/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Mail size={13} className="text-ceda-forest" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-ceda-dark truncate">{inv.invitee_name}</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${pillCls} capitalize`}>
                                {inv.status}
                              </span>
                            </div>
                            <p className="text-xs text-ceda-muted mt-0.5 truncate">{inv.invitee_email}</p>
                            {inv.required_review_count && (
                              <p className="text-[11px] text-ceda-muted mt-0.5">
                                Required reviews: {inv.required_review_count}
                              </p>
                            )}
                            {inv.expires_at && (
                              <p className="text-[11px] text-ceda-muted mt-0.5">
                                {inv.is_expired ? 'Expired' : 'Expires'} {fmtDate(inv.expires_at)}
                              </p>
                            )}
                          </div>
                          {isActive && (
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => resendInviteMutation.mutate(inv.id)}
                                disabled={resendInviteMutation.isPending}
                                title="Resend invitation email"
                                className="p-1.5 rounded hover:bg-ceda-border/60 text-ceda-muted hover:text-ceda-dark transition-colors"
                              >
                                <Send size={13} />
                              </button>
                              <button
                                onClick={() => revokeInviteMutation.mutate(inv.id)}
                                disabled={revokeInviteMutation.isPending}
                                title="Revoke invitation"
                                className="p-1.5 rounded hover:bg-red-50 text-ceda-muted hover:text-ceda-red transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {showInviteForm ? (
                  <div className="rounded-lg border border-ceda-border p-3 space-y-2.5 bg-ceda-light/40">
                    <input
                      className="input"
                      placeholder="Specialist name"
                      value={inviteForm.invitee_name}
                      onChange={(e) => setInviteForm(f => ({ ...f, invitee_name: e.target.value }))}
                    />
                    <input
                      className="input"
                      type="email"
                      placeholder="specialist@example.com"
                      value={inviteForm.invitee_email}
                      onChange={(e) => setInviteForm(f => ({ ...f, invitee_email: e.target.value }))}
                    />
                    <label className="block">
                      <span className="text-xs font-semibold text-ceda-muted">Required specialist reviews</span>
                      <input
                        className="input mt-1"
                        type="number"
                        min={1}
                        max={10}
                        value={inviteForm.required_review_count}
                        onChange={(e) => setInviteForm(f => ({ ...f, required_review_count: Number(e.target.value) || 1 }))}
                      />
                    </label>
                    <textarea
                      className="input resize-none"
                      rows={3}
                      placeholder="Personal message (optional)…"
                      value={inviteForm.message}
                      onChange={(e) => setInviteForm(f => ({ ...f, message: e.target.value }))}
                    />
                    {inviteError && (
                      <p className="text-xs text-ceda-red">{inviteError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendInviteMutation.mutate(inviteForm)}
                        disabled={sendInviteMutation.isPending || !inviteForm.invitee_name || !inviteForm.invitee_email}
                        className="btn-primary flex-1 justify-center"
                      >
                        {sendInviteMutation.isPending ? 'Sending…' : 'Send Invitation'}
                      </button>
                      <button
                        onClick={() => { setShowInviteForm(false); setInviteError(null) }}
                        className="btn-ghost justify-center"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowInviteForm(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ceda-border py-2.5 text-sm text-ceda-muted hover:border-ceda-forest hover:text-ceda-forest transition-colors"
                  >
                    <UserPlus size={15} />
                    Invite Specialist
                  </button>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {tab === 'related' && showRelated && <RelatedIdeas submissionId={id} />}

      {tab === 'evaluation' && (
        <EvaluationTab submissionId={id} />
      )}

      {tab === 'notes' && (
        <SectionCard title="Internal Notes" subtitle="Visible to staff only — not shared with applicants">
          {notesLoading ? (
            <SkeletonTable rows={3} cols={2} />
          ) : (
            <div className="space-y-4 mb-6">
              {notes.length === 0 ? (
                <p className="text-sm text-ceda-muted text-center py-4">No notes yet.</p>
              ) : notes.map((note, i) => {
                const detail   = note.author_detail
                const name     = detail?.full_name || detail?.email || 'Staff'
                const initials = detail?.initials || name.slice(0, 2).toUpperCase()
                const ts       = note.created_at
                  ? new Date(note.created_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : '—'
                const content  = note.note ?? note.content ?? note.text ?? note.body ?? ''
                return (
                  <div key={note.id ?? i} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-ceda-forest flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-[11px] font-bold">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-ceda-dark">{name}</span>
                        {detail?.email && name !== detail.email && (
                          <span className="text-[11px] text-ceda-muted">{detail.email}</span>
                        )}
                        <span className="text-[11px] text-ceda-muted ml-auto">{ts}</span>
                      </div>
                      <p className="text-[13px] text-ceda-dark bg-ceda-surface rounded-xl px-3 py-2.5 leading-relaxed whitespace-pre-wrap">
                        {content}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="border-t border-ceda-border pt-4">
            <textarea
              className="textarea text-sm"
              placeholder="Add an internal note…"
              rows={3}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <div className="flex items-center justify-between mt-2">
              {addNote.isError && (
                <p className="text-xs text-ceda-red">{addNote.error?.message}</p>
              )}
              <div className="ml-auto">
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || addNote.isPending}
                  className="btn-primary btn-sm"
                >
                  <MessageSquare size={13} />
                  {addNote.isPending ? 'Saving…' : 'Add Note'}
                </button>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject Submission"
        size="md"
        footer={
          <>
            <button onClick={() => setRejectOpen(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleReject}
              disabled={!rejectReason.trim() || workflowAction.isPending}
              className="btn-danger"
            >
              {workflowAction.isPending ? 'Processing…' : 'Confirm Rejection'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-ceda-red-pale">
            <XCircle size={16} className="text-ceda-red flex-shrink-0 mt-0.5" />
            <p className="text-sm text-ceda-red">
              You are about to reject <strong>{submission.title}</strong>. The applicant will be notified.
            </p>
          </div>
          {workflowAction.isError && (
            <p className="text-xs text-ceda-red">{workflowAction.error?.message}</p>
          )}
          <div>
            <label className="label">Rejection reason <span className="text-ceda-red">*</span></label>
            <textarea
              className="textarea"
              placeholder="Provide a clear reason for rejection…"
              rows={4}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <p className="text-xs text-ceda-muted mt-1">This reason will be included in the notification to the applicant.</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
