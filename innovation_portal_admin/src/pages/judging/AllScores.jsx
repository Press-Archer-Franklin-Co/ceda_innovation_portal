import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Star, Users } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import SectionCard from '../../components/ui/SectionCard'
import StatCard from '../../components/ui/StatCard'
import DataTable from '../../components/ui/DataTable'
import Textarea from '../../components/ui/Textarea'
import Tag from '../../components/ui/Tag'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { StatsPageSkeleton } from '../../components/ui/PageSkeleton'
import { RadioGroup } from '../../components/ui/Choice'
import { useToast } from '../../components/ui/toast'
import { useT, useI18n } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { cn } from '../../lib/cn'
import { downloadCsv } from '../../lib/csv'
import { EMPTY_CELL } from '../../lib/format'
import { ideaApi, scoresOverview, staffSummary } from '../../lib/api/ideas'

// 3.19 The officer's view of all scores (Figma 105:950 website, 105:1246 phone). Every judge side by side, as
// "Judge 1, 2, 3", never by name. ① Average and pass mark. ② One dot per judge on each criterion, so a big gap
// stands out and is flagged for a panel talk. ③ The table view with the exact numbers. ④ The decision and the
// reason the innovator will read.

const JUDGE_DOTS = ['bg-primary', 'bg-accent', 'bg-info', 'bg-success', 'bg-warning', 'bg-cms']
const dot = (judge) => JUDGE_DOTS[(judge - 1) % JUDGE_DOTS.length]
const fmt = (n) => (n == null ? EMPTY_CELL : Number(n).toFixed(1))

function DotRow({ c }) {
  const t = useT()
  const max = Number(c.max ?? 5)
  const min = max <= 5 ? 1 : 0
  const pos = (v) => `${((v - min) / (max - min)) * 100}%`
  return (
    <div className="grid grid-cols-[minmax(0,140px)_1fr_48px] items-center gap-3 sm:grid-cols-[minmax(0,180px)_1fr_48px_auto]">
      <span className="truncate text-[14px] text-text">{c.name}</span>
      <div className="relative h-5" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {Array.from({ length: max - min + 1 }).map((_, i) => (
          <span key={i} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border" style={{ left: `${(i / (max - min)) * 100}%` }} />
        ))}
        {c.scores.map((s) => (
          <span
            key={s.judge}
            className={cn('absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface', dot(s.judge))}
            style={{ left: pos(s.score) }}
          />
        ))}
      </div>
      <span className="text-right text-[14px] font-bold tabular-nums text-text">{fmt(c.average)}</span>
      <span className="col-span-3 sm:col-span-1">{c.flagged && <Tag tone="amber">{t('scores.talk')}</Tag>}</span>
      <span className="sr-only">{c.scores.map((s) => t('scores.judgeScore', { n: s.judge, score: s.score })).join(', ')}</span>
    </div>
  )
}

function Decision({ id, title }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [choice, setChoice] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  async function record() {
    const next = {}
    if (!choice) next.choice = t('scores.chooseOutcome')
    if (!reason.trim()) next.reason = t('scores.reasonNeeded')
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      if (choice === 'more_info') {
        const replyBy = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
        await ideaApi.sendMessage(id, { body: reason.trim(), reply_by: replyBy })
      } else {
        await ideaApi.finalDecision(id, { decision: choice === 'shortlist' ? 'finalist' : 'rejected', rationale: reason.trim() })
      }
      qc.invalidateQueries({ queryKey: ['ideas'] })
      toast.show({ tone: 'success', title: t('scores.recorded', { title }) })
      setChoice('')
      setReason('')
    } catch (err) {
      toast.show({ tone: 'error', title: t('scores.recordError'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard title={t('scores.decision')}>
      <div className="flex flex-col gap-4">
        <RadioGroup
          name="decision"
          legend={t('scores.decision')}
          variant="cards"
          value={choice}
          onChange={(v) => { setChoice(v); setErrors((e) => ({ ...e, choice: undefined })) }}
          error={errors.choice}
          options={[
            { value: 'shortlist', label: t('scores.shortlist') },
            { value: 'more_info', label: t('scores.moreInfo') },
            { value: 'not_taken', label: t('scores.notTaken') },
          ]}
        />
        <Textarea label={t('scores.reason')} required rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: undefined })) }} error={errors.reason} maxChars={1000} />
        <Button onClick={record} loading={busy} block>{t('scores.record')}</Button>
        <p className="text-[12px] text-muted">{t('scores.toldHow')}</p>
      </div>
    </SectionCard>
  )
}

