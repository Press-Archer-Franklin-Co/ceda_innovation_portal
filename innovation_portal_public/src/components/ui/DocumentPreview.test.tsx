// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import DocumentPreview from './DocumentPreview'
import { previewKind, previewType, isWebUrl } from '../../lib/documentPreview'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open: boolean) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})

let root: ReturnType<typeof createRoot> | null = null
const download = vi.fn(async () => undefined)
const file = (name: string, mime: string, load = vi.fn(async () => new Blob(['x']))) => ({ name, mime, load, download })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true, configurable: true })
})
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

async function show(f: Parameters<typeof DocumentPreview>[0]["file"]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<I18nProvider><DocumentPreview open onClose={() => undefined} triggerRef={{ current: null }} file={f} /></I18nProvider>)
  })
  await act(async () => { await Promise.resolve() })
}

describe('DocumentPreview', () => {
  it('a PDF shows in an iframe, from a blob with the safe type', async () => {
    await show(file('plan.pdf', 'application/pdf'))
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('blob:preview')
    expect((URL.createObjectURL as unknown as { mock: { calls: Blob[][] } }).mock.calls[0][0].type).toBe('application/pdf')
  })

  it('an image shows as an image with zoom', async () => {
    await show(file('photo.jpg', 'image/jpeg'))
    const img = document.querySelector('[role="dialog"] img') as unknown as HTMLImageElement
    expect(img.getAttribute('src')).toBe('blob:preview')
    expect(img.style.width).toBe('100%')
    await act(async () => (document.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click())
    expect(img.style.width).toBe('150%')
  })

  it('another type never loads and offers Download', async () => {
    const f = file('budget.xlsx', 'application/vnd.ms-excel')
    await show(f)
    expect(f.load).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("This file can't be shown here")
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Download') as HTMLButtonElement
    await act(async () => button.click())
    expect(download).toHaveBeenCalled()
  })

  it('a file that fails to load shows an error with Retry, not an empty panel', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('no')).mockResolvedValue(new Blob(['x']))
    await show(file('plan.pdf', 'application/pdf', load))
    expect(document.body.textContent).toContain('We could not open this file')
    const retry = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Try again') as HTMLButtonElement
    await act(async () => retry.click())
    await act(async () => { await Promise.resolve() })
    expect(document.querySelector('iframe')).not.toBeNull()
  })

  it('never draws a web page or SVG, and a browser without a PDF viewer gets Download', () => {
    expect(previewType('a.html', 'text/html')).toBeNull()
    expect(previewType('a.svg', 'image/svg+xml')).toBeNull()
    expect(previewType('fake.pdf', 'text/html')).toBeNull()
    expect(previewType('a.pdf', 'application/octet-stream')).toBe('application/pdf')
    expect(previewKind('a.pdf', 'application/pdf', false)).toBe('other')
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
  })
})
