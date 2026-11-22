// 3.23 Users: plain words for the list and the invite modal.
import { pickText } from './roles'

/** "Today, 08:12", "Yesterday", "3 days ago", "2 months ago", or the date. */
export function lastSignIn(value, t, now = new Date()) {
  if (!value) return t('users.never')
  const d = new Date(value)
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (days <= 0) return t('users.today', { time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })
  if (days === 1) return t('users.yesterday')
  if (days < 31) return t('users.daysAgo', { n: days })
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? t('users.monthAgo') : t('users.monthsAgo', { n: months })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Officer and Content editor can review ideas and edit website content. Publishing still needs an approver." */
export function whatTheyCanDo(codes, roles, catalogue, lang, t) {
  if (!codes.length) return ''
  const chosen = roles.filter((r) => codes.includes(r.code))
  const names = chosen.map((r) => pickText(r.name, lang)).join(t('users.and'))
  const caps = [...new Set(chosen.flatMap((r) => r.capabilities ?? []))]
  const labels = (catalogue?.capabilities ?? []).filter((c) => caps.includes(c.key)).map((c) => {
    const l = pickText(c.label, lang)
    return l.charAt(0).toLowerCase() + l.slice(1)
  })
  if (!labels.length) return t('users.canDoNothing', { roles: names })
  const what = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')}${t('users.and')}${labels[labels.length - 1]}`
  const tail = caps.includes('content.edit') && !caps.includes('content.approve') ? ` ${t('users.publishNeedsApprover')}` : ''
  return t('users.canDo', { roles: names, what }) + tail
}
