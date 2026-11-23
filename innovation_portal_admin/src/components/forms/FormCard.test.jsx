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

// What shows at a width: drop what Tailwind hides there (jsdom applies no media queries).
function shown(el, width) {
  const copy = el.cloneNode(true)
  for (const node of [...copy.querySelectorAll('*')]) {
    const c = node.getAttribute('class')?.split(/\s+/) ?? []
    const hidden = width === 'phone'
      ? c.includes('hidden')
      : c.includes('sm:hidden')
    if (hidden || c.includes('sr-only')) node.remove()
  }
  return copy.textContent
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
    expect(el.querySelector('.sm\\:bg-accent-soft svg.sm\\:stroke-accent')).not.toBeNull()
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

  it('below 640px is the short row: name, status and answers only', () => {
    const text = shown(card(), 'phone')
    for (const fact of ['Youth Agri-Innovation entry', 'Published', '312 answers']) expect(text).toContain(fact)
    for (const gone of ['Youth Agri-Innovation 2026', 'EN · TN', '12 questions', 'edited']) expect(text).not.toContain(gone)
    expect(shown(card({ ...form, answer_count: 0 }), 'phone')).toContain('No answers yet')
  })

  it('the phone row keeps the whole-row link and the menu, with the neutral tile', () => {
    const el = card()
    expect(el.querySelector('a[href="/forms/f1"]').className).toContain('after:inset-0')
    expect(el.querySelector('button[aria-haspopup="menu"]').closest('.hidden')).toBeNull()
    expect(el.querySelector('span.h-10.w-10.bg-surface2 svg.stroke-muted')).not.toBeNull()
  })

  it('from 640px keeps every fact of the card', () => {
    const text = shown(card(), 'desktop')
    for (const fact of ['Youth Agri-Innovation 2026', 'Published', 'EN · TN', '312 answers', '12 questions · 2 steps']) expect(text).toContain(fact)
  })
})
