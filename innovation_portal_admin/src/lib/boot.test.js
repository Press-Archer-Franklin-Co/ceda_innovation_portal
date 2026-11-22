import { describe, expect, it, vi } from 'vitest'
import { createBoot } from './boot'

describe('start-up progress', () => {
  it('counts real steps, once each, and finishes when all are done', () => {
    const boot = createBoot(['me', 'config', 'page'], { timeoutMs: 0 })
    const seen = []
    boot.subscribe((s) => seen.push(s.done))
    boot.done('me')
    boot.done('me')
    boot.done('nothing')
    expect(boot.state()).toMatchObject({ done: 1, total: 3, finished: false })
    boot.done('config')
    boot.done('page')
    expect(boot.state()).toMatchObject({ done: 3, finished: true, failed: null })
    expect(seen).toEqual([1, 2, 3])
  })

  it('a failed step ends start-up with the error', () => {
    const boot = createBoot(['me', 'config'], { timeoutMs: 0 })
    boot.done('me')
    boot.fail('config')
    boot.done('config')
    expect(boot.state()).toMatchObject({ done: 1, finished: false, failed: { step: 'config', reason: 'error' } })
  })

  it('never waits forever: no answer in time is a failure', () => {
    vi.useFakeTimers()
    const boot = createBoot(['me', 'page'], { timeoutMs: 1000 })
    boot.done('me')
    vi.advanceTimersByTime(1001)
    expect(boot.state().failed).toEqual({ step: 'page', reason: 'timeout' })
    vi.useRealTimers()
  })

  it('tells the menu when the loader has gone, also to late listeners', () => {
    const boot = createBoot(['me'], { timeoutMs: 0 })
    const early = vi.fn()
    boot.onLoaderGone(early)
    boot.loaderGone()
    const late = vi.fn()
    boot.onLoaderGone(late)
    expect(early).toHaveBeenCalledTimes(1)
    expect(late).toHaveBeenCalledTimes(1)
  })
})
