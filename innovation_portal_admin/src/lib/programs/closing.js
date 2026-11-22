// 3.x Challenge status: how long a challenge stays open, in CEDA's calendar days (Africa/Gaborone, the API's
// TIME_ZONE; site settings has no time zone of its own). A challenge past its closing time, or closed or archived
// by staff, is "closed", the same rule the API uses (apps/programs/challenge_public.challenge_status).

export const SITE_TIME_ZONE = 'Africa/Gaborone'

const dayKey = (date, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

/** {state: 'closed' | 'today' | 'open', days} for a closing date (ISO string) and programme status. */
export function closingState(closingDate, status, now = new Date(), timeZone = SITE_TIME_ZONE) {
  if (status === 'closed' || status === 'archived') return { state: 'closed', days: 0 }
  if (!closingDate) return { state: 'open', days: null }
  const closes = new Date(closingDate)
  if (Number.isNaN(closes.getTime())) return { state: 'open', days: null }
  if (closes.getTime() <= now.getTime()) return { state: 'closed', days: 0 }
  const days = Math.round((Date.parse(dayKey(closes, timeZone)) - Date.parse(dayKey(now, timeZone))) / 864e5)
  return days <= 0 ? { state: 'today', days: 0 } : { state: 'open', days }
}
