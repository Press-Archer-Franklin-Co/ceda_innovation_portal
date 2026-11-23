// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n'
import AiHelperPanel, { useCheckMyIdea } from './AiHelperPanel'
import type { FormField, FormStep } from '../../../types/innovator'

// 2.13: the AI helper panel beside the idea form.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const api = vi.hoisted(() => ({
  status: vi.fn(),
  draftCheck: vi.fn(),
  reviewDocument: vi.fn(),
}))
vi.mock('../../../services/assistant.service', () => ({
  assistantService: api,
  isCancel: (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
  isNotFound: (e: unknown) => (e as { status?: number })?.status === 404,
}))
vi.mock('../../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open: boolean) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})

const field = (key: string, type: FormField['type']) => ({
  id: key, key, type, label: key, help_text: '', placeholder: '', required: false, is_challenge_question: false, width: 'full',
  is_active: true, link_url: '', options: [], rules: [], visible_if: null, required_if: null, enabled_if: null,
  validation_rules: {}, media_config: {}, default_value: null, example_value: null,
}) as unknown as FormField
const steps: FormStep[] = [
  { id: 's1', code: 'idea', title: 'Your idea', description: '', tips: [], is_active: true, rows: [{ row: 1, fields: [field('problem', 'textarea'), field('files', 'file')] }] },
]
const check = {
  available: true,
  items: [{ topic: 'Customers', status: 'missing', suggestion: 'Name your first 3 shops.', field_key: 'problem', document_id: '', document_name: '', page: null }],
  unclear: [],
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let onShowField = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  api.status.mockResolvedValue({ available: true, features: { draft_check: true, document_review: true } })
  api.draftCheck.mockResolvedValue(check)
  api.reviewDocument.mockResolvedValue({ available: true, summary: 'A costing sheet for 100 g packs.', missing: ['Price per pouch'] })
  onShowField = vi.fn()
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

function view(answers: Record<string, unknown>) {
  return (
    <I18nProvider>
      <section aria-labelledby="step-heading">
        <textarea name="problem" defaultValue={String(answers.problem ?? '')} />
      </section>
      <aside>
        <AiHelperPanel draftId="d1" steps={steps} stepIndex={0} answers={answers} onShowField={onShowField}>
          <p>Tips for this step</p>
        </AiHelperPanel>
      </aside>
    </I18nProvider>
  )
}

async function mount(answers: Record<string, unknown>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(view(answers)))
  await act(async () => { await Promise.resolve() })
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const textarea = () => document.querySelector('textarea')!
const type = (el: HTMLTextAreaElement, text: string) => {
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// A second Check my idea button elsewhere on the page (beside Next), sharing the panel's review.
function WithNextButton({ answers }: { answers: Record<string, unknown> }) {
  const check = useCheckMyIdea()
  return (
    <I18nProvider>
      <section aria-labelledby="step-heading">
        <textarea name="problem" defaultValue={String(answers.problem ?? '')} />
        {check.available && <button type="button" id="beside-next" onClick={(e) => check.openFrom(e.currentTarget)}>Check my idea</button>}
      </section>
      <AiHelperPanel draftId="d1" steps={steps} stepIndex={0} answers={answers} onShowField={onShowField} check={check}>
        <p>Tips for this step</p>
      </AiHelperPanel>
    </I18nProvider>
  )
}

describe('AiHelperPanel', () => {
  it('AI off: today\'s panel only, with no AI text and no calls', async () => {
    api.status.mockResolvedValue({ available: false, features: {} })
    await mount({ problem: 'Mopane worms spoil in open bags.' })
    expect(document.body.textContent).toContain('Tips for this step')
    expect(document.body.textContent).not.toContain('AI helper')
    expect(document.querySelector('[data-guide="idea.check"]')).toBeNull()
    textarea().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(api.draftCheck).not.toHaveBeenCalled()
  })

  it('status cannot be read: today\'s panel, no error', async () => {
    api.status.mockResolvedValue(null)
    await mount({ problem: 'x' })
    expect(document.body.textContent).toContain('Tips for this step')
    expect(document.body.textContent).not.toMatch(/AI helper|can't/)
  })

  it('no call while typing, one call after blur, and suggestions show', async () => {
    await mount({ problem: 'Mopane worms spoil in open bags.' })
    expect(document.body.textContent).toContain('AI helper')
    for (let i = 0; i < 5; i++) {
      type(textarea(), `Mopane worms spoil${i}`)
      await act(async () => { vi.advanceTimersByTime(800) })
    }
    expect(api.draftCheck).not.toHaveBeenCalled()
    textarea().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(api.draftCheck).toHaveBeenCalledTimes(1)
    expect(api.draftCheck.mock.calls[0][0]).toMatchObject({ draft_id: 'd1', step: 'idea', lang: 'en', answers: { problem: 'Mopane worms spoil in open bags.' } })
    await flush()
    expect(document.body.textContent).toContain('Name your first 3 shops.')
    // The same answers again: no second call.
    textarea().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(api.draftCheck).toHaveBeenCalledTimes(1)
  })

  it('never changes what the person wrote; Show me where only points at the question', async () => {
    await mount({ problem: 'Mopane worms spoil in open bags.' })
    textarea().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await flush()
    const show = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Show me where')!
    await act(async () => show.click())
    expect(onShowField).toHaveBeenCalledWith(0, 'problem')
    expect(textarea().value).toBe('Mopane worms spoil in open bags.')
  })

  it('a step check that fails says so plainly, with Try again', async () => {
    api.draftCheck.mockRejectedValueOnce(new Error('boom'))
    await mount({ problem: 'Mopane worms spoil in open bags.' })
    textarea().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await flush()
    expect(document.body.textContent).toContain("The AI helper can't look at this step right now.")
    const retry = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!
    await act(async () => retry.click())
    await flush()
    expect(api.draftCheck).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('Name your first 3 shops.')
  })

  it('documents: a new upload shows Reading your document, then its notes', async () => {
    let finish: (v: unknown) => void = () => undefined
    api.reviewDocument.mockReturnValueOnce(new Promise((r) => { finish = r }))
    const answers = { problem: 'x', files: [{ id: 'old', filename: 'old.pdf', kind: 'document', url: '' }] }
    await mount(answers)
    expect(api.reviewDocument).not.toHaveBeenCalled() // files already there are not re-read
    await act(async () => root!.render(view({ ...answers, files: [...answers.files, { id: 'm2', filename: 'costing.xlsx', kind: 'document', url: '' }] })))
    expect(api.reviewDocument).toHaveBeenCalledWith('m2', 'en', expect.any(AbortSignal))
    expect(document.body.textContent).toContain('Reading your document… costing.xlsx')
    await act(async () => finish({ available: true, summary: 'A costing sheet for 100 g packs.', missing: ['Price per pouch'] }))
    expect(document.body.textContent).toContain('A costing sheet for 100 g packs.')
    expect(document.body.textContent).toContain('Missing: Price per pouch')
  })

  it('documents: a failed review says so with Try again; a file the helper cannot open says so without', async () => {
    api.reviewDocument.mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce({ status: 404 })
    const answers = { problem: 'x', files: [] as unknown[] }
    await mount(answers)
    const two = [{ id: 'a', filename: 'plan.pdf', kind: 'document', url: '' }, { id: 'b', filename: 'photo.jpg', kind: 'image', url: '' }]
    await act(async () => root!.render(view({ ...answers, files: two })))
    await flush()
    expect(document.body.textContent).toContain("The AI helper couldn't read plan.pdf right now.")
    expect(document.body.textContent).toContain("The AI helper can't read photo.jpg.")
    const retries = [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Try again')
    expect(retries).toHaveLength(1)
    await act(async () => retries[0].click())
    await flush()
    expect(document.body.textContent).toContain('A costing sheet for 100 g packs.')
  })

  it('Check my idea opens the full review of every step', async () => {
    await mount({ problem: 'Mopane worms spoil in open bags.' })
    await act(async () => (document.querySelector('[data-guide="idea.check"]') as HTMLButtonElement).click())
    await flush()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Some parts are missing')
    expect(dialog.textContent).toContain('0 of 1 parts strong')
    expect(dialog.textContent).toContain('Name your first 3 shops.')
    expect(dialog.textContent).toContain('Your answers are not shared or used to train AI.')
  })

  it('the button beside Next shows only while the helper is on, and opens the same review', async () => {
    api.status.mockResolvedValueOnce({ available: false, features: {} })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => root!.render(<WithNextButton answers={{ problem: 'Mopane worms spoil in open bags.' }} />))
    await flush()
    expect(document.querySelector('#beside-next')).toBeNull()
    act(() => root!.unmount())
    root = createRoot(host)
    await act(async () => root!.render(<WithNextButton answers={{ problem: 'Mopane worms spoil in open bags.' }} />))
    await flush()
    await act(async () => (document.querySelector('#beside-next') as HTMLButtonElement).click())
    await flush()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Name your first 3 shops.')
    expect(api.draftCheck).toHaveBeenCalledTimes(1)
  })
})
