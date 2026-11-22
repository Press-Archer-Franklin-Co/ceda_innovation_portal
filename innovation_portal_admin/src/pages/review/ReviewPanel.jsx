import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Lock, Send } from 'lucide-react'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import Tag from '../../components/ui/Tag'
import Avatar from '../../components/ui/Avatar'
import Modal from '../../components/ui/Modal'
import Textarea from '../../components/ui/Textarea'
import Input from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toast'
import { AnswersTab, DocumentsTab, HistoryTab, MessagesTab } from '../../components/ideas/IdeaTabs'
import { useT, useI18n } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { cn } from '../../lib/cn'
import { ideaApi, judgingApi, staffSummary } from '../../lib/api/ideas'

// 3.3, right side: the selected idea. Tabs Idea, Score, Messages, Files, History (Score first). ② The rubric is
// the challenge's own criteria and weights (marking criteria, 3.7), with a live weighted score out of 100 and a
// comment where a criterion asks for one; scores save as a draft. ③ "Internal note" is staff only; "Ask the
// applicant" reaches their dashboard and WhatsApp and sets a reply-by date. ④ A decision needs a short reason the
// applicant will read. Phone: the rubric with large tap targets; decisions stay at the bottom.

const AUTOSAVE_MS = 1200

function scaleOf(c) {
  const lo = Math.ceil(Number(c.min_score ?? 1))
  const hi = Math.floor(Number(c.max_score ?? 5))
  const from = c.max_score <= 5 ? Math.max(1, lo) : lo
  return Array.from({ length: Math.max(0, hi - from + 1) }, (_, i) => from + i)
}

function meaningOf(c, score, lang) {
  const item = Array.isArray(c.score_meanings) && score != null ? c.score_meanings[score - 1] : null
  if (!item) return null
  return typeof item === 'string' ? item : item[lang] || item.en || null
}

function commentNeeded(c, score) {
  if (score == null) return false
  if (Array.isArray(c.comment_required_scores) && c.comment_required_scores.includes(score)) return true
  return c.comment_required_below != null && score < Number(c.comment_required_below)
}

const inDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function ReviewPanel({ id, onDone }) {
  const t = useT()
  const { lang } = useI18n()
  const { can } = useAuth()
  const [tab, setTab] = useState('score')
  const [decision, setDecision] = useState(null)
  const [askOpen, setAskOpen] = useState(false)
  const askButtonRef = useRef(null)
  const askRef = useRef(null)
  const approveRef = useRef(null)
  const rejectRef = useRef(null)

  const summary = useQuery({ queryKey: ['ideas', id, 'summary', lang], queryFn: () => staffSummary(id, lang) })
  const cycle = useQuery({ queryKey: ['ideas', id, 'cycle', lang], queryFn: () => judgingApi.cycle(id, lang) })
  const s = summary.data
  const scoring = useScoring(id, cycle.data)

  if (summary.isLoading) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-48" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (summary.isError || !s) {
    return <ErrorState title={t('ideas.loadError')} message={summary.error?.status === 404 ? t('ideas.notFound') : summary.error?.message} onRetry={summary.refetch} retrying={summary.isFetching} />
  }

  const counts = s.counts ?? {}
  const actions = s.allowed_actions ?? []
  const canDecide = can('entries.assign')
  const canApprove = canDecide && (!actions.length || actions.includes('approve'))
  const canReject = canDecide && (actions.includes('reject') || actions.includes('screen_out'))
  const current = Math.max(0, (s.steps ?? []).findIndex((st) => st.state === 'current'))
  const nextStep = s.steps?.[current + 1]?.title
  const who = [s.innovator?.name, s.innovator?.district].filter(Boolean).join(' · ')
  const tabs = [
    { key: 'idea', label: t('review.tab.idea') },
    { key: 'score', label: t('review.tab.score') },
    { key: 'messages', label: t('ideas.tab.messages'), count: counts.messages ?? undefined },
    { key: 'files', label: t('review.tab.files'), count: counts.documents ?? undefined },
    { key: 'history', label: t('ideas.tab.history') },
  ]

  return (
    <section aria-labelledby="review-title" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 lg:p-5 2xl:p-6">
      <header className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2">
          {s.program?.title && <Tag tone="orange">{s.program.title}</Tag>}
          {s.reference && <Tag tone="neutral">{s.reference}</Tag>}
        </p>
        <h2 id="review-title" className="font-heading text-[20px] font-extrabold leading-tight text-text lg:text-[26px]">
          <Link to={`/submissions/${id}`} className="hover:underline">{s.title}</Link>
        </h2>
        {who && (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            {s.innovator?.name && <Avatar name={s.innovator.name} size="xs" decorative />}
            {who}
          </p>
        )}
      </header>

      <div className="hidden lg:block">
        <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('ideas.tabsLabel')} idPrefix="review" />
      </div>

      {/* Phone: the rubric first, the idea's tabs below it. */}
      <div role="tabpanel" id={`review-panel-${tab}`} aria-labelledby={`review-tab-${tab}`} className="min-w-0 hidden lg:block">
        {tab === 'idea' && <AnswersTab summary={s} />}
        {tab === 'score' && <ScoreCard scoring={scoring} cycle={cycle} />}
        {tab === 'messages' && <MessagesTab id={id} askRef={askRef} />}
        {tab === 'files' && <DocumentsTab id={id} />}
        {tab === 'history' && <HistoryTab id={id} />}
      </div>
      <div className="lg:hidden"><ScoreCard scoring={scoring} cycle={cycle} /></div>

      {tab === 'score' && (
        <div className="hidden lg:grid gap-3 lg:grid-cols-2">
          <NoteBox id={id} />
          <AskBox id={id} ref={askRef} />
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface px-4 pt-3 pb-3 lg:static lg:mx-0 lg:px-0 lg:pb-0">
        {canReject && (
          <Button ref={rejectRef} variant="danger" className="hidden lg:inline-flex" onClick={() => setDecision('reject')}>{t('review.notForward')}</Button>
        )}
        <span className="hidden flex-1 lg:block" />
        <Button ref={askButtonRef} variant="secondary" className="flex-1 lg:flex-none" onClick={() => {
          if (window.matchMedia?.('(min-width: 1024px)').matches) { setTab('score'); setTimeout(() => askRef.current?.focus(), 50) } else setAskOpen(true)
        }}>
          <span className="lg:hidden">{t('review.ask')}</span><span className="hidden lg:inline">{t('review.askMore')}</span>
        </Button>
        {canApprove && (
          <Button ref={approveRef} className="flex-1 lg:flex-none" onClick={() => setDecision('approve')}>
            {nextStep ? t('review.sendTo', { step: nextStep }) : t('ideas.moveNext')}
            <ArrowRight size={16} aria-hidden />
          </Button>
        )}
      </div>

      {/* Phone: "Ask" opens the question in a dialog. */}
      <Modal open={askOpen} onClose={() => setAskOpen(false)} triggerRef={askButtonRef} title={t('review.askApplicant')} closeOnBackdrop={false}>
        <AskBox id={id} onSent={() => setAskOpen(false)} />
      </Modal>

      <DecisionDialog
        open={Boolean(decision)}
        action={decision}
        onClose={() => setDecision(null)}
        triggerRef={decision === 'reject' ? rejectRef : approveRef}
        id={id}
        title={s.title}
        nextStep={nextStep}
        scoring={scoring}
        rejectAction={actions.includes('reject') ? 'reject' : 'screen_out'}
        onDone={onDone}
      />
    </section>
  )
}

