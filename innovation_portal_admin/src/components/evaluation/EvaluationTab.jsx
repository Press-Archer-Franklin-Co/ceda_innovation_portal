import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Lock, Star, AlertCircle, ChevronDown, ChevronUp, Info,
  ExternalLink, Pencil, Mail, Send, Trash2, UserPlus,
} from 'lucide-react'
import SectionCard from '../ui/SectionCard'
import StatusPill  from '../ui/StatusPill'
import { useAuth } from '../../lib/auth/AuthContext'
import { isInnovationOfficer } from '../../lib/auth/permissions'
import {
  useMyCycle, useSaveCycleScores, useSubmitCycle,
  useReviewCycles, useCycleSummary,
} from '../../lib/queries/evaluations'
import { submissions as submissionsApi, specialistInvitations as specialistInvitationsApi } from '../../lib/api/endpoints'
import { cn } from '../../lib/cn'

function CriterionInput({ criterion, value, comment, onChange, locked }) {
  return (
    <div className="border border-ceda-border rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-sm text-ceda-dark">{criterion.name}</p>
          {criterion.description && (
            <p className="text-xs text-ceda-muted mt-0.5 leading-relaxed">{criterion.description}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-xs text-ceda-muted">
          Max: <span className="font-semibold text-ceda-dark">{criterion.max_score}</span>
        </div>
      </div>
      <div className="flex gap-3 items-center">
        <input
          type="number"
          min={criterion.min_score}
          max={criterion.max_score}
          step="0.5"
          disabled={locked}
          value={value ?? ''}
          onChange={e => onChange('score', parseFloat(e.target.value) || '')}
          className="input w-24 text-center"
          placeholder="Score"
        />
        <div className="flex-1">
          <input
            type="text"
            disabled={locked}
            value={comment ?? ''}
            onChange={e => onChange('comment', e.target.value)}
            placeholder={criterion.comment_required_below != null ? `Comment required below ${criterion.comment_required_below}` : 'Comment (optional)'}
            className="input w-full text-sm"
          />
        </div>
        {value !== '' && value != null && (
          <div className="flex-shrink-0 text-xs font-medium text-ceda-muted">
            {Math.round((value / criterion.max_score) * 100)}%
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewerRow({ scorecard }) {
  const [open, setOpen] = useState(false)
  const initials = (scorecard.reviewer?.name ?? 'R').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div className="border border-ceda-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ceda-surface/60 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-full bg-ceda-forest flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[10px] font-semibold">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ceda-dark truncate">{scorecard.reviewer?.name}</p>
          <p className="text-xs text-ceda-muted">{scorecard.reviewer?.email}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold text-ceda-dark">{scorecard.total_score}</span>
          <StatusPill status={scorecard.status} />
          {open ? <ChevronUp size={14} className="text-ceda-muted" /> : <ChevronDown size={14} className="text-ceda-muted" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-ceda-border bg-ceda-surface/40 px-4 py-3 space-y-2">
          {scorecard.scores.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ceda-dark">{s.criterion_name}</p>
                {s.comment && <p className="text-xs text-ceda-muted mt-0.5 italic">{s.comment}</p>}
              </div>
              <div className="flex-shrink-0 text-xs text-ceda-dark font-medium">
                {s.raw_score} / {s.max_score}
              </div>
            </div>
          ))}
          {scorecard.overall_comment && (
            <p className="text-xs text-ceda-muted border-t border-ceda-border/60 pt-2 mt-2 italic">
              "{scorecard.overall_comment}"
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CycleSummaryPanel({ submissionId }) {
  const { data: cyclesRaw } = useReviewCycles(submissionId)
  const cycles = useMemo(
    () => Array.isArray(cyclesRaw) ? cyclesRaw : cyclesRaw?.data ?? [],
    [cyclesRaw],
  )
  const [selectedId, setSelectedId] = useState(null)
  const activeCycle = cycles.find(c => c.id === selectedId) ?? cycles[0]
  const { data: summaryRaw, isLoading } = useCycleSummary(submissionId, activeCycle?.id)
  const summary = summaryRaw?.data ?? summaryRaw

  useEffect(() => {
    if (cycles.length && !selectedId) setSelectedId(cycles[0]?.id)
  }, [cycles, selectedId])

  if (!cycles.length) {
    return (
      <div className="text-center py-12 text-ceda-muted text-sm">
        No review cycles have started for this submission yet.
      </div>
    )
  }

  const outcomeColor = {
    pass:               'text-green-700 bg-green-50 border-green-200',
    reject:             'text-ceda-red bg-ceda-red-pale border-ceda-red/20',
    return_for_correction: 'text-amber-700 bg-amber-50 border-amber-200',
    pending:            'text-ceda-muted bg-ceda-surface border-ceda-border',
  }

  return (
    <div className="space-y-5">
      {cycles.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-ceda-muted uppercase tracking-wide font-medium">Cycle</span>
          <div className="flex gap-2">
            {cycles.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold border transition-colors',
                  c.id === activeCycle?.id
                    ? 'bg-ceda-forest text-white border-ceda-forest'
                    : 'bg-white text-ceda-muted border-ceda-border hover:bg-ceda-surface',
                )}
              >
                #{c.cycle_number}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="h-16 rounded-xl border border-ceda-border animate-pulse bg-ceda-surface" />)}
        </div>
      )}

      {summary && (
        <>
          <div className="rounded-xl border border-ceda-border bg-ceda-surface/60 px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-ceda-muted uppercase tracking-wide font-medium mb-1">Aggregate Score</p>
              <p className="text-2xl font-bold text-ceda-dark">
                {summary.aggregate?.score != null ? summary.aggregate.score.toFixed(1) : '—'}
              </p>
              {summary.aggregate?.pct != null && (
                <p className="text-xs text-ceda-muted mt-0.5">{summary.aggregate.pct.toFixed(1)}% of maximum</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-ceda-muted mb-1">{summary.aggregate?.completed_reviews ?? 0} reviewer(s)</p>
              {summary.aggregate?.outcome && (
                <span className={cn('inline-block px-3 py-1 rounded-full text-xs font-semibold border', outcomeColor[summary.aggregate.outcome] ?? outcomeColor.pending)}>
                  {summary.aggregate.outcome.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>

          {summary.scorecards?.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide">Reviewer Scorecards</p>
              {summary.scorecards.map(sc => (
                <ReviewerRow key={sc.scorecard_id} scorecard={sc} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ceda-muted text-center py-4">No scorecards submitted yet for this cycle.</p>
          )}
        </>
      )}
    </div>
  )
}

function ScoringForm({ submissionId }) {
  const { data: cycleRaw, isLoading, error, refetch } = useMyCycle(submissionId)
  const cycleData = cycleRaw?.data ?? cycleRaw
  const saveMutation    = useSaveCycleScores()
  const submitMutation  = useSubmitCycle()

  const [scores, setScores] = useState({})
  const [overall, setOverall] = useState('')
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)

  const criteria = cycleData?.criteria ?? []
  const myCard   = cycleData?.my_scorecard
  const locked   = myCard?.status === 'locked' || myCard?.status === 'submitted'
  const cycleComplete = cycleData?.cycle_status === 'completed'

  useEffect(() => {
    if (myCard?.scores?.length) {
      const init = {}
      myCard.scores.forEach(s => {
        init[s.criterion_id] = { score: s.raw_score, comment: s.comment }
      })
      setScores(init)
      setOverall(myCard.overall_comment ?? '')
    }
  }, [myCard])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl border border-ceda-border animate-pulse bg-ceda-surface" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 rounded-xl bg-ceda-red-pale border border-ceda-red/20 text-sm text-ceda-red">
        <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Could not load evaluation cycle</p>
          <p className="text-xs mt-0.5">{error?.message}</p>
          <button onClick={refetch} className="btn-ghost btn-sm mt-2">Retry</button>
        </div>
      </div>
    )
  }

  if (!cycleData) return null

  const totalRaw = criteria.reduce((sum, c) => {
    const v = parseFloat(scores[c.id]?.score)
    return sum + (isNaN(v) ? 0 : v)
  }, 0)

  const maxRaw = criteria.reduce((sum, c) => sum + parseFloat(c.max_score || 0), 0)
  const pct = maxRaw > 0 ? Math.round((totalRaw / maxRaw) * 100) : 0

  const allScored = criteria.every(c => {
    const v = scores[c.id]?.score
    return v !== '' && v != null && !isNaN(parseFloat(v))
  })

  const handleChange = (criterionId, field, value) => {
    setScores(prev => ({
      ...prev,
      [criterionId]: { ...(prev[criterionId] ?? {}), [field]: value },
    }))
    setSaved(false)
  }

  const buildPayload = () =>
    criteria.map(c => ({
      criterion_id: c.id,
      type: c.type,
      raw_score: String(scores[c.id]?.score ?? 0),
      comment: scores[c.id]?.comment ?? '',
    }))

  const handleSave = () => {
    setSaveError(null)
    saveMutation.mutate(
      { subId: submissionId, scores: buildPayload(), overall_comment: overall },
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setSaveError(e?.message ?? 'Failed to save.'),
      }
    )
  }

  const handleSubmit = () => {
    setSaveError(null)
    submitMutation.mutate(
      { subId: submissionId },
      {
        onSuccess: () => refetch(),
        onError: (e) => setSaveError(e?.message ?? 'Failed to submit.'),
      }
    )
  }

  if (locked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
          <Lock size={14} />
          <span className="font-semibold">Your evaluation is submitted and locked.</span>
          {myCard?.submitted_at && (
            <span className="text-xs text-green-600 ml-auto">
              {new Date(myCard.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {criteria.map(c => {
            const s = myCard?.scores?.find(ms => ms.criterion_id === c.id)
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-ceda-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ceda-dark truncate">{c.name}</p>
                  {s?.comment && <p className="text-xs text-ceda-muted italic mt-0.5">{s.comment}</p>}
                </div>
                <div className="flex-shrink-0 text-sm font-bold text-ceda-dark">
                  {s?.raw_score ?? '—'} / {c.max_score}
                </div>
              </div>
            )
          })}
        </div>

        {myCard?.overall_comment && (
          <div className="px-4 py-3 rounded-lg bg-ceda-surface border border-ceda-border">
            <p className="text-xs text-ceda-muted uppercase tracking-wide font-medium mb-1">Overall Comment</p>
            <p className="text-sm text-ceda-dark italic">"{myCard.overall_comment}"</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-ceda-muted">
            Total: <strong>{myCard?.total_score}</strong>
          </p>
          {cycleData?.peer_scores_available && cycleData?.aggregate && (
            <div className="text-xs text-ceda-muted">
              Aggregate: <strong>{cycleData.aggregate.score?.toFixed(1)}</strong>
              {' · '}
              <span className={cn(
                'font-semibold',
                cycleData.aggregate.outcome === 'pass' && 'text-green-600',
                cycleData.aggregate.outcome === 'reject' && 'text-ceda-red',
                cycleData.aggregate.outcome === 'return_for_correction' && 'text-amber-600',
              )}>
                {cycleData.aggregate.outcome?.replace(/_/g, ' ')}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cycleData.stage_config?.blind_scoring && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700">
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <span>Blind scoring is enabled. Peer scores will be hidden until you submit your evaluation.</span>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-ceda-muted">
        <span>Required reviewers: <strong className="text-ceda-dark">{cycleData.stage_config?.required_reviewer_count ?? 1}</strong></span>
        <span>Completed: <strong className="text-ceda-dark">{cycleData.completed_reviews ?? 0}</strong></span>
      </div>

      {criteria.length === 0 ? (
        <div className="text-center py-8 text-ceda-muted text-sm">
          No scoring criteria configured for this stage yet.
        </div>
      ) : (
        <div className="space-y-3">
          {criteria.map(c => (
            <CriterionInput
              key={c.id}
              criterion={c}
              value={scores[c.id]?.score ?? ''}
              comment={scores[c.id]?.comment ?? ''}
              locked={false}
              onChange={(field, val) => handleChange(c.id, field, val)}
            />
          ))}
        </div>
      )}

      <div>
        <label className="label text-xs">Overall comment (optional)</label>
        <textarea
          className="textarea text-sm"
          rows={2}
          placeholder="Add an overall observation…"
          value={overall}
          onChange={e => setOverall(e.target.value)}
        />
      </div>

      {criteria.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-ceda-surface border border-ceda-border">
          <span className="text-xs text-ceda-muted">Running total</span>
          <div className="text-right">
            <span className="font-bold text-ceda-dark">{totalRaw.toFixed(1)}</span>
            <span className="text-ceda-muted text-xs"> / {maxRaw} ({pct}%)</span>
          </div>
        </div>
      )}

      {saveError && (
        <p className="text-xs text-ceda-red flex items-center gap-1.5">
          <AlertCircle size={12} /> {saveError}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || !criteria.length}
          className="btn-secondary btn-sm"
        >
          {saveMutation.isPending ? 'Saving…' : saved ? <><CheckCircle2 size={12} /> Saved</> : 'Save Draft'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending || !allScored}
          className="btn-primary btn-sm"
          title={!allScored ? 'Score all criteria before submitting' : undefined}
        >
          <Star size={12} />
          {submitMutation.isPending ? 'Submitting…' : 'Submit Evaluation'}
        </button>
      </div>
      {!allScored && criteria.length > 0 && (
        <p className="text-xs text-ceda-muted">All {criteria.length} criteria must be scored before submitting.</p>
      )}
    </div>
  )
}

function JudgeEntryCard({ submissionId }) {
  const navigate = useNavigate()
  const { data: cycleRaw, isLoading } = useMyCycle(submissionId)
  const cycleData = cycleRaw?.data ?? cycleRaw
  const myCard = cycleData?.my_scorecard
  const criteria = cycleData?.criteria ?? []
  const locked = myCard?.status === 'locked' || myCard?.status === 'submitted'

  const scoredCount = (myCard?.scores ?? []).length
  const totalPct = myCard?.total_score != null && criteria.length > 0
    ? Math.round((myCard.total_score / criteria.reduce((s, c) => s + parseFloat(c.max_score || 0), 0)) * 100)
    : null

  if (isLoading) {
    return <div className="h-28 rounded-2xl bg-ceda-border/30 animate-pulse" />
  }

  return (
    <div className="rounded-2xl border border-ceda-border bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-ceda-border/60 bg-ceda-surface/30 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-ceda-green-pale flex items-center justify-center flex-shrink-0">
          <Star size={16} className="text-ceda-forest" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ceda-dark">Your Evaluation</p>
          {!locked && criteria.length > 0 && (
            <p className="text-xs text-ceda-muted mt-0.5">
              {scoredCount} of {criteria.length} criteria scored
            </p>
          )}
          {locked && (
            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
              <CheckCircle2 size={11} /> Submitted · {totalPct != null ? `${totalPct}%` : ''} {myCard?.total_score != null ? `(${parseFloat(myCard.total_score).toFixed(1)} pts)` : ''}
            </p>
          )}
        </div>
        {locked && <Lock size={14} className="text-ceda-muted flex-shrink-0" />}
      </div>

      <div className="px-5 py-4 flex items-center justify-between gap-4">
        {locked ? (
          <p className="text-xs text-ceda-muted leading-relaxed flex-1">
            Your scorecard has been submitted and is now locked. The system will auto-decide when all required reviewers complete their evaluation.
          </p>
        ) : (
          <p className="text-xs text-ceda-muted leading-relaxed flex-1">
            Use the dedicated evaluation view to score each criterion with the full submission alongside the scoring panel.
          </p>
        )}
        <button
          onClick={() => navigate(`/evaluate/${submissionId}`)}
          className={cn(
            'btn-sm flex items-center gap-1.5 flex-shrink-0',
            locked ? 'btn-ghost' : 'btn-primary',
          )}
        >
          {locked ? <><ExternalLink size={12} /> View</> : <><Pencil size={12} /> Open Evaluation</>}
        </button>
      </div>

      {!locked && criteria.length > 0 && (
        <div className="px-5 pb-4">
          <div className="h-1.5 bg-ceda-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-ceda-green rounded-full transition-all"
              style={{ width: `${(scoredCount / criteria.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SpecialistInvitePanel({ submissionId }) {
  const qc = useQueryClient()
  const { data: invitesRaw, refetch: refetchInvites } = useQuery({
    queryKey: ['submissions', submissionId, 'specialist-invitations'],
    queryFn: () => submissionsApi.specialistInvites(submissionId),
  })
  const invites = Array.isArray(invitesRaw) ? invitesRaw : invitesRaw?.results ?? []

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ invitee_name: '', invitee_email: '', required_review_count: 1, message: '' })
  const [inviteError, setInviteError] = useState(null)

  const sendMutation = useMutation({
    mutationFn: (body) => submissionsApi.inviteSpecialist(submissionId, body),
    onSuccess: () => { refetchInvites(); setShowForm(false); setForm({ invitee_name: '', invitee_email: '', required_review_count: 1, message: '' }); setInviteError(null) },
    onError: (e) => setInviteError(e?.message ?? 'Failed to send invitation.'),
  })
  const revokeMutation = useMutation({
    mutationFn: (id) => specialistInvitationsApi.revoke(id),
    onSuccess: () => refetchInvites(),
  })
  const resendMutation = useMutation({
    mutationFn: (id) => specialistInvitationsApi.resend(id),
    onSuccess: () => refetchInvites(),
  })

  const statusColors = {
    pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
    accepted:  'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    expired:   'bg-gray-100 text-gray-500 border-gray-200',
    revoked:   'bg-red-50 text-red-600 border-red-200',
  }

  return (
    <div className="space-y-3">
      {invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((inv) => {
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
                    <p className="text-[11px] text-ceda-muted mt-0.5">Required reviews: {inv.required_review_count}</p>
                  )}
                </div>
                {isActive && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => resendMutation.mutate(inv.id)}
                      disabled={resendMutation.isPending}
                      title="Resend invitation email"
                      className="p-1.5 rounded hover:bg-ceda-border/60 text-ceda-muted hover:text-ceda-dark transition-colors"
                    >
                      <Send size={13} />
                    </button>
                    <button
                      onClick={() => revokeMutation.mutate(inv.id)}
                      disabled={revokeMutation.isPending}
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

      {showForm ? (
        <div className="rounded-lg border border-ceda-border p-3 space-y-2.5 bg-ceda-light/40">
          <input
            className="input"
            placeholder="Specialist name"
            value={form.invitee_name}
            onChange={(e) => setForm(f => ({ ...f, invitee_name: e.target.value }))}
          />
          <input
            className="input"
            type="email"
            placeholder="specialist@example.com"
            value={form.invitee_email}
            onChange={(e) => setForm(f => ({ ...f, invitee_email: e.target.value }))}
          />
          <label className="block">
            <span className="text-xs font-semibold text-ceda-muted">Required reviews</span>
            <input
              className="input mt-1"
              type="number"
              min={1}
              max={10}
              value={form.required_review_count}
              onChange={(e) => setForm(f => ({ ...f, required_review_count: Number(e.target.value) || 1 }))}
            />
          </label>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="Personal message (optional)…"
            value={form.message}
            onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
          />
          {inviteError && <p className="text-xs text-ceda-red">{inviteError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => sendMutation.mutate(form)}
              disabled={sendMutation.isPending || !form.invitee_name || !form.invitee_email}
              className="btn-primary flex-1 justify-center"
            >
              {sendMutation.isPending ? 'Sending…' : 'Send Invitation'}
            </button>
            <button onClick={() => { setShowForm(false); setInviteError(null) }} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-ceda-border text-sm text-ceda-muted hover:text-ceda-forest hover:border-ceda-forest transition-colors"
        >
          <UserPlus size={14} />
          Invite Evaluation Committee Member
        </button>
      )}
    </div>
  )
}

export default function EvaluationTab({ submissionId }) {
  const { user } = useAuth()
  const isStaff = isInnovationOfficer(user)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {isStaff && (
          <SectionCard title="Review Cycle Summary" subtitle="All reviewer scorecards and aggregate outcome for this submission">
            <CycleSummaryPanel submissionId={submissionId} />
          </SectionCard>
        )}

        {!isStaff ? (
          <JudgeEntryCard submissionId={submissionId} />
        ) : (
          <SectionCard
            title="Your Scoring (Officer / Admin)"
            subtitle="Score this submission directly. Your scorecard counts toward the required reviewer count."
          >
            <div className="flex items-center justify-between gap-4 py-2">
              <p className="text-xs text-ceda-muted leading-relaxed">
                Open the evaluation view to score this submission against the linked marking criteria.
              </p>
              <button
                onClick={() => window.open(`/evaluate/${submissionId}`, '_self')}
                className="btn-primary btn-sm flex items-center gap-1.5 flex-shrink-0"
              >
                <Pencil size={12} /> Score Submission
              </button>
            </div>
          </SectionCard>
        )}
      </div>

      <div className="space-y-5">
        {isStaff && (
          <SectionCard
            title="Evaluation Committee"
            subtitle="Invite specialists to review this submission via magic link."
          >
            <SpecialistInvitePanel submissionId={submissionId} />
          </SectionCard>
        )}
        <SectionCard title="How it works">
          <div className="space-y-3 text-xs text-ceda-muted leading-relaxed">
            {isStaff ? (
              <>
                <p>The summary panel shows all reviewer scorecards. Once all required reviewers submit, the system calculates an aggregate score and applies the threshold decision.</p>
                <p><strong>Approve / Proceed:</strong> submission moves to the next step.</p>
                <p><strong>Return for Correction:</strong> applicant corrects and resubmits.</p>
                <p><strong>Reject:</strong> request ends.</p>
              </>
            ) : (
              <>
                <p>Score each criterion honestly and independently in the evaluation view.</p>
                <p>Blind scoring may be active — you cannot see other reviewers' scores before submitting.</p>
                <p>Once submitted, your scorecard is locked until a new review cycle opens.</p>
              </>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
