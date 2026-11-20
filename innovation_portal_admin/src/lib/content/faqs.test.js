import { describe, expect, it } from 'vitest'
import { NO_GROUP, faqOrderPayload, faqProblems, fromFaq, groupFaqs, missingSetswana, moveItem, toFaqPayload } from './faqs'

const groups = [{ id: 'g1', name: 'Entering', ordering: 0 }, { id: 'g2', name: 'Money', ordering: 1 }]
const faqs = [
  { id: 'a', question: 'B?', answer: 'x', group: 'g1', ordering: 2 },
  { id: 'b', question: 'A?', answer: 'x', group: 'g1', ordering: 1 },
  { id: 'c', question: 'C?', answer: 'x', group: 'g2', ordering: 0 },
  { id: 'd', question: 'D?', answer: 'x', group: null, ordering: 0 },
  { id: 'e', question: 'E?', answer: 'x', group: 'gone', ordering: 0 },
]

describe('faqs', () => {
  it('groups questions in order, with unknown or missing groups last', () => {
    const by = groupFaqs(faqs, groups)
    expect(by.g1.map((f) => f.id)).toEqual(['b', 'a'])
    expect(by[NO_GROUP].map((f) => f.id)).toEqual(['d', 'e'])
  })

  it('numbers questions across groups so each group stays together', () => {
    const by = groupFaqs(faqs, groups)
    expect(faqOrderPayload(['g2', 'g1'], by).map((x) => x.id)).toEqual(['c', 'b', 'a', 'd', 'e'])
    expect(faqOrderPayload(['g2', 'g1'], by).map((x) => x.ordering)).toEqual([0, 1, 2, 3, 4])
  })

  it('moves an item', () => {
    expect(moveItem(groups, 'g2', 'g1').map((g) => g.id)).toEqual(['g2', 'g1'])
  })

  it('round-trips Setswana and drops the challenge unless it shows on a challenge', () => {
    const form = { ...fromFaq(null, 'g1'), question: { en: 'Q', tn: 'P' }, answer: { en: 'A', tn: '' }, program: '7' }
    expect(form.group).toBe('g1')
    expect(toFaqPayload(form)).toMatchObject({ question: 'Q', translations: { tn: { question: 'P' } }, program: null, group: 'g1' })
    expect(toFaqPayload({ ...form, placements: ['program'] }).program).toBe('7')
    expect(fromFaq(null, NO_GROUP).group).toBeNull()
  })

  it('names what is missing', () => {
    expect(faqProblems(fromFaq(null))).toEqual({ question: 'faqs.needQuestion', answer: 'faqs.needAnswer' })
    expect(faqProblems({ ...fromFaq(null), question: { en: 'Q', tn: '' }, answer: { en: 'A', tn: '' }, placements: ['program'] })).toEqual({ program: 'faqs.needProgram' })
    expect(missingSetswana({ question: 'Q', answer: 'A', translations: { tn: { question: 'P' } } })).toBe(true)
    expect(missingSetswana({ question: 'Q', answer: 'A', translations: { tn: { question: 'P', answer: 'K' } } })).toBe(false)
  })
})
