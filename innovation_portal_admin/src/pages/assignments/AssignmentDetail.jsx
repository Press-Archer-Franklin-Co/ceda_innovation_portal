import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, RefreshCw, Send, UserX } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import StatusPill from '../../components/ui/StatusPill'
import ErrorState from '../../components/ui/ErrorState'
import { assignments as assignmentsApi, documents as documentsApi, submissions as submissionsApi } from '../../lib/api/endpoints'
import DocumentLink from '../../components/documents/DocumentLink'
import { useSubmission, useSubmissionEvaluations, useSubmissionWorkflow, useWorkflowAction } from '../../lib/queries/submissions'
import { useAssignmentInstance, useAcceptAssignment, useCompleteAssignment, useDeclineAssignment } from '../../lib/queries/assignmentInstances'
import { useAuth } from '../../lib/auth/AuthContext'
import { isAdminOrManager } from '../../lib/auth/permissions'
import {
  formatDisplayLabel,
  formatResponseValue,
  getResponseFiles,
  groupResponses,
  hasDisplayValue,
  normalizeResponses,
} from '../../lib/applicantDisplay'
import { cn } from '../../lib/cn'

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
              <FileText size={13} className="flex-shrink-0" />
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
              <FileText size={13} className="flex-shrink-0" />
              <span className="truncate">{file.name}</span>
              <ExternalLink size={11} className="flex-shrink-0" />
            </a>
          ) : (
            <span key={file.id ?? index} className="inline-flex max-w-full items-center gap-1.5 text-sm text-ceda-dark">
              <FileText size={13} className="flex-shrink-0 text-ceda-muted" />
              <span className="truncate">{file.name}</span>
            </span>
          )
        ))}
      </div>
    )
  }

  return (
    <p className="mt-1 text-sm text-ceda-dark break-words whitespace-pre-wrap">
      {formatResponseValue(value)}
    </p>
  )
}

