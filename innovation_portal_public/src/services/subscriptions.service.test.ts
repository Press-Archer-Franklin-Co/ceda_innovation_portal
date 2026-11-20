import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
vi.mock('./api', () => ({ default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }))

const { subscriptionsService } = await import('./subscriptions.service')

describe('subscription links', () => {
  beforeEach(() => { get.mockReset(); post.mockReset() })

  it('confirms with the token in the API path', async () => {
    get.mockResolvedValue({ data: {} })
    expect(await subscriptionsService.confirm('abc')).toBe('done')
    expect(get).toHaveBeenCalledWith('/content/public/subscriptions/confirm/abc/')
  })
  it('says a 404 link does not work', async () => {
    get.mockRejectedValue({ response: { status: 404 } })
    expect(await subscriptionsService.unsubscribe('abc')).toBe('invalid')
  })
  it('says when there were too many tries', async () => {
    get.mockRejectedValue({ response: { status: 429 } })
    expect(await subscriptionsService.confirm('abc')).toBe('busy')
  })
  it('offers a retry for other failures', async () => {
    get.mockRejectedValue({ response: { status: 500 } })
    expect(await subscriptionsService.confirm('abc')).toBe('error')
    get.mockRejectedValue(new Error('offline'))
    expect(await subscriptionsService.unsubscribe('abc')).toBe('error')
  })
  it('signs up through the public endpoint', async () => {
    post.mockResolvedValue({ data: {} })
    await subscriptionsService.subscribe({ email: 'a@example.org', language: 'en' })
    expect(post).toHaveBeenCalledWith('/content/public/subscriptions/', { email: 'a@example.org', language: 'en' })
  })
})
