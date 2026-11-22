import { useEffect, useMemo, useState } from 'react'
import { ListChecks } from 'lucide-react'
import ChartCard from '../../components/analytics/ChartCard'
import { baseOptions, tokenColor } from '../../components/analytics/chartTheme'
import { SelectControl } from '../../components/ui/Select'
import { InputControl } from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { useI18n, useT } from '../../i18n/context'
import { useFormResponseAnalytics } from '../../lib/queries/analytics'
import { usePrograms } from '../../lib/queries/programs'
import { pickText } from '../../lib/admin/roles'

// 3.2 Reports, Form answers tab (Figma 24:715 website, 24:1029 phone). How people filled in one challenge's form:
// four numbers, how many answers were given, which open questions people skip, and the choices they picked.
// Same filter row look, chart cards and "View as table" as the Numbers tab. Colours come from the tokens.

const TEXT_TYPES = new Set(['text', 'textarea', 'rich_text', 'email', 'phone', 'url', 'number', 'date'])
const CHOICE_TYPES = new Set(['select', 'radio', 'checkbox', 'multiselect', 'multi_select'])
const STATUSES = ['submitted', 'under_review', 'returned', 'rejected', 'approved']
const SERIES = ['primary', 'accent', 'info', 'success', 'warning', 'muted']
const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])

function fieldsOf(data) {
  return (data?.sections ?? []).flatMap((section) => (section.fields ?? []).map((f) => {
    const answered = f.answered_count ?? 0
    const missing = f.missing_count ?? 0
    return { ...f, section: section.section, answered, missing, skipRate: Math.round((missing / Math.max(answered + missing, 1)) * 100) }
  }))
}

function Field({ label, children, className }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <span className="text-[11px] font-bold text-muted">{label}</span>
      {children}
    </label>
  )
}

function Figure({ label, value }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3.5">
      <dt className="text-[12px] font-bold text-muted">{label}</dt>
      <dd className="font-heading text-[26px] font-bold leading-tight text-text tabular-nums">{value}</dd>
    </div>
  )
}

function ChoiceCard({ field, query }) {
  const t = useT()
  const options = (field.options ?? []).slice(0, 6)
  const config = useMemo(() => ({
    type: 'bar',
    data: {
      labels: options.map((o) => o.label),
      datasets: [{ data: options.map((o) => o.count ?? 0), backgroundColor: options.map((_, i) => tokenColor(SERIES[i % SERIES.length], 0.85)), borderRadius: 4, maxBarThickness: 18 }],
    },
    options: baseOptions({ horizontal: true, tooltip: { callbacks: { label: (item) => t('fa.choiceTip', { count: item.raw, pct: options[item.dataIndex]?.percentage ?? 0 }) } } }),
  }), [options, t])
  return (
    <ChartCard
      title={field.label || field.key}
      subtitle={t('fa.answeredBy', { pct: field.answer_rate ?? 0 })}
      query={query}
      chart={{ config, label: t('fa.choiceLabel', { name: field.label || field.key }), height: Math.max(120, options.length * 30) }}
      table={{
        columns: [{ key: 'option', label: t('fa.col.option') }, { key: 'count', label: t('fa.col.people'), align: 'right' }, { key: 'pct', label: t('fa.col.share'), align: 'right' }],
        rows: options.map((o) => ({ id: String(o.value), option: o.label, count: o.count ?? 0, pct: `${o.percentage ?? 0}%` })),
      }}
    />
  )
}

