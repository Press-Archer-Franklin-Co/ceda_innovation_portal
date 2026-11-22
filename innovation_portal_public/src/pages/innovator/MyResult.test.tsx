import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Attend, FeedbackPoints } from './MyResult'

describe('My result (2.11, R-54)', () => {
  it('shows what the panel liked and what to work on as two cards', () => {
    const html = renderToStaticMarkup(<FeedbackPoints points={{ liked: ['Low cost per household'], work_on: ['Add the cost of a pilot'] }} />)
    expect(html).toContain('What the panel liked')
    expect(html).toContain('Low cost per household')
    expect(html).toContain('What to work on')
    expect(html).toContain('Add the cost of a pilot')
  })

  it('leaves out a card with no points', () => {
    const html = renderToStaticMarkup(<FeedbackPoints points={{ liked: ['Clear plan'], work_on: [] }} />)
    expect(html).toContain('What the panel liked')
    expect(html).not.toContain('What to work on')
  })

  it('offers "Confirm I will attend", then shows the answer', () => {
    const base = { confirmed: false, can_confirm: true, event_date: '2026-12-05T07:00:00Z' }
    expect(renderToStaticMarkup(<Attend slug="clean-water" initial={{ ...base, answer: null }} />)).toContain('Confirm I will attend')
    const yes = renderToStaticMarkup(<Attend slug="clean-water" initial={{ ...base, confirmed: true, answer: true }} />)
    expect(yes).toContain('You will attend')
    expect(yes).toContain('I can no longer attend')
    expect(renderToStaticMarkup(<Attend slug="clean-water" initial={{ ...base, answer: false }} />)).toContain('You told us you cannot attend')
  })
})
