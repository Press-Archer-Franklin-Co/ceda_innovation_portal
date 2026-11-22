import { describe, expect, it } from 'vitest'
import { unwrapActive } from './hackathon'

describe('active hackathon (3.36)', () => {
  it('takes the hackathon out of the API wrapper, so the page finds its id', () => {
    expect(unwrapActive({ hackathon: { id: 'h1', program: 'p1' } })).toEqual({ id: 'h1', program: 'p1' })
  })
  it('is empty when no hackathon is on, so the menu item hides', () => {
    expect(unwrapActive({ hackathon: null })).toBeNull()
    expect(unwrapActive(null)).toBeNull()
  })
})
