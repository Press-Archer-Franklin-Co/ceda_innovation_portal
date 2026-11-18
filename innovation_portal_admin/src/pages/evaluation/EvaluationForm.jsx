import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Send } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import ErrorState from '../../components/ui/ErrorState'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../lib/auth/AuthContext'
import { useEvaluationRubric, useSaveEvaluation, useSubmitEvaluation } from '../../lib/queries/evaluations'
import { useSubmission, useSubmissionEvaluations } from '../../lib/queries/submissions'

export default function EvaluationForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: submission, isLoading: submissionLoading, error: submissionError, refetch } = useSubmission(id)
  const { data: rubric, isLoading: rubricLoading, error: rubricError } = useEvaluationRubric(id)
  const { data: evaluationsData } = useSubmissionEvaluations(id)
  const saveEvaluation = useSaveEvaluation()
  const submitEvaluation = useSubmitEvaluation()
  const [scores, setScores] = useState({})
  const [comment, setComment] = useState('')
  const [actionError, setActionError] = useState(null)
  const [message, setMessage] = useState(null)

  const evaluations = evaluationsData?.items ?? []
  const mySheet = useMemo(() => {
    return evaluations.find((item) => {
      const judgeId = typeof item.judge === 'string' ? item.judge : item.judge?.id
      return judgeId === user?.id
    })
  }, [evaluations, user])

  useEffect(() => {
    const nextScores = {}
    for (const criterion of mySheet?.criterion_scores ?? []) {
      nextScores[criterion.criterion] = {
        raw_score: criterion.raw_score,
        comment: criterion.comment || '',
      }
    }
    setScores(nextScores)
    setComment(mySheet?.overall_comment || '')
  }, [mySheet])

  const criteria = rubric?.criteria ?? []
  const readyToSubmit = criteria.length > 0 && criteria.every((criterion) => {
    const raw = scores[criterion.id]?.raw_score
    return raw !== undefined && raw !== '' && raw !== null
  })

  const persist = async (mode) => {
    setActionError(null)
    setMessage(null)
    try {
      const payload = {
        criterion_scores: criteria.map((criterion) => ({
          criterion: criterion.id,
          raw_score: Number(scores[criterion.id]?.raw_score ?? 0),
          comment: scores[criterion.id]?.comment || '',
        })),
        comment,
      }
      await saveEvaluation.mutateAsync({ subId: id, body: payload })
      if (mode === 'submit') {
        await submitEvaluation.mutateAsync({ subId: id, body: {} })
        setMessage('Evaluation submitted and assignment completed.')
      } else {
        setMessage('Evaluation draft saved.')
      }
      refetch()
    } catch (err) {
      setActionError(err.message)
    }
  }

  if (submissionLoading || rubricLoading) {
    return <div className="h-32 rounded-xl bg-ceda-border/30 animate-pulse" />
  }

  if (submissionError || rubricError) {
    return <ErrorState message={(submissionError || rubricError)?.message} onRetry={refetch} />
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={submission?.title || 'Evaluation'}
        subtitle={submission?.reference_number || id}
        back={
          <button onClick={() => navigate('/evaluations')} className="btn-ghost btn-sm -ml-2">
            <ArrowLeft size={14} /> Evaluations
          </button>
        }
        badge={<StatusPill status={mySheet?.status || mySheet?.latest_score_status || 'pending'} />}
        actions={
          <>
            <button className="btn-secondary btn-sm" disabled={saveEvaluation.isPending} onClick={() => persist('save')}>
              <Save size={14} /> Save Draft
            </button>
            <button className="btn-primary btn-sm" disabled={submitEvaluation.isPending || !readyToSubmit} onClick={() => persist('submit')}>
              <Send size={14} /> Submit Evaluation
            </button>
          </>
        }
      />

      {(actionError || message) && (
        <div className={`mb-5 rounded-xl px-4 py-3 text-sm ${actionError ? 'border border-ceda-red/20 bg-ceda-red-pale text-ceda-red' : 'border border-ceda-green/20 bg-ceda-green-pale text-ceda-forest'}`}>
          {actionError || message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <SectionCard title="Rubric" subtitle={rubric?.title}>
            <div className="space-y-4">
              {criteria.map((criterion) => (
                <div key={criterion.id} className="rounded-xl border border-ceda-border px-4 py-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-ceda-dark">{criterion.name}</p>
                      <p className="text-xs text-ceda-muted mt-1">{criterion.description || `Weight ${criterion.weight}%`}</p>
                    </div>
                    <div className="text-xs text-ceda-muted text-right">
                      <p>Range {criterion.min_score} - {criterion.max_score}</p>
                      <p>Weight {criterion.weight}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3">
                    <div>
                      <label className="label">Score</label>
                      <input
                        className="input"
                        type="number"
                        min={criterion.min_score}
                        max={criterion.max_score}
                        value={scores[criterion.id]?.raw_score ?? ''}
                        onChange={(e) => setScores(prev => ({
                          ...prev,
                          [criterion.id]: { ...prev[criterion.id], raw_score: e.target.value },
                        }))}
                      />
                    </div>
                    <div>
                      <label className="label">Comment</label>
                      <textarea
                        className="input min-h-24 resize-y"
                        value={scores[criterion.id]?.comment ?? ''}
                        onChange={(e) => setScores(prev => ({
                          ...prev,
                          [criterion.id]: { ...prev[criterion.id], comment: e.target.value },
                        }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Evaluation Summary">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ceda-muted">Existing status</span>
                <StatusPill status={mySheet?.status || 'pending'} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ceda-muted">Criteria scored</span>
                <span className="font-semibold text-ceda-dark">
                  {criteria.filter((criterion) => scores[criterion.id]?.raw_score !== '' && scores[criterion.id]?.raw_score != null).length} / {criteria.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ceda-muted">Current total</span>
                <span className="font-semibold text-ceda-dark">{mySheet?.total_score ?? 'Draft'}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Overall Comment">
            <textarea
              className="input min-h-40 resize-y"
              placeholder="Overall assessment for this submission"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