export default function FormAnswers() {
  const t = useT()
  const { lang } = useI18n()
  const programs = usePrograms({ page_size: 100 })
  const list = useMemo(() => asList(programs.data), [programs.data])
  const [program, setProgram] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    if (!program && list.length) setProgram(String(list[0].id))
  }, [list, program])

  const params = useMemo(() => ({ status, date_from: from, date_to: to }), [status, from, to])
  const query = useFormResponseAnalytics(program, params)
  const data = query.data
  const fields = useMemo(() => fieldsOf(data), [data])
  const skipped = useMemo(() => fields.filter((f) => TEXT_TYPES.has(String(f.field_type ?? '').toLowerCase()) && f.missing > 0).sort((a, b) => b.skipRate - a.skipRate).slice(0, 8), [fields])
  const choices = useMemo(() => fields.filter((f) => CHOICE_TYPES.has(String(f.field_type ?? '').toLowerCase()) && (f.options ?? []).length).sort((a, b) => b.answered - a.answered).slice(0, 8), [fields])
  const answered = fields.reduce((n, f) => n + f.answered, 0)
  const missing = fields.reduce((n, f) => n + f.missing, 0)
  const complete = Math.round((answered / Math.max(answered + missing, 1)) * 100)

  const programOptions = list.map((p) => ({ value: String(p.id), label: pickText(p.title, lang) || pickText(p.name, lang) }))
  const statusOptions = [{ value: '', label: t('fa.allStatuses') }, ...STATUSES.map((s) => ({ value: s, label: t(`fa.status.${s}`) }))]

  const completionConfig = useMemo(() => ({
    type: 'doughnut',
    data: { labels: [t('fa.answered'), t('fa.skipped')], datasets: [{ data: [answered, missing], backgroundColor: [tokenColor('primary'), tokenColor('border')], borderWidth: 0 }] },
    options: { ...baseOptions({ tooltip: { displayColors: true } }), cutout: '70%', scales: {}, plugins: { legend: { display: true, position: 'bottom', labels: { color: tokenColor('muted'), boxWidth: 10, boxHeight: 10 } }, tooltip: { padding: 10 } } },
  }), [answered, missing, t])

  const skipConfig = useMemo(() => ({
    type: 'bar',
    data: { labels: skipped.map((f) => f.label || f.key), datasets: [{ data: skipped.map((f) => f.skipRate), backgroundColor: tokenColor('accent', 0.85), borderRadius: 4, maxBarThickness: 18 }] },
    options: (() => {
      const o = baseOptions({ horizontal: true, tooltip: { callbacks: { label: (item) => t('fa.skipTip', { count: skipped[item.dataIndex]?.missing ?? 0, pct: item.raw }) } } })
      o.scales.x = { ...o.scales.x, max: 100, ticks: { ...o.scales.x.ticks, callback: (v) => `${v}%` } }
      return o
    })(),
  }), [skipped, t])

  return (
    <div className="flex flex-col gap-3.5">
      <section aria-label={t('fa.filters')} className="rounded-card border border-border bg-surface p-3">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_repeat(2,minmax(0,0.9fr))] xl:items-end">
          <Field label={t('fa.challenge')} className="col-span-2 md:col-span-1">
            <SelectControl aria-label={t('fa.challenge')} options={programOptions} value={program} onChange={setProgram} searchable placeholder={t('fa.pickChallenge')} />
          </Field>
          <Field label={t('fa.statusLabel')} className="col-span-2 md:col-span-1">
            <SelectControl aria-label={t('fa.statusLabel')} options={statusOptions} value={status} onChange={setStatus} />
          </Field>
          <Field label={t('fa.from')}>
            <InputControl type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('fa.to')}>
            <InputControl type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </section>

      {!program && !programs.isLoading ? (
        <EmptyState framed icon={ListChecks} title={t('fa.noChallenge')} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3.5 xl:grid-cols-4" aria-busy={query.isLoading || undefined}>
            {query.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[78px] rounded-card" />) : (
              <>
                <Figure label={t('fa.entries')} value={data?.total_submissions ?? 0} />
                <Figure label={t('fa.questions')} value={data?.field_count ?? 0} />
                <Figure label={t('fa.complete')} value={`${complete}%`} />
                <Figure label={t('fa.archived')} value={data?.archived_field_count ?? 0} />
              </>
            )}
          </dl>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            <ChartCard
              title={t('fa.completion')}
              subtitle={t('fa.completionSub', { pct: complete })}
              query={query}
              isEmpty={!!data && answered + missing === 0}
              chart={{ config: completionConfig, label: t('fa.completionLabel', { answered, missing }) }}
              table={{
                columns: [{ key: 'what', label: t('fa.col.what') }, { key: 'count', label: t('fa.col.answers'), align: 'right' }],
                rows: [{ id: 'a', what: t('fa.answered'), count: answered }, { id: 'm', what: t('fa.skipped'), count: missing }],
              }}
            />
            <ChartCard
              className="lg:col-span-2"
              title={t('fa.skippedTitle')}
              subtitle={t('fa.skippedSub')}
              query={query}
              isEmpty={!!data && skipped.length === 0}
              chart={{ config: skipConfig, label: t('fa.skippedTitle'), height: Math.max(140, skipped.length * 28) }}
              table={{
                columns: [{ key: 'question', label: t('fa.col.question') }, { key: 'missing', label: t('fa.skipped'), align: 'right' }, { key: 'pct', label: t('fa.col.skipRate'), align: 'right' }],
                rows: skipped.map((f) => ({ id: `${f.section}-${f.key}`, question: f.label || f.key, missing: f.missing, pct: `${f.skipRate}%` })),
              }}
            />
          </div>

          {data && (
            <section aria-labelledby="fa-choices" className="flex flex-col gap-2.5">
              <h2 id="fa-choices" className="font-heading text-[16px] font-bold text-text">{t('fa.choicesTitle')}</h2>
              {choices.length === 0 ? (
                <EmptyState framed compact icon={ListChecks} title={t('fa.noChoices')} />
              ) : (
                <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                  {choices.map((f) => <ChoiceCard key={`${f.section}-${f.key}`} field={f} query={query} />)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
