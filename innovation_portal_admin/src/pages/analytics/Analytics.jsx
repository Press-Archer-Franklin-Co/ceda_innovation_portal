import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChartCanvas } from '../../components/charts/lazy'
import { BarChart3, TrendingUp, Trophy, ClipboardList, Database, Archive, ListChecks } from 'lucide-react'
import PageHeader  from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import StatCard    from '../../components/ui/StatCard'
import ErrorState  from '../../components/ui/ErrorState'
import Tabs        from '../../components/ui/Tabs'
import { SkeletonStatCards } from '../../components/ui/LoadingSkeleton'
import { useFormResponseAnalytics, useReportsDashboard } from '../../lib/queries/analytics'
import { useSubmissions } from '../../lib/queries/submissions'
import { usePrograms }    from '../../lib/queries/programs'
import { cn } from '../../lib/cn'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'responses', label: 'Form Responses' },
]

const CHART_COLORS = ['#A01E0A', '#F0641E', '#9A5200', '#1D6FA3', '#0f766e', '#b45309', '#475569', '#B42318']
const TEXT_FIELD_TYPES = new Set(['text', 'textarea', 'rich_text', 'email', 'phone', 'url', 'number', 'date'])
const CHOICE_FIELD_TYPES = new Set(['select', 'radio', 'checkbox', 'multiselect', 'multi_select'])

function BarChart({ data, valueKey = 'count', labelKey = 'month', color = 'bg-ceda-green' }) {
  if (!data?.length) return <p className="text-xs text-ceda-muted text-center py-8">No data</p>
  const max = Math.max(...data.map(d => d[valueKey] ?? 0), 1)
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => {
        const h = max > 0 ? Math.round(((d[valueKey] ?? 0) / max) * 100) : 0
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <span className="text-[10px] text-ceda-muted tabular-nums">{d[valueKey] ?? 0}</span>
            <div
              className={cn('w-full rounded-t-sm transition-all duration-300', color)}
              style={{ height: `${h}%`, minHeight: h > 0 ? 4 : 0 }}
            />
            <span className="text-[9px] text-ceda-muted truncate w-full text-center">
              {String(d[labelKey] ?? '').replace(' 2025', '').replace(' 2024', '')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AnalyticsEmpty({ children = 'No data available yet.' }) {
  return <p className="text-xs text-ceda-muted text-center py-8">{children}</p>
}

function truncateTick(value, limit = 18) {
  const text = String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function baseChartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 650,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: {
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          color: '#334155',
          font: { size: 11, weight: 600 },
        },
      },
      tooltip: {
        backgroundColor: '#A01E0A',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
      },
    },
    ...extra,
  }
}

function ResponseMetricCard({ label, value, note, icon: Icon, accent = '#A01E0A' }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ceda-border bg-white p-5 shadow-sm">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10" style={{ background: accent }} />
      <div className="absolute right-5 top-5 rounded-xl p-2" style={{ background: `${accent}14`, color: accent }}>
        {Icon && <Icon size={18} />}
      </div>
      <p className="text-xs font-medium text-ceda-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-ceda-dark">{value}</p>
      {note && <p className="mt-1 text-[11px] text-ceda-muted">{note}</p>}
    </div>
  )
}

