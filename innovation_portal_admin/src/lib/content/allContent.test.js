import { describe, expect, it } from 'vitest'
import { LANGS, PAGE_SIZE, STATUSES, allParams, fromAll } from './allContent'

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

  it('asks for rows that have Setswana with tn_has', () => {
    expect(allParams({ lang: 'tn' })).toMatchObject({ lang: 'tn_has' })
    expect(allParams({ lang: 'something' })).not.toHaveProperty('lang')
  })

  it('passes Scheduled to the server', () => {
    expect(allParams({ status: 'scheduled' })).toMatchObject({ status: 'scheduled' })
  })

  it('leaves out a blank search', () => {
    expect(allParams({ q: '   ' })).not.toHaveProperty('search')
  })

  it('offers the filters in frame 3.38', () => {
    expect(STATUSES).toEqual(['draft', 'pending_approval', 'scheduled', 'published', 'archived'])
    expect(LANGS).toEqual(['tn', 'missing'])
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

describe('all content: policy pages', () => {
  it('opens a policy row in Terms and policies by its key', () => {
    const r = fromAll({ type: 'policy', id: 'terms_of_use', title: 'Terms of use', has_setswana: true, status: 'pending_approval', updated_at: '2026-11-21T08:00:00+00:00', updated_by: 'Tebogo M.', pending_approval_id: 'p9' })
    expect(r).toMatchObject({ key: 'policy:terms_of_use', id: 'terms_of_use', status: 'pending_approval', hasSetswana: true, approvalId: 'p9' })
    expect(r.href).toBe('/content/policies?page=terms_of_use')
  })

  it('shows a scheduled news post as scheduled', () => {
    expect(fromAll({ type: 'news', id: '4', title: 'Results day', has_setswana: true, status: 'scheduled', updated_at: null, updated_by: '' }).status).toBe('scheduled')
  })
})
