import { describe, expect, it } from 'vitest'
import { basicsOnlyFrom } from './usePublicConfig'

describe('basicsOnlyFrom ("Send ideas with just the basics")', () => {
  it('is on when the switch is on', () => {
    expect(basicsOnlyFrom({ features: { quick_start_basics_only: true } })).toBe(true)
  })
  it('is off only when the switch is off', () => {
    expect(basicsOnlyFrom({ features: { quick_start_basics_only: false } })).toBe(false)
  })
  it('counts unknown as on, like the API default', () => {
    expect(basicsOnlyFrom(null)).toBe(true)
    expect(basicsOnlyFrom({ features: {} })).toBe(true)
  })
})
