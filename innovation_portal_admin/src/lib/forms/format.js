/** "2 days ago", "yesterday", then the date. `t` is the i18n function. */
export function relativeTime(value, t, now = Date.now()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.round((now - date.getTime()) / 60000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutes', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours === 1) return t('time.hour')
  if (hours < 24) return t('time.hours', { count: hours })
  const days = Math.round(hours / 24)
  if (days === 1) return t('time.yesterday')
  if (days < 7) return t('time.days', { count: days })
  return date.toLocaleDateString('en-BW', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Text in `lang`, English when the translation is empty. Accepts strings or {en, tn}. */
export function pick(value, lang) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  const text = (value[lang] ?? '').trim()
  return text ? value[lang] : value.en ?? ''
}
