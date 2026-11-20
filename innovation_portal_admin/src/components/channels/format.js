import { EMPTY_CELL } from '../../lib/format'

// Dates for the channels screens, in Botswana time. A missing value shows EMPTY_CELL.
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Gaborone' })
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Gaborone' })

export function formatDate(value) {
  if (!value) return EMPTY_CELL
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? EMPTY_CELL : dateFmt.format(d)
}

export function formatDateTime(value) {
  if (!value) return EMPTY_CELL
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? EMPTY_CELL : dateTimeFmt.format(d)
}
