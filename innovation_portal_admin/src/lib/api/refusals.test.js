import { describe, expect, it } from 'vitest'
import { isRefused, pollEvery, retryUnlessRefused } from './refusals'

const query = (error) => ({ state: { error } })

describe('refusals', () => {
  it('knows 401 and 403', () => {
    expect(isRefused({ status: 401 })).toBe(true)
    expect(isRefused({ status: 403 })).toBe(true)
    expect(isRefused({ status: 500 })).toBe(false)
    expect(isRefused(null)).toBe(false)
  })
  it('stops polling after a refusal', () => {
    const interval = pollEvery(30_000)
    expect(interval(query(null))).toBe(30_000)
    expect(interval(query({ status: 500 }))).toBe(30_000)
    expect(interval(query({ status: 403 }))).toBe(false)
    expect(interval(query({ status: 401 }))).toBe(false)
  })
  it('retries once, never after a refusal', () => {
    expect(retryUnlessRefused(0, { status: 500 })).toBe(true)
    expect(retryUnlessRefused(1, { status: 500 })).toBe(false)
    expect(retryUnlessRefused(0, { status: 403 })).toBe(false)
  })
})
