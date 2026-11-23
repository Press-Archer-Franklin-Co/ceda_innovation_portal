// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  advance, collectMenu, collectTargets, findTarget, guideAvailability, guideRequest, normaliseGuide, questionLanguage, routeMatches, stepDone,
} from './guide'

// jsdom draws nothing, so give the elements we treat as on screen a size.
function sized(el, w = 120, h = 32) {
  el.getBoundingClientRect = () => ({ left: 10, top: 10, width: w, height: h, right: 10 + w, bottom: 10 + h, x: 10, y: 10 })
  return el
}

function page(html) {
  document.body.innerHTML = html
  document.querySelectorAll('[data-sized]').forEach((el) => sized(el))
  return document.body
}

afterEach(() => { document.body.innerHTML = '' })

describe('guide targets', () => {
  it('collects only targets that are in the page and visible, once each', () => {
    const root = page(`
      <button data-guide="workflows.create" data-sized>Create workflow</button>
      <button data-guide="workflows.create" data-sized>Create workflow (copy)</button>
      <button data-guide="forms.create">Not drawn</button>
      <div hidden><button data-guide="users.search" data-sized>Hidden</button></div>
      <button data-guide="roles.create" style="display:none" data-sized>Display none</button>
      <button data-guide="content.new" disabled data-sized>Switched off</button>
      <div aria-hidden="true"><button data-guide="dashboard.reports" data-sized>Behind a dialog</button></div>
      <input data-guide="workflows.name" data-guide-label="Workflow name" value="secret answer" data-sized />
      <section data-guide-ui><button data-guide="guide.self" data-sized>The guide itself</button></section>
    `)
    const targets = collectTargets(root, (id) => (id === 'workflows.create' ? 'Create workflow' : ''))
    expect(targets).toEqual([
      { id: 'workflows.create', label: 'Create workflow', kind: 'button' },
      { id: 'workflows.name', label: 'Workflow name', kind: 'field' },
    ])
  })

  it('never sends what a person typed as a field label', () => {
    const root = page('<div data-guide="idea.field.problem" data-sized><textarea>my private idea</textarea></div>')
    expect(collectTargets(root)).toEqual([{ id: 'idea.field.problem', label: 'idea.field.problem', kind: 'field' }])
  })

  it('lists the menu links the person can see', () => {
    const root = page('<aside><nav><a href="/staff/forms">Forms</a><a href="/staff/forms">Forms again</a><a href="https://x.org">Out</a><a href="/staff/users" aria-label="People"></a></nav></aside>')
    expect(collectMenu(root, 'aside nav a[href]')).toEqual([{ path: '/staff/forms', label: 'Forms' }, { path: '/staff/users', label: 'People' }])
  })

  it('finds a target only when it is on screen', () => {
    const root = page('<button data-guide="forms.create">Not drawn</button><button data-guide="workflows.create" data-sized>Go</button>')
    expect(findTarget(root, 'forms.create')).toBeNull()
    expect(findTarget(root, 'workflows.create')?.textContent).toBe('Go')
    expect(findTarget(root, 'not.there')).toBeNull()
  })
})