export default function AllScores() {
  const { id } = useParams()
  const t = useT()
  const { lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const [asTable, setAsTable] = useState(false)
  const overview = useQuery({ queryKey: ['ideas', id, 'scores-overview'], queryFn: () => scoresOverview(id) })
  const idea = useQuery({ queryKey: ['ideas', id, 'summary', lang], queryFn: () => staffSummary(id, lang) })

  useEffect(() => {
    document.title = `${t('scores.title')} · CEDA Innovation`
  }, [t])

  if (overview.isLoading || idea.isLoading) return <StatsPageSkeleton />
  if (overview.isError) return <ErrorState framed title={t('scores.loadError')} message={overview.error?.message} onRetry={overview.refetch} />

  const o = overview.data
  const judges = [...new Set(o.criteria.flatMap((c) => c.scores.map((s) => s.judge)))].sort((a, b) => a - b)
  const flagged = o.criteria.filter((c) => c.flagged)
  const title = idea.data?.title ?? ''

  function download() {
    try {
      downloadCsv(`scores-${idea.data?.reference ?? id}.csv`, [
        [t('scores.criterion'), ...judges.map((j) => t('scores.judge', { n: j })), t('scores.average')],
        ...o.criteria.map((c) => [c.name, ...judges.map((j) => c.scores.find((s) => s.judge === j)?.score ?? ''), c.average == null ? '' : c.average.toFixed(2)]),
        [],
        ...o.comments.map((c) => [t('scores.judge', { n: c.judge }), c.comment]),
      ])
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    }
  }

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={
          <span className="text-[12px] text-muted">
            <Link to="/submissions" className="hover:text-text hover:underline">{t('ideas.list.title')}</Link>
            {' / '}
            <Link to={`/submissions/${id}`} className="hover:text-text hover:underline">{idea.data?.reference}</Link>
            {' / '}{t('scores.crumb')}
          </span>
        }
        title={t('scores.title')}
        subtitle={[title, t('scores.judgesScored', { done: o.judges_scored, n: o.judges_assigned })].filter(Boolean).join(' · ')}
        actions={o.criteria.length > 0 ? <Button variant="secondary" onClick={download}>{t('scores.download')}</Button> : null}
      />

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[minmax(0,1fr)_340px] 2xl:gap-[22px]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
            <StatCard title={t('scores.average')} value={o.average == null ? EMPTY_CELL : Math.round(o.average)} icon={Star} color="green" subtitle={o.pass_mark != null ? t('scores.passMark', { n: o.pass_mark }) : undefined} />
            <StatCard
              title={t('scores.judgesTitle')}
              value={t('scores.ofN', { done: o.judges_scored, n: o.judges_assigned })}
              icon={Users}
              color="indigo"
              subtitle={o.last_scored_at ? t('scores.lastOn', { date: new Date(o.last_scored_at).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' }) }) : undefined}
            />
            <StatCard title={t('scores.disagreement')} value={flagged.length} icon={AlertCircle} color={flagged.length ? 'gold' : 'green'} subtitle={flagged.map((c) => c.name).join(', ') || t('scores.noDisagreement')} />
          </div>

          <SectionCard
            title={t('scores.byCriterion')}
            actions={o.criteria.length > 0 ? (
              <button type="button" onClick={() => setAsTable((v) => !v)} className="text-[13px] font-bold text-primary hover:underline">
                {asTable ? t('scores.viewAsDots') : t('scores.viewAsTable')}
              </button>
            ) : null}
          >
            {o.criteria.length === 0 ? (
              <EmptyState compact title={t('scores.none')} message={t('scores.noneBody')} />
            ) : asTable ? (
              <DataTable
                caption={t('scores.byCriterion')}
                data={o.criteria}
                columns={[
                  { key: 'name', label: t('scores.criterion') },
                  ...judges.map((j) => ({ key: `j${j}`, label: t('scores.judge', { n: j }), width: 80, render: (_, c) => c.scores.find((s) => s.judge === j)?.score ?? EMPTY_CELL })),
                  { key: 'average', label: t('scores.average'), width: 90, render: (v) => <span className="font-bold">{fmt(v)}</span> },
                  { key: 'spread', label: t('scores.spread'), width: 80, render: (v, c) => (c.flagged ? <Tag tone="amber">{v}</Tag> : v) },
                ]}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-[12px] text-muted">{t('scores.dotsHint', { max: o.criteria[0]?.max ?? 5 })}</p>
                <ul className="flex flex-wrap gap-4 text-[12px] text-text" aria-label={t('scores.legend')}>
                  {judges.map((j) => (
                    <li key={j} className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', dot(j))} />{t('scores.judge', { n: j })}</li>
                  ))}
                </ul>
                {o.criteria.map((c) => <DotRow key={c.id} c={c} />)}
              </div>
            )}
          </SectionCard>

          <SectionCard title={t('scores.comments')}>
            {o.comments.length === 0 ? (
              <p className="text-[14px] text-muted">{t('scores.noComments')}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {o.comments.map((c) => (
                  <li key={c.judge} className="flex gap-2.5">
                    <span aria-hidden className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dot(c.judge))} />
                    <span>
                      <span className="block text-[12px] font-bold text-muted">{t('scores.judge', { n: c.judge })}</span>
                      <span className="block whitespace-pre-line text-[14px] text-text">{c.comment}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {can('entries.assign') && (
          <aside className="self-start lg:sticky lg:top-4">
            <Decision id={id} title={title} />
          </aside>
        )}
      </div>
    </div>
  )
}