function DonutCompletionChart({ answered = 0, missing = 0 }) {
  const total = Math.max(answered + missing, 1)
  const answeredPct = Math.round((answered / total) * 100)
  const missingPct = 100 - answeredPct
  const config = {
    type: 'doughnut',
    data: {
      labels: ['Answered', 'Skipped'],
      datasets: [{
        data: [answered, missing],
        backgroundColor: ['#A01E0A', '#9A5200'],
        borderColor: '#ffffff',
        borderWidth: 4,
        hoverOffset: 8,
      }],
    },
    options: baseChartOptions({
      cutout: '68%',
      plugins: {
        ...baseChartOptions().plugins,
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: '#334155',
            font: { size: 11, weight: 600 },
          },
        },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            label: (context) => {
              const value = context.raw ?? 0
              const pct = Math.round((value / total) * 100)
              return `${context.label}: ${value} (${pct}%)`
            },
          },
        },
      },
    }),
  }

  return (
    <div className="rounded-2xl border border-ceda-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ceda-dark">Answer completion</h3>
          <p className="text-xs text-ceda-muted">Answered vs skipped across all detected fields.</p>
        </div>
        <span className="rounded-full bg-ceda-green-pale px-2.5 py-1 text-[11px] font-semibold text-ceda-forest">
          {answeredPct}% answered
        </span>
      </div>
      <div className="mt-6 flex flex-col items-center">
        <div className="relative h-56 w-full">
          <ChartCanvas config={config} height={224} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-ceda-dark">{answeredPct}%</span>
            <span className="text-[11px] text-ceda-muted">complete</span>
          </div>
        </div>
        <div className="mt-5 grid w-full grid-cols-2 gap-3">
          <div className="rounded-xl bg-ceda-surface px-4 py-3">
            <p className="text-[11px] text-ceda-muted">Answered</p>
            <p className="text-lg font-semibold text-ceda-dark">{answered}</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-4 py-3">
            <p className="text-[11px] text-amber-800">Skipped</p>
            <p className="text-lg font-semibold text-amber-900">{missing} <span className="text-xs font-normal">({missingPct}%)</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkipRateColumnChart({ fields = [] }) {
  const chartFields = fields.filter((field) => (field.missing_count ?? 0) > 0).slice(0, 8)
  const config = {
    type: 'bar',
    data: {
      labels: chartFields.map((field) => field.label || field.key),
      datasets: [{
        label: 'Skipped rate',
        data: chartFields.map((field) => field.missing_rate ?? 0),
        backgroundColor: chartFields.map((_, index) => CHART_COLORS[(index + 2) % CHART_COLORS.length]),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 52,
      }],
    },
    options: baseChartOptions({
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            label: (context) => {
              const field = chartFields[context.dataIndex]
              return `${field?.missing_count ?? 0} skipped (${context.raw}%)`
            },
            afterLabel: (context) => {
              const field = chartFields[context.dataIndex]
              return `${field?.answered_count ?? 0} answered`
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: '#6B5248',
            callback: (value) => `${value}%`,
          },
          grid: { color: '#EFE4DC' },
        },
        x: {
          ticks: {
            color: '#6B5248',
            maxRotation: 0,
            callback: function callback(value) {
              return truncateTick(this.getLabelForValue(value), 16)
            },
          },
          grid: { display: false },
        },
      },
    }),
  }

  return (
    <div className="rounded-2xl border border-ceda-border bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ceda-dark">Skipped text questions</h3>
          <p className="text-xs text-ceda-muted">All open-answer fields grouped into one skip-rate chart.</p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
          {chartFields.length} tracked
        </span>
      </div>
      {!chartFields.length ? (
        <AnalyticsEmpty>No skipped text fields found.</AnalyticsEmpty>
      ) : (
        <ChartCanvas config={config} height={320} />
      )}
    </div>
  )
}

