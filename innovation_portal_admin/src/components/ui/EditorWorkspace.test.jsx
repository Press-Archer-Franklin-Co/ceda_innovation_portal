// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import I18nProvider from '../../i18n/I18nProvider'
import EditorWorkspace from './EditorWorkspace'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})

let root
let host
function render(ui, desktop) {
  window.matchMedia = (q) => ({ matches: q.includes('min-width: 1024px') ? desktop : false, media: q, addEventListener() {}, removeEventListener() {} })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<I18nProvider>{ui}</I18nProvider>))
}
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
})

describe('EditorWorkspace', () => {
  it('desktop: the panel is sticky with its own scroll, and the canvas scrolls on its own', () => {
    render(<EditorWorkspace header={<h1>Builder</h1>} panel={<p>Settings</p>}>canvas</EditorWorkspace>, true)
    const panel = document.querySelector('[data-editor-panel]')
    const canvas = document.querySelector('[data-editor-canvas]')
    expect(panel.className).toMatch(/lg:sticky/)
    expect(panel.className).toMatch(/lg:top-0/)
    expect(panel.className).toMatch(/lg:h-full/)
    expect(panel.className).toMatch(/lg:overflow-y-auto/)
    expect(canvas.className).toMatch(/lg:overflow-y-auto/)
    expect(panel.textContent).toBe('Settings')
  })

  it('the page itself does not scroll on desktop while a workspace is shown', () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf8')
    expect(css).toMatch(/main:has\(> div > \[data-editor-workspace\]\) \{ overflow: hidden; \}/)
  })

  it('shows "Select a step to see its settings" with nothing selected', () => {
    render(<EditorWorkspace header={<h1>Builder</h1>}>canvas</EditorWorkspace>, true)
    expect(document.querySelector('[data-editor-panel]').textContent).toBe('Select a step to see its settings')
  })

  it('phone: no panel column; a selection opens the bottom sheet, and closing clears it', () => {
    const onClose = vi.fn()
    render(<EditorWorkspace header={<h1>Builder</h1>} panel={null} onClosePanel={onClose}>canvas</EditorWorkspace>, false)
    expect(document.querySelector('[data-editor-panel]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => root.render(<I18nProvider><EditorWorkspace header={<h1>Builder</h1>} panel={<p>Field settings</p>} panelLabel="Field settings" onClosePanel={onClose}>canvas</EditorWorkspace></I18nProvider>))
    const sheet = document.querySelector('[role="dialog"]')
    expect(sheet).not.toBeNull()
    expect(sheet.className).toMatch(/rounded-t-card/)
    expect(sheet.className).not.toMatch(/sm:rounded-card/)
    act(() => sheet.querySelector('button[aria-label]').click())
    expect(onClose).toHaveBeenCalled()
  })

  it('noPanel: a screen whose frame has no panel', () => {
    render(<EditorWorkspace header={<h1>Builder</h1>} side={<nav>Sections</nav>} noPanel>canvas</EditorWorkspace>, true)
    expect(document.querySelector('[data-editor-panel]')).toBeNull()
    expect(document.querySelector('[data-editor-side]').textContent).toBe('Sections')
  })
})
