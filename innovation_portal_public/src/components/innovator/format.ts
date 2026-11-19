import type { Lang } from '../../types/innovator'
import type { TFunction } from '../../i18n'

const LOCALE: Record<Lang, string> = { en: 'en-BW', tn: 'en-BW' }

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "18 Nov 2026". */
export function formatDate(value: string | null | undefined, lang: Lang): string {
  const date = toDate(value)
  return date ? date.toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

/** "25 Nov", for dates in the near future or past. */
export function formatShortDate(value: string | null | undefined, lang: Lang): string {
  const date = toDate(value)
  return date ? date.toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'short' }) : ''
}

/** "19 Nov, 09:12". */
export function formatDateTime(value: string | null | undefined, lang: Lang): string {
  const date = toDate(value)
  return date
    ? `${formatShortDate(value, lang)}, ${date.toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : ''
}

/** "2 hours ago", "Yesterday", then the date. */
export function relativeTime(value: string | null | undefined, t: TFunction, lang: Lang, now = Date.now()): string {
  const date = toDate(value)
  if (!date) return ''
  const minutes = Math.round((now - date.getTime()) / 60000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutes', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours === 1) return t('time.hour')
  if (hours < 24) return t('time.hours', { count: hours })
  const days = Math.round(hours / 24)
  if (days === 1) return t('time.yesterday')
  if (days < 7) return t('time.days', { count: days })
  return formatShortDate(value, lang)
}

/** Whole days from now until the date (0 on the day itself), or null. */
export function daysUntil(value: string | null | undefined, now = Date.now()): number | null {
  const date = toDate(value)
  if (!date) return null
  return Math.max(0, Math.ceil((date.getTime() - now) / 86400000))
}

/** The first name, for greetings. */
export function firstName(full: string | null | undefined): string {
  return (full ?? '').trim().split(/\s+/)[0] ?? ''
}
