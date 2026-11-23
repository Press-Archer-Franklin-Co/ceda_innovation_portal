import { describe, expect, it } from 'vitest'
import { lastSignIn, whatTheyCanDo } from './users'
import { copyableCapabilities } from './roles'
import { userFilters, userStatus } from '../api/users'

const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), {
  'users.never': 'Never', 'users.today': 'Today, {time}', 'users.yesterday': 'Yesterday', 'users.daysAgo': '{n} days ago',
  'users.monthAgo': '1 month ago', 'users.monthsAgo': '{n} months ago', 'users.and': ' and ', 'users.canDo': '{roles} can {what}.',
  'users.canDoNothing': '{roles} cannot do anything yet.', 'users.publishNeedsApprover': 'Publishing still needs an approver.',
}[key] ?? key)

const catalogue = {
  groups: ['overview', 'ideas', 'website', 'administration'],
  capabilities: [
    { key: 'dashboard.view', group: 'overview', label: { en: 'See the dashboard' } },
    { key: 'entries.review', group: 'ideas', label: { en: 'Work on review tasks' } },
    { key: 'content.edit', group: 'website', label: { en: 'Edit website content' } },
    { key: 'content.approve', group: 'website', label: { en: 'Approve website content' } },
    { key: 'users.manage', group: 'administration', label: { en: 'Manage people and roles' }, locked_to: ['administrator'] },
    { key: 'new.thing', group: 'ideas', label: { en: 'A new thing' } },
  ],
}

describe('3.23 users helpers', () => {
  const now = new Date(2026, 10, 22, 15, 0)
  it('says when someone last signed in, in plain words', () => {
    expect(lastSignIn(null, t, now)).toBe('Never')
    expect(lastSignIn(new Date(2026, 10, 22, 8, 12).toISOString(), t, now)).toBe('Today, 08:12')
    expect(lastSignIn(new Date(2026, 10, 21, 23, 0).toISOString(), t, now)).toBe('Yesterday')
    expect(lastSignIn(new Date(2026, 10, 19).toISOString(), t, now)).toBe('3 days ago')
    expect(lastSignIn(new Date(2026, 8, 20).toISOString(), t, now)).toBe('2 months ago')
  })
  it('describes what the chosen roles can do', () => {
    const roles = [
      { code: 'innovation_officer', name: { en: 'Officer' }, capabilities: ['entries.review'] },
      { code: 'content_editor', name: { en: 'Content editor' }, capabilities: ['content.edit'] },
    ]
    expect(whatTheyCanDo(['innovation_officer', 'content_editor'], roles, catalogue, 'en', t))
      .toBe('Officer and Content editor can work on review tasks and edit website content. Publishing still needs an approver.')
    expect(whatTheyCanDo([], roles, catalogue, 'en', t)).toBe('')
  })
  it('reads the status and builds list filters', () => {
    expect(userStatus({ is_active: false })).toBe('deactivated')
    expect(userStatus({ is_active: true })).toBe('active')
    expect(userStatus({ status: 'invited', is_active: true })).toBe('invited')
    expect(userFilters({ role: '', status: 'deactivated' })).toEqual({ status: 'deactivated' })
    expect(userFilters({ role: 'judge', status: 'all' })).toEqual({ role: 'judge' })
  })
})

describe('3.24 copy a role', () => {
  it('never copies a capability only administrators may hold', () => {
    expect(copyableCapabilities({ capabilities: ['users.manage', 'entries.review'] }, catalogue)).toEqual(['entries.review'])
  })
})
