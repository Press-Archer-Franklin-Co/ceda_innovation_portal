// 3.36 Schedule panel: rows on screen <-> schedule_items, the list the live hackathon page and the challenge page (1.8)
// read. Times are CEDA's time (Africa/Gaborone, always UTC+2), whatever the browser's time zone is.

const OFFSET = '+02:00'
const parts = (iso) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { date: '', time: '' }
  const local = new Date(date.getTime() + 2 * 3600_000).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 16) }
}

/** The saved items; a page that only has the older `schedule` list keeps it, so nothing disappears. */
export function scheduleRows(items, legacy) {
  if (items?.length) {
    return items.map((item) => ({ id: item.id, ...parts(item.starts_at), label: item.title?.en ?? '', label_tn: item.title?.tn ?? '' }))
  }
  return (legacy ?? []).map((s) => ({ id: '', date: s.date ?? '', time: s.time ?? '', label: s.label ?? s.title ?? '', label_tn: '' }))
}

export const rowStart = (row) => (row.date && row.time ? new Date(`${row.date}T${row.time}:00${OFFSET}`).getTime() : NaN)

export function scheduleItems(rows) {
  return [...rows]
    .sort((a, b) => rowStart(a) - rowStart(b))
    .map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      starts_at: `${row.date}T${row.time}:00${OFFSET}`,
      title: { en: row.label.trim(), tn: (row.label_tn ?? '').trim() },
    }))
}

/** Indexes of rows the API would refuse: each needs a date, a time and English words. */
export const incompleteRows = (rows) => rows.flatMap((row, index) => (row.date && row.time && row.label.trim() ? [] : [index]))

/** The item running now: it has started and the next one has not. The last one counts only on its own day. */
export function currentRow(rows, now = Date.now()) {
  const times = rows.map(rowStart)
  let found = -1
  times.forEach((time, i) => { if (!Number.isNaN(time) && time <= now) found = i })
  if (found === -1) return -1
  if (times.slice(found + 1).some((time) => !Number.isNaN(time))) return found
  return rows[found].date === parts(new Date(now).toISOString()).date ? found : -1
}
