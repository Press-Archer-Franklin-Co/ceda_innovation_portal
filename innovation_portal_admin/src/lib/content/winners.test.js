import { describe, expect, it } from 'vitest'
import { defaultWinnersChallenge } from './winners'

const now = Date.parse('2026-11-22T15:00:00Z')

describe('defaultWinnersChallenge (3.37)', () => {
  it('opens on the challenge whose results went out most recently', () => {
    const list = [
      { id: 1, status: 'published', results_announced_at: null },
      { id: 2, status: 'published', results_announced_at: '2026-10-01T08:00:00Z' },
      { id: 3, status: 'published', results_announced_at: '2026-11-22T13:12:00Z' },
      { id: 4, status: 'closed', results_announced_at: null },
    ]
    expect(defaultWinnersChallenge(list, now).id).toBe(3)
  })
  it('ignores results set for later, then falls back to a closed challenge, then the first', () => {
    expect(defaultWinnersChallenge([{ id: 1, status: 'published', results_announced_at: '2026-12-01T00:00:00Z' }, { id: 2, status: 'closed' }], now).id).toBe(2)
    expect(defaultWinnersChallenge([{ id: 7, status: 'published' }], now).id).toBe(7)
    expect(defaultWinnersChallenge([], now)).toBeNull()
  })
})
