import type { Lang } from '../i18n'

const locale = (lang: Lang) => (lang === 'tn' ? 'en-BW' : 'en-GB')

/** 27 Nov 2026 */
export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 17 Nov */
export function formatDayMonth(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' })
}

/** 84 -> "1:24" */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Whole days from now until `iso` (0 on the day itself), or null for no date. */
export function daysLeft(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return null
  return Math.ceil((d - now) / 86_400_000)
}
