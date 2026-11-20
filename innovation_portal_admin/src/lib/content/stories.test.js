import { describe, expect, it } from 'vitest'
import { canAskConsent, canFeature, fromStory, needsConsent, storyProblems, toStoryPayload } from './stories'

describe('stories', () => {
  it('round-trips texts and drops empty results', () => {
    const f = fromStory({ person_name: 'Neo', quote: { en: 'We grew', tn: '' }, stats: [{ value: 40, label: { en: 'jobs', tn: 'ditiro' } }], sector: 3 })
    expect(f.sector).toBe('3')
    const payload = toStoryPayload({ ...f, stats: [...f.stats, { value: ' ', label: { en: 'x', tn: '' } }] })
    expect(payload.stats).toEqual([{ value: '40', label: { en: 'jobs', tn: 'ditiro' } }])
  })

  it('blocks a 4th featured story', () => {
    const list = [{ id: 'a', is_featured: true }, { id: 'b', is_featured: true }, { id: 'c', is_featured: true }, { id: 'd', is_featured: false }]
    expect(canFeature(list, 'd')).toBe(false)
    expect(canFeature(list, 'a')).toBe(true)
    expect(canFeature(list.slice(0, 2), 'd')).toBe(true)
  })

  it('needs consent before a story about a portal user is published', () => {
    expect(needsConsent({ user: 5, consent_status: 'requested' })).toBe(true)
    expect(needsConsent({ user: 5, consent_status: 'given' })).toBe(false)
    expect(needsConsent({ user: null })).toBe(false)
    expect(canAskConsent({ id: 's', user: 5, consent_status: 'not_asked' })).toBe(true)
    expect(canAskConsent({ id: 's', user: 5, consent_status: 'requested' })).toBe(false)
    const f = { ...fromStory({ person_name: 'Neo', user: 5 }), status: 'published' }
    expect(storyProblems(f, { user: 5, consent_status: 'requested' })).toEqual({ status: 'stories.needConsent' })
    expect(storyProblems(f, { user: 5, consent_status: 'given' })).toEqual({})
  })

  it('keeps the quote to 200 characters', () => {
    const f = { ...fromStory({ person_name: 'Neo' }), quote: { en: 'x'.repeat(201), tn: '' } }
    expect(storyProblems(f, null)).toEqual({ quote: 'stories.quoteLong' })
  })
})
