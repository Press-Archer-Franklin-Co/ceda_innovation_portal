import { describe, expect, it } from 'vitest'
import { LANGS, PAGE_SIZE, STATUSES, allParams, byRecent, filterRows, fromAll, fromPolicy } from './allContent'

describe('all content: request', () => {
  it('asks for the first page of 20 with no filters', () => {
    expect(allParams({})).toEqual({ page: 1, page_size: PAGE_SIZE })
    expect(PAGE_SIZE).toBe(20)
  })

  it('passes type, status, missing Setswana, a trimmed search and the page to the server', () => {
    expect(allParams({ type: 'news', status: 'pending_approval', lang: 'missing', q: '  hackathon ', page: 3 })).toEqual({
      page: 3,
      page_size: 20,
      type: 'news',
      status: 'pending_approval',
      lang: 'tn_missing',
      search: 'hackathon',
    })
  })

  it('leaves out a blank search', () => {
    expect(allParams({ q: '   ' })).not.toHaveProperty('search')
  })

  it('offers only the filters the server takes', () => {
    expect(STATUSES).toEqual(['draft', 'pending_approval', 'published', 'archived'])
    expect(LANGS).toEqual(['missing'])
  })
})

describe('all content: rows from the single list', () => {
  const item = {
    type: 'news',
    id: '7',
    title: 'Applications open',
    has_setswana: false,
    status: 'pending_approval',
    updated_at: '2026-11-22T08:00:00+00:00',
    updated_by: 'Neo M.',
    pending_approval_id: 'a1',
  }

  it('maps one row and links it to its editor', () => {
    expect(fromAll(item)).toEqual({
      key: 'news:7',
      type: 'news',
      id: '7',
      title: 'Applications open',
      hasSetswana: false,
      status: 'pending_approval',
      updatedAt: '2026-11-22T08:00:00+00:00',
      updatedBy: 'Neo M.',
      approvalId: 'a1',
      href: '/content/news/7',
    })
  })

  it('keeps "no Setswana needed" apart from "missing Setswana"', () => {
    const partner = fromAll({ ...item, type: 'partner', id: 3, has_setswana: null, pending_approval_id: null })
    expect(partner.hasSetswana).toBeNull()
    expect(partner.href).toBe('/content/partners')
    expect(partner.id).toBe('3')
  })

  it('links pages by slug and FAQs by id', () => {
    expect(fromAll({ ...item, type: 'page', id: 'home' }).href).toBe('/content/home')
    expect(fromAll({ ...item, type: 'faq', id: '12' }).href).toBe('/content/faqs/12')
  })

  it('drops a type it has no screen for, and never invents a status', () => {
    expect(fromAll({ ...item, type: 'newsletter' })).toBeNull()
    expect(fromAll(null)).toBeNull()
    expect(fromAll({ ...item, type: 'page', id: 'about-ceda' })).toBeNull()
    expect(fromAll({ ...item, status: 'something_new' }).status).toBe('draft')
  })
})

describe('all content: policy pages (until R-62)', () => {
  const policies = [
    { key: 'privacy', name: 'Privacy', title: 'Privacy notice', published_at: '2026-11-20T08:00:00Z', pending_approval: false, missing_setswana: false },
    { key: 'terms_of_use', name: 'Terms of use', title: '', published_at: '2026-11-21T08:00:00Z', pending_approval: true, missing_setswana: true },
    { key: 'about', name: 'About', title: 'About', published_at: null, pending_approval: false, missing_setswana: null },
  ].map(fromPolicy)

  it('works out the status and Setswana from the policy list', () => {
    expect(policies.map((r) => [r.id, r.status, r.hasSetswana, r.href])).toEqual([
      ['privacy', 'published', true, '/content/policies?page=privacy'],
      ['terms_of_use', 'pending_approval', false, '/content/policies?page=terms_of_use'],
      ['about', 'draft', null, '/content/policies?page=about'],
    ])
    expect(policies[1].title).toBe('Terms of use')
  })

  it('filters by status, missing Setswana and title, and sorts newest first', () => {
    expect(filterRows(policies, { lang: 'missing' }).map((r) => r.id)).toEqual(['terms_of_use'])
    expect(filterRows(policies, { status: 'published' }).map((r) => r.id)).toEqual(['privacy'])
    expect(filterRows(policies, { q: ' PRIV' }).map((r) => r.id)).toEqual(['privacy'])
    expect([...policies].sort(byRecent).map((r) => r.id)).toEqual(['terms_of_use', 'privacy', 'about'])
  })
})
