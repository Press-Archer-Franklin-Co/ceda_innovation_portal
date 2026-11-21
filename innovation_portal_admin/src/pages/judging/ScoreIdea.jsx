import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import Textarea from '../../components/ui/Textarea'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import { DetailPageSkeleton } from '../../components/ui/PageSkeleton'
import { Checkbox } from '../../components/ui/Choice'
import { useToast } from '../../components/ui/toast'
import { AnswersTab, DocumentsTab } from '../../components/ideas/IdeaTabs'
import { useT, useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { judgingApi, judgingList, staffSummary } from '../../lib/api/ideas'
import { DeclareConflict } from './DeclareConflict'

// 3.18 Scoring an idea (Figma 104:1383 website, 104:1745 phone). ① No conflict of interest is confirmed (or one
// declared, and the idea goes to another judge) before any score. ② The idea on the left, the rubric on the
// right. ③ Each criterion on its scale from marking criteria (3.7), with the meaning of the chosen score; a
// comment is required where the criterion says so (for example 1 or 5). ④ The weighted total updates live.
// Scores save as a draft while the judge works, until "Submit scores".

const AUTOSAVE_MS = 1200

function scaleOf(c) {
  const lo = Math.ceil(Number(c.min_score ?? 1))
  const hi = Math.floor(Number(c.max_score ?? 5))
  const from = c.max_score <= 5 ? Math.max(1, lo) : lo
  return Array.from({ length: Math.max(0, hi - from + 1) }, (_, i) => from + i)
}

function meaningOf(c, score, lang) {
  const list = c.score_meanings
  if (!Array.isArray(list) || score == null) return null
  const item = list[score - 1]
  if (!item) return null
  return typeof item === 'string' ? item : item[lang] || item.en || null
}

function commentNeeded(c, score) {
  if (score == null) return false
  if (Array.isArray(c.comment_required_scores) && c.comment_required_scores.includes(score)) return true
  return c.comment_required_below != null && score < Number(c.comment_required_below)
}

export default function ScoreIdea() {
  const { id } = useParams()
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const declareRef = useRef(null)

  const cycle = useQuery({ queryKey: ['ideas', id, 'cycle', lang], queryFn: () => judgingApi.cycle(id, lang) })
  const idea = useQuery({ queryKey: ['ideas', id, 'summary', lang], queryFn: () => staffSummary(id, lang) })
  const list = useQuery({ queryKey: ['ideas', 'judging'], queryFn: judgingList })
  const row = list.data?.find((r) => r.id === id)

  const [tab, setTab] = useState('idea')
  const [scores, setScores] = useState({})
  const [comments, setComments] = useState({})
  const [openComment, setOpenComment] = useState({})
  const [overall, setOverall] = useState('')
  const [noConflict, setNoConflict] = useState(false)
  const [declaring, setDeclaring] = useState(null)
  const [save, setSave] = useState('idle')
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const loaded = useRef(false)
  const dirty = useRef(false)

  const data = cycle.data
  const criteria = useMemo(() => [...(data?.criteria ?? [])].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0)), [data?.criteria])
  const mine = data?.my_scorecard
  const locked = ['submitted', 'locked', 'completed'].includes(mine?.status) || row?.status === 'done'

  // Load the saved draft once.
  useEffect(() => {
    if (!data || loaded.current) return
    loaded.current = true
    const s = {}
    const c = {}
    for (const item of mine?.scores ?? []) {
      s[item.criterion_id] = Number(item.raw_score)
      if (item.comment) c[item.criterion_id] = item.comment
    }
    setScores(s)
    setComments(c)
    setOverall(mine?.overall_comment ?? '')
    if (mine || row?.conflict === 'confirmed_none' || row?.status === 'in_progress') setNoConflict(true)
  }, [data, mine, row])

  useEffect(() => {
    if (idea.data?.title) document.title = `${idea.data.title} · CEDA Innovation`
  }, [idea.data?.title])

  const payload = () => ({
    scores: criteria
      .filter((c) => scores[c.id] != null)
      .map((c) => ({ criterion_id: c.id, type: c.type ?? 'library', raw_score: scores[c.id], comment: comments[c.id] ?? '' })),
    overall_comment: overall,
  })

  // Draft autosave, a moment after the last change.
  useEffect(() => {
    if (!dirty.current || locked) return
    const timer = setTimeout(async () => {
      setSave('saving')
      try {
        await judgingApi.save(id, payload())
        setSave('saved')
      } catch {
        setSave('error')
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [scores, comments, overall]) // eslint-disable-line react-hooks/exhaustive-deps

  const change = (fn) => { dirty.current = true; fn() }

  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0)
  const scoredCount = criteria.filter((c) => scores[c.id] != null).length
  const weighted = totalWeight
    ? criteria.reduce((sum, c) => (scores[c.id] == null ? sum : sum + (scores[c.id] / Number(c.max_score || 5)) * Number(c.weight || 0)), 0) / totalWeight * 100
    : null

  async function confirmNoConflict(checked) {
    setNoConflict(checked)
    if (checked && row?.assignment_id && row.status === 'assigned') {
      judgingApi.accept(row.assignment_id).catch(() => {})
    }
  }

  async function submit() {
    const next = {}
    for (const c of criteria) {
      if (scores[c.id] == null) next[c.id] = t('judging.scoreNeeded')
      else if (commentNeeded(c, scores[c.id]) && !(comments[c.id] ?? '').trim()) next[c.id] = t('judging.commentNeeded')
    }
    setErrors(next)
    if (Object.keys(next).length) {
      document.getElementById(`criterion-${Object.keys(next)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSending(true)
    try {
      await judgingApi.save(id, payload())
      await judgingApi.submit(id, payload())
      qc.invalidateQueries({ queryKey: ['ideas'] })
      toast.show({ tone: 'success', title: t('judging.sent', { title: idea.data?.title ?? '' }) })
      navigate('/judging')
    } catch (err) {
      toast.show({ tone: 'error', title: t('judging.sendError'), body: err?.message })
    } finally {
      setSending(false)
    }
  }

  if (cycle.isLoading || idea.isLoading) return <DetailPageSkeleton />
  if (cycle.isError) return <ErrorState framed title={t('judging.loadError')} message={cycle.error?.message} onRetry={cycle.refetch} />

  const ideaData = idea.data
  const canScore = noConflict && !locked && data?.can_score !== false

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={
          <span className="text-[12px] text-muted">
            <Link to="/judging" className="hover:text-text hover:underline">{t('judging.title')}</Link> / {ideaData?.reference}
          </span>
        }
        title={ideaData?.title ?? t('judging.scoreTitle')}
        subtitle={[ideaData?.program?.title, row?.program?.title && !ideaData?.program ? row.program.title : null].filter(Boolean).join(' · ') || undefined}
        actions={
          locked ? (
            <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-success"><Check size={16} aria-hidden />{t('judging.sentState')}</span>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-muted" aria-live="polite">
                {save === 'saving' ? t('judging.saving') : save === 'saved' ? <span className="inline-flex items-center gap-1"><Check size={14} aria-hidden />{t('judging.draftSaved')}</span> : save === 'error' ? <span className="text-danger">{t('judging.saveError')}</span> : null}
              </span>
              <Button onClick={submit} loading={sending} disabled={!canScore || criteria.length === 0}>{t('judging.submit')}</Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[minmax(0,1fr)_440px] 2xl:gap-[22px]">
        <div className="min-w-0">
          <Tabs
            tabs={[{ key: 'idea', label: t('judging.tabIdea') }, { key: 'documents', label: t('ideas.tab.documents') }]}
            active={tab}
            onChange={setTab}
            label={t('judging.ideaTabs')}
            idPrefix="score"
          />
          <div className="pt-3">
            {tab === 'idea' ? (idea.isError ? <ErrorState compact title={t('ideas.loadError')} onRetry={idea.refetch} /> : <AnswersTab summary={ideaData} />) : <DocumentsTab id={id} />}
          </div>
        </div>

        <section aria-label={t('judging.rubric')} className="flex flex-col gap-4 self-start rounded-card border border-border bg-surface p-4 lg:sticky lg:top-4">
          {!locked && (
            <div className={cn('rounded-control px-3 py-2.5', noConflict ? 'bg-success-soft' : 'bg-warning-soft')}>
              <Checkbox checked={noConflict} onChange={(e) => confirmNoConflict(e.target.checked)} label={t('judging.noConflict')} />
              <button
                ref={declareRef}
                type="button"
                onClick={() => setDeclaring({ title: ideaData?.title ?? '', assignment_id: row?.assignment_id })}
                disabled={!row?.assignment_id}
                className="ml-7 text-[13px] font-bold text-primary hover:underline disabled:text-muted"
              >
                {t('judging.declareInstead')}
              </button>
            </div>
          )}

          {criteria.length === 0 ? (
            <EmptyState compact title={t('judging.noCriteria')} message={t('judging.noCriteriaBody')} />
          ) : (
            criteria.map((c) => {
              const score = scores[c.id]
              const meaning = meaningOf(c, score, lang)
              const needComment = commentNeeded(c, score)
              const showComment = needComment || openComment[c.id] || Boolean(comments[c.id])
              const weight = totalWeight ? Math.round((Number(c.weight || 0) / totalWeight) * 100) : null
              return (
                <fieldset key={c.id} id={`criterion-${c.id}`} className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0" disabled={!canScore}>
                  <legend className="flex w-full items-baseline justify-between gap-3 pb-2">
                    <span className="text-[15px] font-bold text-text">{c.name}</span>
                    {weight != null && <span className="text-[12px] text-muted">{t('judging.weight', { n: weight })}</span>}
                  </legend>
                  {c.description && <p className="-mt-1 text-[12px] text-muted">{c.description}</p>}
                  <div role="radiogroup" aria-label={c.name} className="flex flex-wrap gap-2">
                    {scaleOf(c).map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={score === n}
                        onClick={() => change(() => { setScores((s) => ({ ...s, [c.id]: n })); setErrors((e) => ({ ...e, [c.id]: undefined })) })}
                        className={cn(
                          'h-9 min-w-[44px] flex-1 rounded-control border text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60',
                          score === n ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-text hover:bg-surface2',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12px] text-muted">{score == null ? t('judging.notScored') : meaning ? `${score} · ${meaning}` : t('judging.scoredAs', { n: score })}</p>
                  {showComment ? (
                    <Textarea
                      label={needComment ? t('judging.commentRequired') : t('judging.comment')}
                      required={needComment}
                      rows={2}
                      value={comments[c.id] ?? ''}
                      onChange={(e) => change(() => { setComments((m) => ({ ...m, [c.id]: e.target.value })); setErrors((x) => ({ ...x, [c.id]: undefined })) })}
                      error={errors[c.id]}
                    />
                  ) : (
                    <>
                      {errors[c.id] && <p role="alert" className="text-[12px] font-bold text-danger">{errors[c.id]}</p>}
                      {canScore && (
                        <button type="button" onClick={() => setOpenComment((o) => ({ ...o, [c.id]: true }))} className="self-start text-[12px] font-bold text-primary hover:underline">
                          {t('judging.addComment')}
                        </button>
                      )}
                    </>
                  )}
                </fieldset>
              )
            })
          )}

          {criteria.length > 0 && (
            <>
              <Textarea label={t('judging.overall')} optional rows={3} value={overall} onChange={(e) => change(() => setOverall(e.target.value))} disabled={!canScore} />
              <div className="flex items-baseline justify-between gap-3 rounded-control bg-surface2 px-4 py-3" aria-live="polite">
                <span className="text-[14px] font-bold text-text">{t('judging.totalSoFar')}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-heading text-[22px] font-extrabold text-text">{weighted == null || scoredCount === 0 ? '0' : Math.round(weighted)} / 100</span>
                  <span className="text-[12px] text-muted">{t('judging.countOf', { n: scoredCount, total: criteria.length })}</span>
                </span>
              </div>
            </>
          )}
        </section>
      </div>

      <DeclareConflict
        idea={declaring}
        triggerRef={declareRef}
        onClose={() => setDeclaring(null)}
        onDone={() => {
          setDeclaring(null)
          qc.invalidateQueries({ queryKey: ['ideas', 'judging'] })
          navigate('/judging')
        }}
      />
    </div>
  )
}
