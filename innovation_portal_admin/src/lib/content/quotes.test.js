import { describe, expect, it } from 'vitest'
import { bandSection, fromCard, moveCard, quoteProblems, reorderPayload, showsNow, toCardPayload } from './quotes'

const now = new Date('2026-11-20T10:00:00Z').getTime()
const cards = [
  { id: 'a', full_name: 'A', job_title: 'CEO', quote: 'One', is_active: true, needs_approval: false, translations: { tn: { quote: 'Nngwe' } } },
  { id: 'b', full_name: 'B', job_title: 'Chair', quote: 'Two', is_active: false, needs_approval: false },
  { id: 'c', full_name: 'C', job_title: 'Minister', quote: 'Three', is_active: true, needs_approval: true },
  { id: 'd', full_name: 'D', job_title: 'COO', quote: 'Four', is_active: true, needs_approval: false, end_at: '2026-11-19T00:00:00Z' },
]

describe('leadership quotes', () => {
  it('shows only quotes that are on, not ended and approved', () => {
    expect(cards.map((c) => showsNow(c, now))).toEqual([true, false, false, false])
  })

  it('builds the home band in the public shape, in the chosen language', () => {
    const band = bandSection(cards, 8, 'tn', now)
    expect(band.type).toBe('leadership_quotes')
    expect(band.data).toEqual({ rotation_seconds: 8, items: [{ id: 'a', name: 'A', job_title: 'CEO', committee_role: undefined, quote: 'Nngwe', photo_url: null }] })
  })

  it('reorders and numbers the cards for the API', () => {
    const moved = moveCard(cards, 'c', 'a')
    expect(moved.map((c) => c.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(reorderPayload(moved)).toEqual([{ id: 'c', sort_order: 0 }, { id: 'a', sort_order: 1 }, { id: 'b', sort_order: 2 }, { id: 'd', sort_order: 3 }])
  })

  it('keeps other translations and drops an empty Setswana quote', () => {
    const card = { translations: { tn: { quote: 'Old', note: 'keep' } } }
    const f = { ...fromCard(card), full_name: 'A', job_title: 'B', quote: { en: 'Hi', tn: '' } }
    expect(toCardPayload(f, card).translations).toEqual({ tn: { note: 'keep' } })
    expect(toCardPayload({ ...f, quote: { en: 'Hi', tn: 'Dumela' } }, {}).translations).toEqual({ tn: { quote: 'Dumela' } })
  })

  it('checks the 180 character limit in both languages', () => {
    const f = { ...fromCard(null), full_name: 'A', job_title: 'B', quote: { en: 'x'.repeat(180), tn: '' } }
    expect(quoteProblems(f)).toEqual({})
    expect(quoteProblems({ ...f, quote: { en: 'x', tn: 'y'.repeat(181) } })).toEqual({ quote: 'quotes.tooLong' })
    expect(quoteProblems(fromCard(null))).toEqual({ full_name: 'quotes.needName', job_title: 'quotes.needTitle', quote: 'quotes.needQuote' })
  })
})
