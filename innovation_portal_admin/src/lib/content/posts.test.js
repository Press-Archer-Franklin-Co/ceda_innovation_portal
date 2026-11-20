import { describe, expect, it } from 'vitest'
import { autosaves, canKeep, countByType, coverFileProblem, filterByState, fromPost, listStats, missingSetswana, postDate, postProblems, toPostPayload } from './posts'

const now = new Date('2026-11-20T10:00:00Z').getTime()
const posts = [
  { type: 'news', status: 'published', is_pinned: true, view_count: 100, published_at: '2026-11-12T08:00:00Z' },
  { type: 'event', status: 'published', is_pinned: false, view_count: 20 },
  { type: 'event', status: 'scheduled', publish_at: '2026-11-25T06:00:00Z' },
  { type: 'notice', status: 'scheduled', publish_at: '2026-11-23T06:00:00Z' },
  { type: 'newsletter', status: 'pending_approval', approval: { requested_at: '2026-11-18T09:00:00Z' } },
  { type: 'result', status: 'draft', view_count: 999 },
]

describe('posts list', () => {
  it('works out the cards from the list only', () => {
    expect(listStats(posts, now)).toEqual({ pinned: 1, nextScheduled: '2026-11-23T06:00:00Z', oldestWaitingDays: 2, totalViews: 120 })
    expect(listStats([], now)).toEqual({ pinned: 0, nextScheduled: null, oldestWaitingDays: null, totalViews: 0 })
  })

  it('counts by type and filters by state', () => {
    expect(countByType(posts)).toEqual({ news: 1, event: 2, opportunity: 0, result: 1, notice: 1, newsletter: 1 })
    expect(filterByState(posts, 'live')).toHaveLength(2)
    expect(filterByState(posts, 'scheduled')).toHaveLength(2)
    expect(filterByState(posts, 'approval')).toHaveLength(1)
    expect(filterByState(posts, 'all')).toHaveLength(6)
  })

  it('shows the live date, the scheduled date, or none', () => {
    expect(postDate(posts[0])).toBe('2026-11-12T08:00:00Z')
    expect(postDate(posts[2])).toBe('2026-11-25T06:00:00Z')
    expect(postDate(posts[5])).toBeNull()
  })
})

describe('post editor', () => {
  it('round-trips a post and sends type-only fields only for that type', () => {
    const f = fromPost({ type: 'event', title: { en: 'Clinic', tn: '' }, event_place: 'Maun', event_starts_at: '2026-11-28T07:00:00Z', mark_new_days: 7 })
    expect(f.mark_new).toBe(true)
    const payload = toPostPayload(f)
    expect(payload.event_place).toBe('Maun')
    expect(new Date(payload.event_starts_at).toISOString()).toBe('2026-11-28T07:00:00.000Z')
    expect(toPostPayload({ ...f, type: 'news' })).toMatchObject({ event_place: '', event_starts_at: null, newsletter_issue: null })
    expect(toPostPayload({ ...f, mark_new: false }).mark_new_days).toBe(0)
  })

  it('accepts a plain English string from older posts', () => {
    expect(fromPost({ title: 'Old post' }).title).toEqual({ en: 'Old post', tn: '' })
  })

  it('names what is missing before saving', () => {
    const f = fromPost(null, 'event')
    expect(postProblems(f, now)).toEqual({ title: 'post.needTitle', excerpt: 'post.needSummary', event_starts_at: 'post.needEventDate', event_place: 'post.needEventPlace' })
    expect(postProblems({ ...fromPost(null, 'newsletter'), title: { en: 'Nov', tn: '' }, excerpt: { en: 'News', tn: '' } }, now)).toEqual({ newsletter_issue: 'post.needIssue' })
    expect(postProblems({ ...fromPost(null), title: { en: 'A', tn: '' }, excerpt: { en: 'B', tn: '' }, publish_at: '2026-11-22T10:00', unpublish_at: '2026-11-21T10:00' }, now)).toEqual({ unpublish_at: 'post.takeDownAfter' })
  })

  it('lists texts without Setswana and autosaves only drafts', () => {
    expect(missingSetswana({ title: { en: 'A', tn: 'B' }, excerpt: { en: 'C', tn: '' }, body: { en: '', tn: '' } })).toEqual(['excerpt'])
    expect(autosaves(undefined)).toBe(true)
    expect(autosaves('draft')).toBe(true)
    expect(autosaves('published')).toBe(false)
  })
})

describe('saving drafts', () => {
  it('keeps a draft only when the API will take it', () => {
    const news = { ...fromPost(null), title: { en: 'A', tn: '' }, excerpt: { en: 'B', tn: '' } }
    expect(canKeep(news)).toBe(true)
    expect(canKeep({ ...news, excerpt: { en: '', tn: '' } })).toBe(false)
    expect(canKeep({ ...news, type: 'event' })).toBe(false)
    expect(canKeep({ ...news, type: 'event', event_starts_at: '2026-11-28T09:00', event_place: 'Maun' })).toBe(true)
  })
})

describe('post cover', () => {
  it('takes pictures up to 10 MB and videos up to 50 MB', () => {
    const MB = 1024 * 1024
    expect(coverFileProblem({ type: 'image/png', size: 10 * MB })).toBeNull()
    expect(coverFileProblem({ type: 'image/png', size: 10 * MB + 1 })).toBe('post.coverTooBig')
    expect(coverFileProblem({ type: 'video/mp4', size: 50 * MB })).toBeNull()
    expect(coverFileProblem({ type: 'video/mp4', size: 50 * MB + 1 })).toBe('post.coverTooBig')
    expect(coverFileProblem({ type: 'application/pdf', size: 1 })).toBe('post.coverWrongType')
  })
})