/** The officer's own scorecard for the current step: scores, comments, draft autosave and the weighted total. */
function useScoring(id, data) {
  const { lang } = useI18n()
  const [scores, setScores] = useState({})
  const [comments, setComments] = useState({})
  const [save, setSave] = useState('idle')
  const loaded = useRef(false)
  const dirty = useRef(false)
  const criteria = useMemo(() => [...(data?.criteria ?? [])].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0)), [data?.criteria])
  const mine = data?.my_scorecard
  const locked = ['submitted', 'locked', 'completed'].includes(mine?.status)
  const canScore = Boolean(data) && data.can_score !== false && !locked && criteria.length > 0

  useEffect(() => {
    if (!data || loaded.current) return
    loaded.current = true
    const sc = {}
    const cm = {}
    for (const item of mine?.scores ?? []) {
      sc[item.criterion_id] = Number(item.raw_score)
      if (item.comment) cm[item.criterion_id] = item.comment
    }
    setScores(sc)
    setComments(cm)
  }, [data, mine])

  const payload = () => ({
    scores: criteria.filter((c) => scores[c.id] != null).map((c) => ({ criterion_id: c.id, type: c.type ?? 'library', raw_score: scores[c.id], comment: comments[c.id] ?? '' })),
    overall_comment: mine?.overall_comment ?? '',
  })

  useEffect(() => {
    if (!dirty.current || !canScore) return
    if (criteria.some((c) => commentNeeded(c, scores[c.id]) && !(comments[c.id] ?? '').trim())) { setSave('needsComment'); return }
    const timer = setTimeout(async () => {
      setSave('saving')
      try { await judgingApi.save(id, payload()); setSave('saved') } catch { setSave('error') }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [scores, comments]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0)
  const scored = criteria.filter((c) => scores[c.id] != null).length
  const weighted = totalWeight && scored
    ? (criteria.reduce((sum, c) => (scores[c.id] == null ? sum : sum + (scores[c.id] / Number(c.max_score || 5)) * Number(c.weight || 0)), 0) / totalWeight) * 100
    : null
  const complete = criteria.length > 0 && scored === criteria.length && !criteria.some((c) => commentNeeded(c, scores[c.id]) && !(comments[c.id] ?? '').trim())

  return {
    criteria, scores, comments, save, locked, canScore, totalWeight, weighted, scored, complete, lang,
    setScore: (cid, v) => { dirty.current = true; setScores((p) => ({ ...p, [cid]: v })) },
    setComment: (cid, v) => { dirty.current = true; setComments((p) => ({ ...p, [cid]: v })) },
    submit: async () => { await judgingApi.save(id, payload()); await judgingApi.submit(id, payload()) },
  }
}

function ScoreCard({ scoring, cycle }) {
  const t = useT()
  const { criteria, scores, comments, save, locked, canScore, totalWeight, weighted, lang } = scoring
  if (cycle.isLoading) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
  if (cycle.isError) return <ErrorState compact title={t('judging.loadError')} message={cycle.error?.message} onRetry={cycle.refetch} />
  if (!criteria.length) return <EmptyState compact title={t('review.noRubric')} message={t('review.noRubricBody')} />

  return (
    <div className="flex flex-col gap-3">
      {!canScore && <p className="rounded-control bg-surface2 px-3 py-2 text-[13px] text-muted">{locked ? t('review.scoresSent') : t('review.cannotScore')}</p>}
      <ol className="flex flex-col gap-3 lg:gap-2.5">
        {criteria.map((c) => {
          const weight = totalWeight ? Math.round((Number(c.weight || 0) / totalWeight) * 100) : null
          const value = scores[c.id]
          const meaning = meaningOf(c, value, lang)
          const needs = commentNeeded(c, value)
          return (
            <li key={c.id} id={`criterion-${c.id}`} className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="min-w-0">
                  <p id={`crit-${c.id}`} className="text-[15px] font-bold text-text lg:text-[14px]">{c.name}</p>
                  {weight != null && <p className="hidden text-[12px] text-muted lg:block">{t('review.weight', { n: weight })}</p>}
                </div>
                <div role="radiogroup" aria-labelledby={`crit-${c.id}`} className="grid grid-flow-col auto-cols-fr gap-2 lg:flex lg:gap-1.5">
                  {scaleOf(c).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={value === n}
                      disabled={!canScore}
                      onClick={() => scoring.setScore(c.id, n)}
                      className={cn(
                        'h-11 min-w-[44px] rounded-control border text-[15px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:h-9 lg:w-9 lg:min-w-0 lg:text-[14px]',
                        value === n ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text hover:bg-surface2',
                        !canScore && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {meaning && <p className="text-[12px] text-muted">{meaning}</p>}
              {(needs || comments[c.id]) && canScore && (
                <Textarea label={t('review.comment')} hint={needs ? t('review.commentNeeded') : undefined} required={needs} rows={2}
                  value={comments[c.id] ?? ''} onChange={(e) => scoring.setComment(c.id, e.target.value)} />
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex items-center justify-between rounded-card bg-surface2 px-4 py-3 lg:py-4">
        <span className="text-[14px] font-bold text-text">{t('review.weighted')}</span>
        <span className="flex items-baseline gap-3">
          <span className="text-[12px] text-muted" aria-live="polite">
            {save === 'saving' ? t('judging.saving') : save === 'saved' ? <span className="inline-flex items-center gap-1"><Check size={13} aria-hidden />{t('judging.draftSaved')}</span> : save === 'error' ? <span className="text-danger">{t('judging.saveError')}</span> : save === 'needsComment' ? <span className="text-danger">{t('judging.saveNeedsComment')}</span> : null}
          </span>
          <span className="font-heading text-[18px] font-extrabold text-success tabular-nums lg:text-[20px]">{weighted == null ? '0' : Math.round(weighted)} / 100</span>
        </span>
      </div>
    </div>
  )
}

/** ③ Staff only: never reaches the applicant. */
function NoteBox({ id }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function add() {
    if (!text.trim()) { setError(t('ideas.noteNeeded')); return }
    setBusy(true)
    try {
      await ideaApi.addNote(id, { note: text.trim() })
      setText('')
      qc.invalidateQueries({ queryKey: ['ideas', id] })
      toast.show({ tone: 'success', title: t('review.noteSaved') })
    } catch (err) {
      setError(err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border p-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-text"><Lock size={14} aria-hidden />{t('review.internalNote')}</p>
      <Textarea aria-label={t('review.internalNote')} hint={t('ideas.notesPrivate')} rows={3} value={text} error={error || undefined}
        onChange={(e) => { setText(e.target.value); setError('') }} />
      <Button variant="secondary" size="sm" className="self-end" onClick={add} loading={busy}>{t('ideas.saveNote')}</Button>
    </div>
  )
}

/** ③ Goes to the applicant's dashboard and WhatsApp, with a reply-by date. */
function AskBox({ id, ref, onSent }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [replyBy, setReplyBy] = useState(inDays(7))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    if (!body.trim()) { setError(t('ideas.messageNeeded')); return }
    setBusy(true)
    try {
      await ideaApi.sendMessage(id, { body: body.trim(), ...(replyBy ? { reply_by: replyBy } : {}) })
      setBody('')
      qc.invalidateQueries({ queryKey: ['ideas', id] })
      toast.show({ tone: 'success', title: t('ideas.messageSent') })
      onSent?.()
    } catch (err) {
      setError(err?.data?.errors?.body?.[0] ?? err?.data?.errors?.reply_by?.[0] ?? err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-card border border-accent bg-accent-soft/40 p-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-accent-ink"><Send size={14} aria-hidden />{t('review.askApplicant')}</p>
      <Textarea ref={ref} aria-label={t('review.askApplicant')} hint={t('review.askHint')} rows={3} maxChars={2000} value={body} error={error || undefined}
        onChange={(e) => { setBody(e.target.value); setError('') }} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Input type="date" label={t('ideas.askReplyBy')} value={replyBy} min={inDays(1)} onChange={(e) => setReplyBy(e.target.value)} className="w-[170px]" />
        <Button size="sm" onClick={send} loading={busy}>{t('ideas.sendQuestion')}</Button>
      </div>
    </div>
  )
}

/** ④ Send on, or not taken forward: always with a short reason the applicant will read. */
function DecisionDialog({ open, action, onClose, triggerRef, id, title, nextStep, scoring, rejectAction, onDone }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])
  const approve = action === 'approve'
  // Scores the officer has started are sent with the decision; a half-scored rubric has to be finished first.
  const unfinished = approve && scoring.canScore && scoring.scored > 0 && !scoring.complete

  async function decide() {
    if (!reason.trim()) { setError(t('ideas.reasonNeeded')); return }
    setBusy(true)
    try {
      if (approve && scoring.canScore && scoring.complete) await scoring.submit()
      await ideaApi.workflowAction(id, { action: approve ? 'approve' : rejectAction, comment: reason.trim() })
      qc.invalidateQueries({ queryKey: ['ideas'] })
      toast.show({ tone: 'success', title: approve ? t('review.sent', { title }) : t('review.notForwardDone', { title }) })
      onClose()
      onDone?.()
    } catch (err) {
      setError(err?.data?.errors?.comment?.[0] ?? err?.data?.message ?? err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} closeOnBackdrop={false}
      title={approve ? (nextStep ? t('review.sendTo', { step: nextStep }) : t('ideas.moveOne')) : t('review.notForwardTitle', { title })}
      description={t('review.reasonApplicant')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant={approve ? 'primary' : 'danger'} onClick={decide} loading={busy} disabled={unfinished}>{approve ? t('review.confirmSend') : t('review.notForward')}</Button></>}>
      {unfinished && <p role="alert" className="mb-3 rounded-control bg-warning-soft px-3 py-2 text-[13px] text-warning">{t('review.finishScores')}</p>}
      <Textarea label={t('ideas.reason')} hint={t('ideas.reasonHint')} required rows={3} maxChars={500} value={reason} error={error || undefined}
        onChange={(e) => { setReason(e.target.value); setError('') }} />
    </Modal>
  )
}

