import { describe, expect, it } from 'vitest'
import { COVER_MAX_BYTES, coverProblem } from './cover'

describe('coverProblem', () => {
  it('accepts JPG, PNG and WebP up to 10 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(coverProblem({ type, size: COVER_MAX_BYTES })).toBeNull()
  })
  it('refuses other file types, such as SVG and PDF', () => {
    expect(coverProblem({ type: 'image/svg+xml', size: 10 })).toBe('cover.wrongType')
    expect(coverProblem({ type: 'application/pdf', size: 10 })).toBe('cover.wrongType')
  })
  it('refuses pictures over 10 MB', () => {
    expect(coverProblem({ type: 'image/png', size: COVER_MAX_BYTES + 1 })).toBe('cover.tooBig')
  })
})