function ChoiceDistributionChart({ field }) {
  const options = (field.options ?? []).slice(0, 6)
  if (!options.length) return null
  const total = options.reduce((sum, item) => sum + (item.count ?? 0), 0)
  const config = {
    type: 'bar',
    data: {
      labels: options.map((option) => option.label),
      datasets: [{
        label: 'Responses',
        data: options.map((option) => option.count ?? 0),
        backgroundColor: options.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 48,
      }],
    },
    options: baseChartOptions({
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            label: (context) => {
              const value = context.raw ?? 0
              const pct = Math.round((value / Math.max(total, 1)) * 100)
              return `${value} responses (${pct}%)`
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: '#6B5248',
          },
          grid: { color: '#EFE4DC' },
        },
        x: {
          ticks: {
            color: '#6B5248',
            maxRotation: 0,
            callback: function callback(value) {
              return truncateTick(this.getLabelForValue(value), 14)
            },
          },
          grid: { display: false },
        },
      },
    }),
  }

  return (
    <div className="rounded-2xl border border-ceda-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ceda-dark truncate">{field.label || field.key}</h3>
          <p className="text-xs text-ceda-muted">{field.section} · {field.field_type}</p>
        </div>
        <span className="rounded-full bg-ceda-green-pale px-2.5 py-1 text-[11px] font-semibold text-ceda-forest">
          {field.answer_rate}%
        </span>
      </div>
      <ChartCanvas config={config} height={240} />
      <div className="my-4 flex h-3 overflow-hidden rounded-full bg-ceda-surface">
        {options.map((option, index) => {
          const width = total > 0 ? Math.round(((option.count ?? 0) / total) * 100) : 0
          return (
            <div
              key={`${field.key}-${option.value}`}
              style={{ width: `${width}%`, background: CHART_COLORS[index % CHART_COLORS.length] }}
              title={`${option.label}: ${option.count}`}
            />
          )
        })}
      </div>
      <div className="space-y-2">
        {options.map((option, index) => {
          return (
            <div key={`${field.key}-${option.value}-row`} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="truncate text-ceda-dark">{option.label}</span>
              </span>
              <span className="text-ceda-muted tabular-nums">{option.count} · {option.percentage}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBreakdown({ data }) {
  if (!data?.length) return <p className="text-xs text-ceda-muted text-center py-4">No data</p>
  const total = data.reduce((s, d) => s + (d.total ?? d.count ?? 0), 0)
  const STATUS_COLORS = {
    draft:        '#94a3b8',
    submitted:    '#F0641E',
    under_review: '#1D6FA3',
    finalist:     '#9A5200',
    winner:       '#A01E0A',
    rejected:     '#B42318',
  }
  return (
    <div className="space-y-2.5">
      {data.map(d => {
        const statusKey = d.current_status ?? d.status ?? ''
        const label     = statusKey.replace(/_/g, ' ')
        const count     = d.total ?? d.count ?? 0
        const pct       = total > 0 ? Math.round((count / total) * 100) : 0
        const color     = STATUS_COLORS[statusKey] ?? '#94a3b8'
        return (
          <div key={statusKey}>
            <div className="flex justify-between text-sm mb-1">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-ceda-dark capitalize">{label || 'Unknown'}</span>
              </span>
              <span className="text-ceda-muted tabular-nums">
                {count} <span className="text-[11px]">({pct}%)</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-ceda-border overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function buildFieldList(formAnalytics) {
  return (formAnalytics?.sections ?? []).flatMap((section) => (
    (section.fields ?? []).map((field) => ({
      ...field,
      section: section.section,
      missing_rate: Math.round(((field.missing_count ?? 0) / Math.max((field.answered_count ?? 0) + (field.missing_count ?? 0), 1)) * 100),
    }))
  ))
}

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview')
  const [selectedProgram, setSelectedProgram] = useState('')
  const [analyticsStatus, setAnalyticsStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const {
    data: reports,
    isLoading: reportsLoading,
    error: reportsError,
    refetch: refetchReports,
  } = useReportsDashboard()

  const { data: subsData,  isLoading: subsLoading  } = useSubmissions()
  const { data: progsData, isLoading: progsLoading } = usePrograms()

  const submissions = Array.isArray(subsData)  ? subsData  : subsData?.results  ?? []
  const programs    = Array.isArray(progsData) ? progsData : progsData?.results ?? []

  useEffect(() => {
    const nextTab = searchParams.get('tab')
    if (nextTab && nextTab !== tab) setTab(nextTab)
  }, [searchParams, tab])

  const handleTabChange = (nextTab) => {
    setTab(nextTab)
    setSearchParams({ tab: nextTab })
  }

  useEffect(() => {
    if (!selectedProgram && programs.length) {
      setSelectedProgram(programs[0].id)
    }
  }, [programs, selectedProgram])

  const formAnalyticsParams = useMemo(() => ({
    status: analyticsStatus,
    date_from: dateFrom,
    date_to: dateTo,
  }), [analyticsStatus, dateFrom, dateTo])

  const {
    data: formAnalytics,
    isLoading: formAnalyticsLoading,
    error: formAnalyticsError,
    refetch: refetchFormAnalytics,
  } = useFormResponseAnalytics(selectedProgram, formAnalyticsParams, { enabled: tab === 'responses' })

  const activePrograms = programs.filter(p => p.status === 'active').length
  const finalists      = submissions.filter(s => s.current_status === 'finalist').length

  const statusBreakdown = reports?.submissions_by_status ?? []

  const programRows = programs.map(p => {
    const programSubs      = submissions.filter(s => s.program === p.id || s.program_detail?.id === p.id)
    const programFinalists = programSubs.filter(s => s.current_status === 'finalist').length
    return {
      id:          p.id,
      program:     p.title,
      submissions: programSubs.length,
      finalists:   programFinalists,
    }
  })

  const responseFields = useMemo(() => buildFieldList(formAnalytics), [formAnalytics])
  const textFields = useMemo(() => (
    responseFields
      .filter((field) => TEXT_FIELD_TYPES.has(String(field.field_type ?? '').toLowerCase()))
      .sort((a, b) => (b.missing_rate ?? 0) - (a.missing_rate ?? 0))
  ), [responseFields])
  const choiceFields = useMemo(() => (
    responseFields
      .filter((field) => CHOICE_FIELD_TYPES.has(String(field.field_type ?? '').toLowerCase()) && (field.options ?? []).length)
      .sort((a, b) => (b.answered_count ?? 0) - (a.answered_count ?? 0))
  ), [responseFields])
  const responseTotals = useMemo(() => {
    const answered = responseFields.reduce((sum, field) => sum + (field.answered_count ?? 0), 0)
    const missing = responseFields.reduce((sum, field) => sum + (field.missing_count ?? 0), 0)
    const completion = Math.round((answered / Math.max(answered + missing, 1)) * 100)
    const topSkipped = responseFields.slice().sort((a, b) => (b.missing_rate ?? 0) - (a.missing_rate ?? 0))[0]
    return { answered, missing, completion, topSkipped }
  }, [responseFields])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Analytics"
        subtitle="Aggregate insights across all programs and submissions."
      />

      <Tabs tabs={TABS} active={tab} onChange={handleTabChange} className="mb-6" />

      {tab === 'overview' && (
        <>
          {reportsLoading || subsLoading || progsLoading ? (
            <SkeletonStatCards count={4} />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                title="Total Submissions"
                value={reports?.submissions_total ?? submissions.length}
                icon={ClipboardList}
                color="forest"
              />
              <StatCard
                title="Active Programs"
                value={activePrograms}
                icon={BarChart3}
                color="green"
              />
              <StatCard
                title="Communications"
                value={reports?.communications_total ?? '—'}
                icon={TrendingUp}
                color="indigo"
              />
              <StatCard
                title="Finalists"
                value={finalists}
                icon={Trophy}
                color="gold"
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <div className="lg:col-span-2">
              <SectionCard
                title="Judge Completion Rate"
                subtitle="Evaluation completion across programs"
              >
                {reportsLoading ? (
                  <div className="h-28 bg-ceda-border/30 rounded animate-pulse" />
                ) : reportsError ? (
                  <ErrorState message={reportsError.message} onRetry={refetchReports} className="py-6" />
                ) : reports?.judge_completion_rate?.length > 0 ? (
                  <BarChart
                    data={reports.judge_completion_rate}
                    valueKey="total"
                    labelKey="status"
                    color="bg-ceda-green"
                  />
                ) : (
                  <p className="text-xs text-ceda-muted text-center py-8">No judge completion data available</p>
                )}
              </SectionCard>
            </div>

            <SectionCard title="Status Breakdown" subtitle="Current state of all submissions">
              {reportsLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-8 bg-ceda-border/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <StatusBreakdown data={statusBreakdown} />
              )}
            </SectionCard>
          </div>

          <SectionCard title="By Program" subtitle="Submission and finalist counts per program">
            {progsLoading || subsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-8 bg-ceda-border/30 rounded animate-pulse" />
                ))}
              </div>
            ) : programRows.length === 0 ? (
              <p className="text-xs text-ceda-muted text-center py-6">No programs to display</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="th text-left">Program</th>
                      <th className="th text-right" style={{ width: 110 }}>Submissions</th>
                      <th className="th text-right" style={{ width: 90 }}>Finalists</th>
                      <th className="th text-right" style={{ width: 100 }}>Rate</th>
                      <th className="th" style={{ width: 160 }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programRows.map(p => {
                      const rate = p.submissions > 0 ? Math.round((p.finalists / p.submissions) * 100) : 0
                      return (
                        <tr key={p.id} className="hover:bg-ceda-surface/50 transition-colors">
                          <td className="td">
                            <p className="text-sm font-medium text-ceda-dark">{p.program}</p>
                          </td>
                          <td className="td text-right">
                            <span className="text-sm font-semibold tabular-nums text-ceda-dark">{p.submissions}</span>
                          </td>
                          <td className="td text-right">
                            <span className="text-sm font-semibold tabular-nums text-ceda-gold">{p.finalists}</span>
                          </td>
                          <td className="td text-right">
                            <span className="text-sm text-ceda-muted">{rate}%</span>
                          </td>
                          <td className="td">
                            <div className="h-1.5 rounded-full bg-ceda-border overflow-hidden">
                              <div className="h-full rounded-full bg-ceda-green" style={{ width: `${rate}%` }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {tab === 'responses' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-ceda-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select className="input h-9 py-0 text-sm w-64" value={selectedProgram} onChange={(e) => setSelectedProgram(e.target.value)}>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>{program.title}</option>
                ))}
              </select>
              <select className="input h-9 py-0 text-sm w-44" value={analyticsStatus} onChange={(e) => setAnalyticsStatus(e.target.value)}>
                <option value="">All submitted statuses</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under review</option>
                <option value="returned">Returned</option>
                <option value="rejected">Rejected</option>
                <option value="approved">Approved</option>
              </select>
              <input className="input h-9 py-0 text-sm w-36" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <input className="input h-9 py-0 text-sm w-36" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          {formAnalyticsLoading ? (
            <div className="space-y-3">
              {[1,2,3].map((item) => <div key={item} className="h-20 rounded-xl bg-ceda-border/30 animate-pulse" />)}
            </div>
          ) : formAnalyticsError ? (
            <ErrorState message={formAnalyticsError.message} onRetry={refetchFormAnalytics} className="py-6" />
          ) : !formAnalytics ? (
            <p className="text-xs text-ceda-muted text-center py-8">Choose a program to view response analytics.</p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <ResponseMetricCard
                  label="Submissions"
                  value={formAnalytics.total_submissions}
                  icon={Database}
                  accent="#A01E0A"
                />
                <ResponseMetricCard
                  label="Fields"
                  value={formAnalytics.field_count}
                  icon={ListChecks}
                  accent="#F0641E"
                />
                <ResponseMetricCard
                  label="Complete"
                  value={`${responseTotals.completion}%`}
                  icon={TrendingUp}
                  accent="#9A5200"
                />
                <ResponseMetricCard
                  label="Archived"
                  value={formAnalytics.archived_field_count}
                  icon={Archive}
                  accent="#475569"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <DonutCompletionChart answered={responseTotals.answered} missing={responseTotals.missing} />
                <div className="xl:col-span-2">
                  <SkipRateColumnChart fields={textFields} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ceda-dark">Option answers</h3>
                  </div>
                  <span className="text-xs text-ceda-muted">{choiceFields.length} fields</span>
                </div>
                {choiceFields.length ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {choiceFields.slice(0, 8).map((field) => (
                      <ChoiceDistributionChart key={`choice-${field.section}-${field.key}`} field={field} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-ceda-border bg-ceda-surface/60">
                    <AnalyticsEmpty>No choice fields have answer data yet.</AnalyticsEmpty>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