describe('the answer', () => {
  const data = {
    answer: 'You are on Workflows.',
    language: 'en',
    steps: [
      { id: 's1', text: 'Press Create workflow.', target_id: 'workflows.create', done_when: { type: 'click', target_id: 'workflows.create' } },
      { id: 's2', text: 'Name it.', target_id: 'workflows.name', done_when: { type: 'click', target_id: 'workflows.createAndOpen' } },
      { id: 's3', text: 'Open Forms.', target_id: null, route: '/staff/forms', done_when: { type: 'route', route: '/staff/forms' } },
      { id: 's4', text: 'Read this.', target_id: '<script>', done_when: { type: 'wave' } },
      { id: 's5', text: '  ' },
    ],
    handoff_suggested: true,
  }

  it('ignores unknown or malformed target ids and done_when types', () => {
    const g = normaliseGuide(data)
    expect(g.steps).toHaveLength(4)
    expect(g.steps[3]).toMatchObject({ targetId: null, doneWhen: { type: 'none', targetId: null } })
    expect(g.handoff).toBe(true)
    expect(normaliseGuide(null)).toMatchObject({ steps: [], answer: '', language: 'en' })
  })

  it('moves on when the step is done, and only then', () => {
    const { steps } = normaliseGuide(data)
    expect(advance(steps, 0, { type: 'click', targetId: 'forms.create' })).toBe(0)
    expect(advance(steps, 0, { type: 'input', targetId: 'workflows.create' })).toBe(0)
    expect(advance(steps, 0, { type: 'click', targetId: 'workflows.create' })).toBe(1)
    // Step 2 rings the name but is done by Create and open.
    expect(advance(steps, 1, { type: 'click', targetId: 'workflows.name' })).toBe(1)
    expect(advance(steps, 1, { type: 'click', targetId: 'workflows.createAndOpen' })).toBe(2)
    expect(advance(steps, 2, { type: 'route', path: '/staff/review' })).toBe(2)
    expect(advance(steps, 2, { type: 'route', path: '/staff/forms/12' })).toBe(3)
    // A "none" step waits for Next.
    expect(stepDone(steps[3], { type: 'click', targetId: 'anything' })).toBe(false)
    expect(advance(steps, 9, { type: 'click', targetId: 'x' })).toBe(9)
  })

  it('matches routes with parameters', () => {
    expect(routeMatches('/staff/admin/workflows/7/builder', '/staff/admin/workflows/:id/builder')).toBe(true)
    expect(routeMatches('/staff/admin/workflows', '/staff/admin/workflows/:id')).toBe(false)
  })
})

describe('language and switches', () => {
  it('answers in Setswana when the question is written in Setswana', () => {
    expect(questionLanguage('Ke dira eng fa?', 'en')).toBe('tn')
    expect(questionLanguage('How do I create a workflow?', 'en')).toBe('en')
    expect(questionLanguage('How do I create a workflow?', 'tn')).toBe('tn')
  })

  it('hides the guide when the feature is off, and keeps live chat', () => {
    expect(guideAvailability({ status: { features: { guide: true } }, config: {} })).toEqual({ guide: true, chat: false, button: true })
    expect(guideAvailability({ status: { features: { guide: false } }, config: {}, chat: true })).toEqual({ guide: false, chat: true, button: true })
    expect(guideAvailability({ status: null, config: null })).toEqual({ guide: false, chat: false, button: false })
    expect(guideAvailability({ status: { features: { guide: true } }, config: { features: { ai_helper: false } } }).guide).toBe(false)
  })

  it('shows guests the guide only when the admin allows it', () => {
    const status = { features: { guide: true } }
    expect(guideAvailability({ status, config: {}, signedIn: false }).guide).toBe(false)
    expect(guideAvailability({ status, config: { assistant: { guide_for_guests: false } }, signedIn: false }).guide).toBe(false)
    expect(guideAvailability({ status, config: { assistant: { guide_for_guests: true } }, signedIn: false }).guide).toBe(true)
    expect(guideAvailability({ status, config: {}, signedIn: true }).guide).toBe(true)
  })

  it('marks an answer from a helper that is off', () => {
    expect(normaliseGuide({ available: false }).unavailable).toBe(true)
    expect(normaliseGuide({ available: true, answer: 'Yes' }).unavailable).toBe(false)
  })

  it('builds the request from the contract', () => {
    const body = guideRequest({ app: 'staff', route: '/staff/workflows', pageTitle: '  Workflows ', language: 'tn', question: ' How? ', targets: [], menu: [] })
    expect(body).toEqual({ app: 'staff', route: '/staff/workflows', page_title: 'Workflows', language: 'tn', question: 'How?', targets: [], menu: [], done_step_ids: [] })
  })
})
