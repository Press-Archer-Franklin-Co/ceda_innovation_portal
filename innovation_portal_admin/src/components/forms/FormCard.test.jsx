// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import I18nProvider from '../../i18n/I18nProvider'
import FormCard from './FormCard'

const form = {
  id: 'f1',
  name: 'Youth Agri-Innovation entry',
  status: 'live',
  languages: ['en', 'tn'],
  linked_programs: [{ title: 'Youth Agri-Innovation 2026' }],
  answer_count: 312,
  question_count: 12,
  step_count: 2,
  updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  // Seeded forms put many fields on a row: this used to spill out of the card as a sketch.
  layout_preview: [['quarter', 'quarter', 'quarter', 'quarter', 'half', 'half'], ['full']],
}
const card = (f = form) => {
  const div = document.createElement('div')
  div.innerHTML = renderToStaticMarkup(
    <I18nProvider><MemoryRouter><FormCard form={f} actions={[{ key: 'open', label: 'Open' }]} /></MemoryRouter></I18nProvider>,
  )
  return div
}

describe('FormCard (3.4)', () => {
  it('shows the facts from the frame', () => {
    const text = card().textContent
    for (const fact of ['Youth Agri-Innovation entry', 'Youth Agri-Innovation 2026', 'Published', 'EN · TN', '312 answers', '12 questions · 2 steps · edited 2 days ago']) {
      expect(text).toContain(fact)
    }
  })

  it('has the document icon tile and no sketch of the layout', () => {
    const el = card()
    expect(el.querySelector('.bg-accent-soft svg.stroke-accent')).not.toBeNull()
    expect(el.querySelector('.grid-cols-4')).toBeNull()
    expect(el.querySelector('.bg-border')).toBeNull()
    expect(el.querySelector('img')).toBeNull()
  })

  it('opens the builder from the whole card and keeps the menu', () => {
    const el = card()
    const link = el.querySelector('a[href="/forms/f1"]')
    expect(link.className).toContain('after:inset-0')
    expect(el.querySelector('button[aria-haspopup="menu"]')).not.toBeNull()
  })

  it('a one-step form with no answers shows a dash and no step count', () => {
    const text = card({ ...form, status: 'draft', answer_count: 0, step_count: 1 }).textContent
    expect(text).toContain('–')
    expect(text).toContain('No answers yet')
    expect(text).not.toContain('steps')
  })
})
