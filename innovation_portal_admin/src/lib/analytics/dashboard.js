// U4 (3.1 dashboard, 3.2 reports): pure helpers for the B7 numbers (R-35). No React, no Chart.js here.

/** The one filter row. Every key is also the API's query name. */
export const FILTER_KEYS = ['program', 'from', 'to', 'sector', 'district', 'channel']

/** Channels in a fixed order, each with one colour token on every chart. */
export const CHANNELS = ['web', 'office', 'whatsapp', 'ussd']
export const CHANNEL_TOKEN = { web: 'primary', office: 'amber', whatsapp: 'success', ussd: 'info' }

/** Pipeline stage codes from /pipeline/, in order. Labels come from the strings files, not the API. */
export const STAGES = ['received', 'screening', 'review', 'judging', 'shortlisted', 'finalist', 'action_needed']

/** Funnel steps from /funnel/, in order. "funded" says "Not tracked yet" while funded_tracked is false. */
export const FUNNEL_STEPS = ['submitted', 'passed_check', 'reviewed', 'panel', 'supported', 'funded']

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Filters from the URL. Unknown keys, bad dates and unknown channels are left out, so the API never gets a 400 from a hand-edited link. */
export function readFilters(searchParams) {
  const out = {}
  for (const key of FILTER_KEYS) {
    const value = (searchParams.get(key) ?? '').trim()
    if (!value) continue
    if ((key === 'from' || key === 'to') && !DATE.test(value)) continue
    if (key === 'channel' && !CHANNELS.includes(value)) continue
    out[key] = value
  }
  if (out.from && out.to && out.to < out.from) delete out.to
  return out
}

/** A new URLSearchParams with one filter changed (empty removes it). Other params, like ?tab=, stay. */
export function withFilter(searchParams, key, value) {
  const next = new URLSearchParams(searchParams)
  if (value) next.set(key, value)
  else next.delete(key)
  return next
}

export function withoutFilters(searchParams) {
  const next = new URLSearchParams(searchParams)
  FILTER_KEYS.forEach((key) => next.delete(key))
  return next
}

export const activeFilterCount = (filters) => Object.keys(filters).length

/** change_pct to a tone and a string key. null means there was nothing to compare with. */
export function changeWords(changePct) {
  if (changePct === null || changePct === undefined) return { tone: 'neutral', key: 'dash.kpi.noCompare', value: null }
  if (changePct === 0) return { tone: 'neutral', key: 'dash.kpi.same', value: 0 }
  return changePct > 0
    ? { tone: 'up', key: 'dash.kpi.up', value: Math.abs(changePct) }
    : { tone: 'down', key: 'dash.kpi.down', value: Math.abs(changePct) }
}

/** Days to a decision against the target: 'none' when nothing was decided. */
export function decisionTone(average, target) {
  if (average === null || average === undefined) return 'none'
  if (target === null || target === undefined) return 'neutral'
  return average <= target ? 'good' : 'late'
}

const LOCALE = (lang) => (lang === 'tn' ? 'en-BW' : 'en-GB')

/** "3 Nov" for a week bar, "Nov 2026" for a month bar. */
export function periodLabel(isoDate, interval, lang, { long = false } = {}) {
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  if (interval === 'month') return d.toLocaleDateString(LOCALE(lang), { month: long ? 'long' : 'short', year: 'numeric' })
  return d.toLocaleDateString(LOCALE(lang), { day: 'numeric', month: 'short', ...(long ? { year: 'numeric' } : {}) })
}

/** The last day of a period, for "3 to 9 Nov 2026" in a tooltip. */
export function periodEnd(isoDate, interval) {
  const d = new Date(`${isoDate}T00:00:00`)
  if (interval === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)
}

export function dayLabel(date, lang) {
  return date.toLocaleDateString(LOCALE(lang), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Stages with their string key, the bottleneck flagged. Unknown codes are dropped (ceda-user-scope 2.6). */
export function pipelineRows(pipeline) {
  const byCode = new Map((pipeline?.stages ?? []).map((s) => [s.code, s]))
  return STAGES.filter((code) => byCode.has(code)).map((code) => {
    const s = byCode.get(code)
    return { code, count: s.count ?? 0, waiting: s.waiting_over_7_days ?? 0, bottleneck: pipeline?.bottleneck === code }
  })
}

/**
 * Funnel steps with the share of "submitted" that reached each one. Until funding is tracked, the funded row
 * has count and pct null, so screens say "Not tracked yet" instead of showing 0.
 */
export function funnelRows(funnel) {
  if (!funnel) return []
  const top = funnel.submitted ?? 0
  return FUNNEL_STEPS.map((step) => {
    if (step === 'funded' && !funnel.funded_tracked) return { step, count: null, pct: null }
    const count = funnel[step] ?? 0
    return { step, count, pct: top ? Math.round((count * 1000) / top) / 10 : 0 }
  })
}

/** Channels in the fixed order; unknown channels from the API are dropped. */
export function channelRows(sources) {
  const byChannel = new Map((sources?.channels ?? []).map((c) => [c.channel, c]))
  return CHANNELS.filter((ch) => byChannel.has(ch)).map((ch) => ({ channel: ch, count: byChannel.get(ch).count ?? 0, pct: byChannel.get(ch).pct ?? 0 }))
}

/** Youth, women and rural shares, out of the people we know about. null when nobody is known. */
export function inclusionShares(inclusion) {
  if (!inclusion) return null
  const share = (part, known) => (known ? Math.round((part * 1000) / known) / 10 : null)
  const age = inclusion.age ?? {}
  const gender = inclusion.gender ?? {}
  const place = inclusion.place ?? {}
  const knownAge = (age.youth_18_35 ?? 0) + (age['36_and_over'] ?? 0) + (age.under_18 ?? 0)
  const knownGender = (gender.women ?? 0) + (gender.men ?? 0) + (gender.other_or_unknown ?? 0)
  const knownPlace = (place.rural ?? 0) + (place.urban ?? 0)
  return {
    youth: { pct: share(age.youth_18_35 ?? 0, knownAge), count: age.youth_18_35 ?? 0, known: knownAge, unknown: age.unknown ?? 0 },
    women: { pct: share(gender.women ?? 0, knownGender), count: gender.women ?? 0, known: knownGender, unknown: gender.unknown ?? 0 },
    rural: { pct: share(place.rural ?? 0, knownPlace), count: place.rural ?? 0, known: knownPlace, unknown: place.unknown ?? 0 },
  }
}

/** The filters an export should repeat, in the API's names. */
export function exportBody(report, format, filters) {
  return { report, format, filters: { ...filters } }
}

/** A file name for a finished export, for example ceda-funnel-2026-11-20.csv */
export function exportFileName(report, format, today = new Date()) {
  const day = today.toISOString().slice(0, 10)
  return `ceda-${report}-${day}.${format}`
}
