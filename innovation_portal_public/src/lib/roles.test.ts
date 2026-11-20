import { describe, expect, it } from 'vitest'
import type { AuthUser } from '../context/AuthContext'
import { isInnovator, isStaff } from './roles'

const base: AuthUser = {
  id: '1', email: 'a@example.org', name: 'A B', first_name: 'A', last_name: 'B',
  email_verified: true, primary_auth_method: 'email', roles: [], capabilities: [],
}

describe('isStaff (S1)', () => {
  it('is false for an innovator with no capabilities', () => {
    expect(isStaff({ ...base, roles: ['innovator'] })).toBe(false)
  })
  it('follows capabilities, not role names', () => {
    expect(isStaff({ ...base, roles: ['innovation_officer'], capabilities: [] })).toBe(false)
    expect(isStaff({ ...base, roles: [], capabilities: ['entries.review'] })).toBe(true)
  })
  it('is false when signed out', () => {
    expect(isStaff(null)).toBe(false)
  })
})

describe('isInnovator', () => {
  it('is true only with an innovator account', () => {
    expect(isInnovator({ ...base, roles: ['innovator', 'judge'] })).toBe(true)
    expect(isInnovator({ ...base, roles: ['judge'] })).toBe(false)
  })
})
