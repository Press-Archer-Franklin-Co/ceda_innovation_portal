import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, History as HistoryIcon, MessageSquare } from 'lucide-react'
import ErrorState from '../../components/ui/ErrorState'
import { useAssignmentInstance } from '../../lib/queries/assignmentInstances'
import { formatResponseValue } from '../../lib/applicantDisplay'

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

function humanize(value) {
  if (!value) return '—'
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function groupResponses(responses = []) {
  const groups = []
  responses.forEach((response) => {
    const label = response.field_label || response.label || response.field_key || 'Field'
    const section = response.section_label || 'Submission Answers'
    let group = groups.find(item => item.title === section)
    if (!group) {
      group = { title: section, items: [] }
      groups.push(group)
    }
    group.items.push({ ...response, label })
  })
  return groups
}

function SnapshotAnswers({ snapshot }) {
  const groups = groupResponses(snapshot?.responses || [])
  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-ceda-border bg-white p-6 text-sm text-ceda-muted">
        No submission answer snapshot is available for this historical review.
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.title} className="rounded-2xl border border-ceda-border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-ceda-border bg-ceda-surface/50">
            <p className="text-sm font-semibold text-ceda-dark">{group.title}</p>
            <p className="text-xs text-ceda-muted">{group.items.length} field{group.items.length === 1 ? '' : 's'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-5">
            {group.items.map((item) => (
              <div key={item.id || item.field_key || item.label} className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">
                  {item.label}
                </p>
                <p className="text-sm text-ceda-dark mt-1 whitespace-pre-wrap break-words">
                  {formatResponseValue(item.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Scorecard({ snapshot }) {
  if (snapshot?.type === 'manager_decision') {
    return <ManagerDecisionSnapshot snapshot={snapshot} />
  }
  const scores = snapshot?.scores || []
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-100 bg-white/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-800">Historical scorecard</p>
            <h2 className="text-lg font-bold text-ceda-dark mt-1">
              {snapshot?.reviewer_name || 'Reviewer'} marked this assignment
            </h2>
            <p className="text-xs text-ceda-muted mt-1">
              Submitted {fmtDateTime(snapshot?.submitted_at)}
              {snapshot?.cycle_number ? ` · Cycle ${snapshot.cycle_number}` : ''}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-3xl font-bold text-ceda-dark">
              {fmtNumber(snapshot?.total_score)}
              <span className="text-sm text-ceda-muted">/{fmtNumber(snapshot?.max_score)}</span>
            </p>
            <p className="text-xs font-semibold text-emerald-800">{fmtNumber(snapshot?.percentage)}%</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {snapshot?.overall_comment ? (
          <div className="rounded-xl border border-emerald-100 bg-white p-4">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">Overall comment</p>
            <p className="mt-2 text-sm text-ceda-dark whitespace-pre-wrap">{snapshot.overall_comment}</p>
          </div>
        ) : null}
        <div className="rounded-xl border border-emerald-100 bg-white overflow-hidden">
          {scores.map((score) => (
            <div key={score.id} className="p-4 border-b border-ceda-border/60 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-ceda-dark">{score.criterion_name}</p>
                <p className="text-sm font-bold text-ceda-dark whitespace-nowrap">
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
      </div>
    </div>
  )
}

function ScoreBreakdown({ scorecard }) {
  const scores = scorecard?.scores || []
  return (
    <div className="rounded-xl border border-ceda-border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-ceda-border bg-ceda-surface/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">Marked by</p>
            <p className="text-sm font-bold text-ceda-dark">{scorecard?.reviewer_name || 'Reviewer'}</p>
            <p className="text-xs text-ceda-muted mt-0.5">Submitted {fmtDateTime(scorecard?.submitted_at)}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xl font-bold text-ceda-dark">
              {fmtNumber(scorecard?.total_score)}
              <span className="text-xs text-ceda-muted">/{fmtNumber(scorecard?.max_score)}</span>
            </p>
            <p className="text-xs font-semibold text-emerald-800">{fmtNumber(scorecard?.percentage)}%</p>
          </div>
        </div>
      </div>
      {scorecard?.overall_comment ? (
        <div className="px-4 py-3 border-b border-ceda-border bg-white">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">Overall comment</p>
          <p className="mt-1 text-sm text-ceda-dark whitespace-pre-wrap">{scorecard.overall_comment}</p>
        </div>
      ) : null}
      <div className="divide-y divide-ceda-border/60">
        {scores.map((score) => (
          <div key={score.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-ceda-dark">{score.criterion_name}</p>
              <p className="text-sm font-bold text-ceda-dark whitespace-nowrap">
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
    </div>
  )
}

function ManagerDecisionSnapshot({ snapshot }) {
  const source = snapshot?.source_review
  const scorecards = source?.scorecards || []
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-emerald-100 bg-white/70">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-800">Manager decision</p>
              <h2 className="text-lg font-bold text-ceda-dark mt-1">
                {snapshot?.reviewer_name || 'Manager'} responded to the review outcome
              </h2>
              <p className="text-xs text-ceda-muted mt-1">
                Submitted {fmtDateTime(snapshot?.submitted_at)}
                {snapshot?.workflow_step_name ? ` · ${snapshot.workflow_step_name}` : ''}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs uppercase tracking-wide font-semibold text-ceda-muted">Manager action</p>
              <p className="text-lg font-bold text-ceda-dark mt-1">{humanize(snapshot?.action)}</p>
              {snapshot?.effective_outcome && snapshot.effective_outcome !== snapshot.action ? (
                <p className="text-xs text-ceda-muted mt-1">Result: {humanize(snapshot.effective_outcome)}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-emerald-100 bg-white p-4">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted flex items-center gap-1.5">
              <MessageSquare size={12} /> Manager comment
            </p>
            <p className="mt-2 text-sm text-ceda-dark whitespace-pre-wrap">
              {snapshot?.comment || 'No manager comment was captured for this decision.'}
            </p>
          </div>
          {source ? (
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">Review outcome manager responded to</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-ceda-dark">{source.step_name || humanize(source.step_code)}</p>
                  <p className="text-xs text-ceda-muted">
                    {scorecards.length} completed review{scorecards.length === 1 ? '' : 's'}
                    {source.cycle_number ? ` · Cycle ${source.cycle_number}` : ''}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-2xl font-bold text-ceda-dark">
                    {fmtNumber(source.aggregate?.score)}
                    <span className="text-sm text-ceda-muted">/{fmtNumber(snapshot?.max_score)}</span>
                  </p>
                  <p className="text-xs font-semibold text-emerald-800">
                    {fmtNumber(source.aggregate?.pct)}% · {humanize(source.aggregate?.outcome)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {scorecards.length ? (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] font-bold text-ceda-muted">Innovation officer review snapshot</p>
          {scorecards.map((scorecard) => (
            <ScoreBreakdown key={scorecard.id} scorecard={scorecard} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function HistorySnapshot() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: assignment, isLoading, error, refetch } = useAssignmentInstance(id)
  const snapshot = assignment?.scorecard_snapshot
  const submissionSnapshot = snapshot?.submission_snapshot

  if (isLoading) {
    return <div className="p-6 text-sm text-ceda-muted">Loading historical snapshot…</div>
  }
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!assignment) return <ErrorState message="Historical assignment not found." onRetry={refetch} />

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/history')} className="btn-ghost btn-sm -ml-2 mb-2 flex items-center gap-1">
            <ArrowLeft size={14} /> History
          </button>
          <h1 className="text-2xl font-bold text-ceda-dark flex items-center gap-2">
            <HistoryIcon size={22} className="text-ceda-muted" />
            Review Snapshot
          </h1>
          <p className="text-sm text-ceda-muted mt-1">
            Frozen view of what was reviewed and scored for this completed assignment.
          </p>
        </div>
        <button
          onClick={() => navigate(`/evaluate/${assignment.submission_id || assignment.submission}`)}
          className="btn-secondary btn-sm"
        >
          View Current Live Submission
        </button>
      </div>

      <div className="rounded-2xl border border-ceda-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold text-ceda-muted">Submission</p>
            <h2 className="text-lg font-bold text-ceda-dark mt-1">
              {submissionSnapshot?.title || assignment.submission_title || '—'}
            </h2>
            <p className="text-xs font-mono text-ceda-muted mt-1">
              {submissionSnapshot?.reference_number || assignment.submission_reference_number || '—'}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs uppercase tracking-wide font-semibold text-ceda-muted">Completed</p>
            <p className="text-sm text-ceda-dark mt-1">{fmtDateTime(assignment.completed_at || assignment.updated_at)}</p>
          </div>
        </div>
        {snapshot?.submission_snapshot_source === 'current_backfill' ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            This older review did not have a stored answer snapshot yet, so this page uses the best available backfilled values. New reviews will store the exact answer snapshot at submission time.
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 size={14} /> Stored historical snapshot
          </div>
        )}
      </div>

      <Scorecard snapshot={snapshot} />
      <SnapshotAnswers snapshot={submissionSnapshot} />
    </div>
  )
}
