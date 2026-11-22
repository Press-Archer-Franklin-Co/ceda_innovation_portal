import { describe, expect, it } from 'vitest'
import { closingState } from './closing'

const now = new Date('2026-11-22T15:00:00Z') // 17:00 in Gaborone

describe('closingState (Challenge status)', () => {
  it('calls a challenge that closed on 31 Oct closed, not "closes today"', () => {
    expect(closingState('2026-10-31T15:00:00Z', 'published', now)).toEqual({ state: 'closed', days: 0 })
  })
  it('counts calendar days in Gaborone', () => {
    expect(closingState('2026-11-22T21:00:00Z', 'published', now)).toEqual({ state: 'today', days: 0 }) // 23:00 today
    expect(closingState('2026-11-22T22:30:00Z', 'published', now)).toEqual({ state: 'open', days: 1 }) // 00:30 tomorrow
    expect(closingState('2026-11-25T08:00:00Z', 'published', now)).toEqual({ state: 'open', days: 3 })
  })
  it('follows the staff status and copes with no date', () => {
    expect(closingState('2027-01-01T00:00:00Z', 'closed', now).state).toBe('closed')
    expect(closingState('2027-01-01T00:00:00Z', 'archived', now).state).toBe('closed')
    expect(closingState(null, 'published', now)).toEqual({ state: 'open', days: null })
  })
})
