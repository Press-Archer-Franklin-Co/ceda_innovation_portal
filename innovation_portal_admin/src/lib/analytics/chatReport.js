// Live chat report (Reports > Live chat). Every field name from GET /api/analytics/chat/ is read here and nowhere
// else, so matching the API's final shape (prompt 53, R-85) is a change to this one file. Null stays null: the
// screen says "No data yet" and never turns a missing number into 0.

export const CHAT_CHANNELS = ['web', 'whatsapp', 'ussd', 'ai']
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const HOURS = Array.from({ length: 24 }, (_, h) => h)
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Today's date in Gaborone, whatever the device's clock zone is. */
export function gaboroneDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Gaborone', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The last 30 days, today included. */
export function defaultRange(now = new Date()) {
  const to = gaboroneDay(now)
  const [y, m, d] = to.split('-').map(Number)
  return { from: new Date(Date.UTC(y, m - 1, d - 29)).toISOString().slice(0, 10), to }
}

/** Filters from the address: from, to and chat_channel. The Numbers tab's other filters do not apply here. */
export function readChatFilters(params, now = new Date()) {
  const range = defaultRange(now)
  const read = (key) => { const v = params.get(key) ?? ''; return DATE.test(v) ? v : '' }
  const from = read('from') || range.from
  let to = read('to') || range.to
  if (to < from) to = range.to < from ? from : range.to
  const channel = params.get('chat_channel') ?? ''
  return { from, to, ...(CHAT_CHANNELS.includes(channel) ? { channel } : {}) }
}

const orNull = (v) => (v === undefined || v === null ? null : v)

/** answered / started as a percentage with one decimal. No chats started means there is no percentage. */
export function answeredPercent(answered, started) {
  if (answered === null || answered === undefined || !started) return null
  return Math.round((answered * 1000) / started) / 10
}

/** The API's answer (prompt 53) in the shape the screen draws. */
export function normaliseChatReport(data) {
  const totals = data?.totals ?? {}
  const firstReply = data?.first_reply_minutes ?? {}
  const satisfaction = data?.satisfaction ?? {}
  const byScore = satisfaction.by_score ?? {}
  return {
    liveChatOn: data?.live_chat_on !== false,
    totals: {
      started: orNull(totals.started),
      answered: orNull(totals.answered),
      answeredPct: answeredPercent(totals.answered, totals.started),
      medianFirstReply: orNull(firstReply.median),
      averageRating: orNull(satisfaction.average),
      ratedCount: orNull(satisfaction.rated),
      outsideHours: orNull(totals.outside_hours),
      escalated: orNull(totals.escalated),
    },
    perDay: (data?.per_day ?? []).map((r) => ({ date: r.date, started: r.started ?? 0, answered: r.answered ?? 0 })),
    byChannel: CHAT_CHANNELS
      .map((channel) => (data?.by_channel ?? []).find((r) => r.channel === channel))
      .filter(Boolean)
      .map((r) => ({ channel: r.channel, started: r.started ?? 0, answered: r.answered ?? 0 })),
    busiest: (data?.busiest_hours ?? []).filter((r) => r.weekday >= 0 && r.weekday <= 6 && r.hour >= 0 && r.hour <= 23).map((r) => ({ weekday: r.weekday, hour: r.hour, chats: r.started ?? 0 })),
    ratings: [1, 2, 3, 4, 5].map((stars) => ({ stars, count: byScore[String(stars)] ?? 0 })),
    answerers: (data?.agents ?? []).map((r) => ({
      id: r.id, name: r.name, chats: orNull(r.handled), medianFirstReply: orNull(r.median_first_reply_minutes), rating: orNull(r.average_satisfaction), openNow: orNull(r.open_now),
    })),
  }
}

/** "4 min", "1 h 20 min", "2 h". Null is null, so the screen can say "No data yet". */
export function minutesText(value, t) {
  if (value === null || value === undefined) return null
  const total = Math.round(Number(value))
  if (total < 60) return t('chatrep.min', { n: total })
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? t('chatrep.hMin', { h, m }) : t('chatrep.h', { h })
}

export const hourLabel = (hour) => `${String(hour % 24).padStart(2, '0')}:00`

/** The busiest weekday and hour, or null when no chat is counted. The earliest wins a tie, so it never flickers. */
export function busiestSlot(cells) {
  let best = null
  for (const c of cells) {
    if (c.chats > 0 && (!best || c.chats > best.chats || (c.chats === best.chats && (c.weekday < best.weekday || (c.weekday === best.weekday && c.hour < best.hour))))) best = c
  }
  return best
}

/** 0 to 4 for a heat cell: 0 is no chats, 4 is the busiest. */
export function heatLevel(chats, max) {
  if (!chats || !max) return 0
  return Math.max(1, Math.ceil((chats / max) * 4))
}
