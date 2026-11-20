import { describe, expect, it } from 'vitest'
import { fromPartner, logoProblem, onHomeNow, partnerProblems, sortPartners, toPartnerPayload } from './partners'

const now = new Date('2026-11-20T10:00:00Z').getTime()

describe('partners', () => {
  it('round-trips dates as days', () => {
    const f = fromPartner({ name: 'BITRI', show_from: '2026-11-01T00:00:00Z', program_ids: [7] })
    expect(f.program_ids).toEqual(['7'])
    expect(toPartnerPayload({ ...f, show_from: '2026-11-01', show_until: '' })).toMatchObject({ name: 'BITRI', show_until: null })
  })

  it('checks name, link and dates', () => {
    expect(partnerProblems(fromPartner(null))).toEqual({ name: 'partners.needName' })
    expect(partnerProblems({ ...fromPartner({ name: 'A' }), url: 'example' })).toEqual({ url: 'partners.badUrl' })
    expect(partnerProblems({ ...fromPartner({ name: 'A' }), show_from: '2026-12-01', show_until: '2026-11-01' })).toEqual({ show_until: 'partners.untilAfter' })
  })

  it('takes PNG, JPG and WebP logos up to 10 MB', () => {
    expect(logoProblem({ type: 'image/png', size: 100 })).toBeNull()
    expect(logoProblem({ type: 'image/svg+xml', size: 100 })).toBe('partners.logoType')
    expect(logoProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toBe('partners.logoSize')
  })

  it('knows which partners show on the home page today', () => {
    const base = { is_active: true, show_on_home: true }
    expect(onHomeNow(base, now)).toBe(true)
    expect(onHomeNow({ ...base, show_on_home: false }, now)).toBe(false)
    expect(onHomeNow({ ...base, show_from: '2026-12-01T00:00:00Z' }, now)).toBe(false)
    expect(onHomeNow({ ...base, show_until: '2026-11-19T00:00:00Z' }, now)).toBe(false)
  })

  it('sorts like the public strip', () => {
    const list = [{ name: 'C', tier: 'supporter' }, { name: 'B', tier: 'partner', order: 2 }, { name: 'A', tier: 'partner', order: 1 }, { name: 'L', tier: 'lead_sponsor' }]
    expect(sortPartners(list).map((p) => p.name)).toEqual(['L', 'A', 'B', 'C'])
  })
})
