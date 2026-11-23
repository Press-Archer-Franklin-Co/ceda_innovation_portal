import { describe, expect, it } from 'vitest'
import { currentRow, incompleteRows, scheduleItems, scheduleRows } from './hackathonSchedule'

const saved = [
  { id: 'a', starts_at: '2027-01-09T06:30:00+02:00', title: { en: 'Arrival', tn: 'Go goroga' } },
  { id: 'b', starts_at: '2027-01-09T05:30:00+00:00', title: { en: 'Welcome', tn: '' } },
]

describe('hackathon schedule panel (3.36)', () => {
  it('shows the saved schedule_items in Gaborone time', () => {
    expect(scheduleRows(saved, [])).toEqual([
      { id: 'a', date: '2027-01-09', time: '06:30', label: 'Arrival', label_tn: 'Go goroga' },
      { id: 'b', date: '2027-01-09', time: '07:30', label: 'Welcome', label_tn: '' },
    ])
  })
  it('keeps a schedule that only exists in the older field', () => {
    expect(scheduleRows([], [{ date: '2027-01-09', time: '09:00', label: 'Pitches' }])).toEqual([{ id: '', date: '2027-01-09', time: '09:00', label: 'Pitches', label_tn: '' }])
  })
  it('saves rows in time order with both languages', () => {
    const rows = [{ id: 'b', date: '2027-01-09', time: '09:00', label: ' Build ', label_tn: '' }, { id: '', date: '2027-01-09', time: '08:00', label: 'Start', label_tn: 'Simolola' }]
    expect(scheduleItems(rows)).toEqual([
      { starts_at: '2027-01-09T08:00:00+02:00', title: { en: 'Start', tn: 'Simolola' } },
      { id: 'b', starts_at: '2027-01-09T09:00:00+02:00', title: { en: 'Build', tn: '' } },
    ])
  })
  it('finds rows the API would refuse', () => {
    expect(incompleteRows([{ date: '2027-01-09', time: '08:00', label: 'x' }, { date: '2027-01-09', time: '', label: 'x' }, { date: '', time: '', label: ' ' }])).toEqual([1, 2])
  })
  it('marks what is on now, in Gaborone time', () => {
    const rows = scheduleRows(saved, [])
    expect(currentRow(rows, Date.parse('2027-01-09T04:45:00Z'))).toBe(0)
    expect(currentRow(rows, Date.parse('2027-01-09T06:00:00Z'))).toBe(1)
    expect(currentRow(rows, Date.parse('2027-01-11T06:00:00Z'))).toBe(-1)
  })
})
