import { describe, expect, it } from 'vitest'
import { move, normaliseMeanings, nudge, setCommentRule, splitEvenly, toPayload, toggleLibrary, total } from './judging'

const c = (name, weight, extra = {}) => ({ name, weight, ...extra })

describe('weights', () => {
  it('splits evenly into whole numbers that make 100', () => {
    const three = splitEvenly([c('a', 0), c('b', 0), c('c', 0)])
    expect(three.map((x) => x.weight)).toEqual([34, 33, 33])
    expect(total(three)).toBe(100)
    expect(splitEvenly([c('a', 10), c('b', 10), c('c', 10), c('d', 10), c('e', 10)]).map((x) => x.weight)).toEqual([20, 20, 20, 20, 20])
  })

  it('nudges by 5 and stays between 0 and 100', () => {
    expect(nudge([c('a', 0)], 0, -1)[0].weight).toBe(0)
    expect(nudge([c('a', 98)], 0, 1)[0].weight).toBe(100)
    expect(nudge([c('a', 20)], 0, 1)[0].weight).toBe(25)
  })
})

describe('library', () => {
  it('ticks a library item in with weight 0 and five meanings, and out again', () => {
    const item = { id: 'lib-1', name: 'Fresh idea', description: 'New for Botswana?', score_meanings: ['Copies', 'Small change'] }
    const on = toggleLibrary([], item)
    expect(on).toHaveLength(1)
    expect(on[0]).toMatchObject({ library_id: 'lib-1', name: 'Fresh idea', weight: 0 })
    expect(on[0].score_meanings).toHaveLength(5)
    expect(on[0].score_meanings[0]).toEqual({ en: 'Copies', tn: '' })
    expect(toggleLibrary(on, item)).toEqual([])
  })
})

describe('payload', () => {
  it('keeps ids, library ids, order and numbers', () => {
    const state = {
      criteria: move([c('a', 50, { id: 'x' }), c('b', 50, { library_id: 'lib' })], 1, 0).map((x, i) => (i === 0 ? setCommentRule(x, true) : x)),
      pass_mark: '60',
      reviewers_per_idea: '',
    }
    const body = toPayload(state)
    expect(body.criteria.map((x) => x.name)).toEqual(['b', 'a'])
    expect(body.criteria[0]).toMatchObject({ library_id: 'lib', weight: 50, comment_required_scores: [1, 5] })
    expect(body.criteria[0].id).toBeUndefined()
    expect(body.criteria[1].id).toBe('x')
    expect(body.pass_mark).toBe(60)
    expect(body.reviewers_per_idea).toBeNull()
    expect(normaliseMeanings(undefined)).toHaveLength(5)
  })
})
