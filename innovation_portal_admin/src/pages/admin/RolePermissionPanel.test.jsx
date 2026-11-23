// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import I18nProvider from '../../i18n/I18nProvider'
import { groupSummary, levelOf, permissionGroups, toggleGroup } from '../../lib/admin/roles'
import RolePermissionPanel from './RolePermissionPanel'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const catalogue = {
  groups: ['ideas', 'website', 'administration'],
  capabilities: [
    { key: 'entries.review', group: 'ideas', label: { en: 'Work on review tasks' } },
    { key: 'entries.search', group: 'ideas', label: { en: 'Search every idea' } },
    { key: 'content.edit', group: 'website', area: 'content', area_label: { en: 'Website pages' }, label: { en: 'Edit content' } },
    { key: 'content.approve', group: 'website', area: 'content', area_label: { en: 'Website pages' }, label: { en: 'Approve content' } },
    { key: 'users.manage', group: 'administration', label: { en: 'Manage people' } },
    { key: 'settings.manage', group: 'administration', label: { en: 'Change settings' } },
    { key: 'brand.new', label: { en: 'A permission with no group' } },
    { key: 'other.thing', group: 'not_in_the_list', label: { en: 'A permission in an unknown group' } },
  ],
}
const group = (key) => permissionGroups(catalogue).find((g) => g.key === key)

describe('3.24 groups from the capability map', () => {
  it('keeps the API order and puts anything without a group under Other, last', () => {
    const groups = permissionGroups(catalogue)
    expect(groups.map((g) => g.key)).toEqual(['ideas', 'website', 'administration', 'other'])
    expect(group('other').keys).toEqual(['brand.new', 'other.thing'])
  })
  it('puts capabilities of one area on one line, in their columns', () => {
    expect(group('website').rows).toHaveLength(1)
    expect(group('website').rows[0]).toMatchObject({ edit: 'content.edit', approve: 'content.approve' })
    expect(levelOf({ key: 'audit.view' })).toBe('view')
    expect(levelOf({ key: 'content.approve' })).toBe('approve')
    expect(levelOf({ key: 'forms.manage' })).toBe('edit')
    expect(levelOf({ key: 'forms.manage', level: 'view' })).toBe('view')
  })
  it('gives the group box all, some or none', () => {
    const ideas = group('ideas')
    expect(groupSummary(ideas, []).state).toBe('none')
    expect(groupSummary(ideas, ['entries.review'])).toMatchObject({ state: 'some', on: 1, total: 2 })
    expect(groupSummary(ideas, ['entries.review', 'entries.search']).state).toBe('all')
  })
  it('the group box turns on what is free, then off, and never touches locked boxes', () => {
    const admin = group('administration')
    const locks = { 'users.manage': 'Only administrators can have this.' }
    expect(toggleGroup(admin, ['audit.view'], locks)).toEqual(['audit.view', 'settings.manage'])
    expect(toggleGroup(admin, ['settings.manage', 'users.manage'], locks)).toEqual(['users.manage'])
  })
})

describe('3.24 panel', () => {
  let root, el
  afterEach(() => { act(() => root.unmount()); el.remove() })
  const mount = (props) => {
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
    act(() => root.render(<I18nProvider><RolePermissionPanel catalogue={catalogue} wide editable onCopy={() => {}} {...props} /></I18nProvider>))
  }
  const box = (name) => el.querySelector(`input[aria-label="All permissions in ${name}"]`)
  const button = (text) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)
  const role = { id: 'r1', name: { en: 'Reviewer' }, capabilities: ['entries.review'], is_system: false }

  it('shows the count and the mixed state, closed until a row is opened', () => {
    mount({ role })
    expect(el.textContent).toContain('1 of 2 on')
    expect(box('Ideas and reviews').indeterminate).toBe(true)
    expect(box('Website content').checked).toBe(false)
    expect(el.textContent).not.toContain('Work on review tasks')
    act(() => el.querySelector('button[aria-label="Show the permissions in Ideas and reviews"]').click())
    expect(el.textContent).toContain('Work on review tasks')
    act(() => el.querySelector('button[aria-label="Show the permissions in Website content"]').click())
    expect(el.textContent).not.toContain('Work on review tasks')
  })
  it('saves a change from the sticky bar, and Cancel puts it back', () => {
    const onSave = vi.fn()
    mount({ role, onSave })
    expect(el.textContent).not.toContain('Unsaved changes')
    act(() => box('Ideas and reviews').click())
    expect(el.textContent).toContain('Unsaved changes')
    act(() => button('Cancel').click())
    expect(el.textContent).not.toContain('Unsaved changes')
    act(() => box('Website content').click())
    act(() => button('Save').click())
    expect(onSave).toHaveBeenCalledWith(['content.approve', 'content.edit', 'entries.review'])
  })
  it('keeps built-in roles read-only and shows Other', () => {
    mount({ role: { ...role, is_system: true }, editable: false })
    expect(box('Ideas and reviews').disabled).toBe(true)
    expect(el.textContent).toContain('Other')
    expect(el.textContent).toContain('Built-in role. Copy it to make changes.')
  })
})