function HistoryList({ items }) {
  const [openId, setOpenId] = useState(null)
  if (!items?.length) {
    return <p className="text-sm text-ceda-muted">No assignment history yet.</p>
  }
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openId === item.id
        const summary = item.action_type || item.action || 'Update'
        return (
          <div key={item.id} className="rounded-xl border border-ceda-border px-4 py-3">
            <button
              type="button"
              className="w-full text-left flex items-center justify-between gap-3"
              onClick={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
              aria-expanded={isOpen}
            >
              <p className="text-sm font-semibold text-ceda-dark">{summary}</p>
              <span className="text-xs text-ceda-muted">{formatDateTime(item.created_at || item.timestamp)}</span>
            </button>
            <div className={cn('transition-all duration-200 ease-out', isOpen ? 'mt-2 max-h-[500px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden')}>
              {item.metadata && (
                <pre className="mt-2 text-xs text-ceda-muted whitespace-pre-wrap break-words">
                  {JSON.stringify(item.metadata, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AssignmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const adminMode = isAdminOrManager(user)
  const [note, setNote] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [reassignUser, setReassignUser] = useState('')
  const [actionError, setActionError] = useState(null)

  const { data: assignment, isLoading, error, refetch } = useAssignmentInstance(id)
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['assignments', id, 'history'],
    queryFn: () => assignmentsApi.history(id),
    enabled: !!id,
  })
  const { data: suggestionsData } = useQuery({
    queryKey: ['assignments', id, 'suggestions', assignment?.submission, assignment?.role_type],
    queryFn: () => assignmentsApi.suggestions({ submission: assignment.submission, role_type: assignment.role_type }),
    enabled: !!assignment?.submission && !!assignment?.role_type && adminMode,
  })
  const { data: documentsData } = useQuery({
    queryKey: ['submissions', assignment?.submission, 'documents'],
    queryFn: () => documentsApi.forSubmission(assignment.submission, { grouped: true }),
    enabled: !!assignment?.submission,
  })
  const { data: submission } = useSubmission(assignment?.submission)
  const { data: workflow } = useSubmissionWorkflow(assignment?.submission)
  const { data: evaluations } = useSubmissionEvaluations(assignment?.submission)

  const acceptAssignment = useAcceptAssignment()
  const declineAssignment = useDeclineAssignment()
  const completeAssignment = useCompleteAssignment()
  const workflowAction = useWorkflowAction()
  const reassignMutation = useMutation({
    mutationFn: ({ assignee }) => assignmentsApi.reassign(id, { assignee }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['assignments', 'detail', id] })
      qc.invalidateQueries({ queryKey: ['assignments', id, 'history'] })
      refetch()
      refetchHistory()
    },
  })
  const unassignMutation = useMutation({
    mutationFn: () => assignmentsApi.unassign(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['assignments', 'detail', id] })
      qc.invalidateQueries({ queryKey: ['assignments', id, 'history'] })
      refetch()
      refetchHistory()
    },
  })

  const history = Array.isArray(historyData) ? historyData : historyData?.results ?? []
  const groupedDocuments = documentsData?.grouped_by_field ?? {}
  const evaluationList = evaluations?.items ?? []
  const suggestionItems = suggestionsData?.suggestions ?? []
  const responses = normalizeResponses(submission?.responses ?? [], submission?.title)
  const groupedResponses = groupResponses(responses)
  const applicant = submission?.innovator_detail
  const currentStep = workflow?.current_step_detail

  const runJudgeAction = async (mode) => {
    setActionError(null)
    try {
      if (mode === 'accept') await acceptAssignment.mutateAsync(id)
      if (mode === 'decline') await declineAssignment.mutateAsync({ id, note: note || 'Declined from assignment detail.' })
      if (mode === 'complete') await completeAssignment.mutateAsync({ id, note })
      setNote('')
      refetch()
      refetchHistory()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const runReviewAction = async (action) => {
    setActionError(null)
    try {
      await workflowAction.mutateAsync({
        id: assignment.submission,
        body: { action, comment: reviewComment },
      })
      setReviewComment('')
      refetch()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const canJudge = assignment?.assignee === user?.id || assignment?.assignee_name === user?.full_name || !adminMode
  const canAccept = ['pending', 'assigned'].includes(assignment?.status)
  const canComplete = ['accepted', 'in_progress'].includes(assignment?.status)

  const documents = useMemo(() => {
    const rows = []
    for (const [fieldKey, items] of Object.entries(groupedDocuments)) {
      for (const item of items) {
        rows.push({ fieldKey, ...item })
      }
    }
    return rows
  }, [groupedDocuments])

  if (isLoading) {
    return <div className="h-32 rounded-xl bg-ceda-border/30 animate-pulse" />
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  if (!assignment) {
    return <ErrorState message="Assignment not found." onRetry={refetch} />
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={assignment.submission_title || 'Assignment'}
        subtitle={assignment.submission_reference_number || assignment.id}
        back={
          <button onClick={() => navigate('/assignments')} className="btn-ghost btn-sm -ml-2">
            <ArrowLeft size={14} /> My Work
          </button>
        }
        badge={<StatusPill status={assignment.status} />}
        actions={
          <>
            {assignment.submission && (
              <button className="btn-secondary btn-sm" onClick={() => navigate(`/submissions/${assignment.submission}`)}>
                <ExternalLink size={14} /> Submission
              </button>
            )}
            <button className="btn-secondary btn-sm" onClick={() => { refetch(); refetchHistory() }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </>
        }
      />

      {actionError && (
        <div className="mb-5 rounded-xl border border-ceda-red/20 bg-ceda-red-pale px-4 py-3 text-sm text-ceda-red">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <SectionCard title="Assignment Context" subtitle="This is the operational task page for the live assignment record.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Assignee</p>
                <p className="text-sm text-ceda-dark mt-1">{assignment.assignee_name || 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Assigned By</p>
                <p className="text-sm text-ceda-dark mt-1">{assignment.assigned_by_name || 'System'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Workflow Step</p>
                <p className="text-sm text-ceda-dark mt-1">{assignment.workflow_step_name || currentStep?.name || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Deadline</p>
                <p className="text-sm text-ceda-dark mt-1">{formatDateTime(assignment.deadline)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Assigned At</p>
                <p className="text-sm text-ceda-dark mt-1">{formatDateTime(assignment.assigned_at)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Responded At</p>
                <p className="text-sm text-ceda-dark mt-1">{formatDateTime(assignment.responded_at)}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Applicant and Submission">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Applicant</p>
                <p className="text-sm text-ceda-dark mt-1">{applicant?.full_name || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Applicant Email</p>
                <p className="text-sm text-ceda-dark mt-1">{applicant?.email || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Current Submission Status</p>
                <div className="mt-1"><StatusPill status={submission?.current_status} /></div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ceda-muted font-medium">Current Workflow Step</p>
                <p className="text-sm text-ceda-dark mt-1">{currentStep?.name || '—'}</p>
              </div>
            </div>

            <div className="space-y-6">
              {responses.length === 0 ? (
                <p className="text-sm text-ceda-muted">No form responses were returned for this submission.</p>
              ) : (
                [
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
                      <div className="space-y-3">
                        {items.map((response) => (
                          <div key={response.id} className="rounded-xl border border-ceda-border px-4 py-3">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-ceda-muted">
                              {formatDisplayLabel(response.field_label || response.field_key)}
                            </p>
                            <ResponseValue value={response.value} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </SectionCard>

          <SectionCard title="Attachments">
            {documents.length === 0 ? (
              <p className="text-sm text-ceda-muted">No files uploaded for this submission.</p>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <DocumentLink
                    key={doc.id}
                    doc={doc}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-ceda-border px-4 py-3 hover:bg-ceda-surface/70 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ceda-dark truncate">{doc.original_filename || doc.fieldKey}</p>
                      <p className="text-xs text-ceda-muted">{doc.fieldKey}</p>
                    </div>
                    <FileText size={16} className="text-ceda-forest flex-shrink-0" />
                  </DocumentLink>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Evaluations">
            {evaluationList.length === 0 ? (
              <p className="text-sm text-ceda-muted">No evaluation records yet.</p>
            ) : (
              <div className="space-y-3">
                {evaluationList.map((item) => (
                  <div key={item.id} className="rounded-xl border border-ceda-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-ceda-dark">{item.judge_name || item.judge || 'Judge'}</p>
                      <StatusPill status={item.status || item.latest_score_status || 'pending'} />
                    </div>
                    <p className="mt-1 text-xs text-ceda-muted">
                      Total score: {item.total_score ?? '—'} · Submitted: {formatDateTime(item.submitted_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Assignment Actions">
            <textarea
              className="input min-h-28 resize-y mb-3"
              placeholder="Action note or reason"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              {canJudge && canAccept && (
                <button className="btn-primary btn-sm justify-center" disabled={acceptAssignment.isPending} onClick={() => runJudgeAction('accept')}>
                  Accept Assignment
                </button>
              )}
              {canJudge && canAccept && (
                <button className="btn-secondary btn-sm justify-center" disabled={declineAssignment.isPending} onClick={() => runJudgeAction('decline')}>
                  Decline Assignment
                </button>
              )}
              {canJudge && canComplete && (
                <button className="btn-secondary btn-sm justify-center" disabled={completeAssignment.isPending} onClick={() => runJudgeAction('complete')}>
                  <CheckCircle2 size={14} /> Mark Complete
                </button>
              )}
              {assignment.role_type === 'judge' && (
                <button className="btn-primary btn-sm justify-center" onClick={() => navigate(`/evaluations/${assignment.submission}`)}>
                  <Send size={14} /> Open Evaluation Form
                </button>
              )}
            </div>
          </SectionCard>

          {adminMode && (
            <SectionCard title="Reassignment">
              <select className="input mb-3" value={reassignUser} onChange={(e) => setReassignUser(e.target.value)}>
                <option value="">Select assignee…</option>
                {suggestionItems.map((item) => (
                  <option key={item.user_id} value={item.user_id}>
                    {item.full_name} ({item.active_assignment_count} active)
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-2">
                <button
                  className="btn-primary btn-sm justify-center"
                  disabled={reassignMutation.isPending || !reassignUser}
                  onClick={async () => {
                    setActionError(null)
                    try {
                      await reassignMutation.mutateAsync({ assignee: reassignUser })
                      setReassignUser('')
                    } catch (err) {
                      setActionError(err.message)
                    }
                  }}
                >
                  Reassign
                </button>
                <button
                  className="btn-ghost btn-sm justify-center text-ceda-red"
                  disabled={unassignMutation.isPending}
                  onClick={async () => {
                    setActionError(null)
                    try {
                      await unassignMutation.mutateAsync()
                    } catch (err) {
                      setActionError(err.message)
                    }
                  }}
                >
                  <UserX size={14} /> Unassign
                </button>
              </div>
            </SectionCard>
          )}

          {adminMode && (
            <SectionCard title="Review Outcome">
              <textarea
                className="input min-h-28 resize-y mb-3"
                placeholder="Comment for approve, reject, or request changes"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
              <div className="flex flex-col gap-2">
                <button className="btn-primary btn-sm justify-center" disabled={workflowAction.isPending} onClick={() => runReviewAction('approve')}>
                  Approve Submission
                </button>
                <button className="btn-secondary btn-sm justify-center" disabled={workflowAction.isPending} onClick={() => runReviewAction('return')}>
                  Request Changes
                </button>
                <button className="btn-ghost btn-sm justify-center text-ceda-red" disabled={workflowAction.isPending} onClick={() => runReviewAction('reject')}>
                  Reject Submission
                </button>
              </div>
            </SectionCard>
          )}

          <SectionCard title="History">
            <HistoryList items={history} />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
