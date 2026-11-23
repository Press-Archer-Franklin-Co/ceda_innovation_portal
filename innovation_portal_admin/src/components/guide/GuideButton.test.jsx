// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import I18nProvider from '../../i18n/I18nProvider'
import { GuideProvider } from './GuideProvider'
import GuideButton from './GuideButton'
import Modal from '../ui/Modal'
import Drawer from '../ui/Drawer'

// The Need help? button never sits on top of a dialog: it hides while any Modal or Drawer is open.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../lib/guide/api', () => ({
  askGuide: vi.fn(),
  guideStatus: vi.fn(async () => ({ features: { guide: true } })),
  handOver: vi.fn(),
}))
vi.mock('../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})

let setDialog = () => undefined
function Page() {
  const [dialog, set] = useState('none')
  setDialog = set
  return (
    <>
      <GuideButton />
      <Modal open={dialog === 'modal'} onClose={() => set('none')} title="A dialog">x</Modal>
      <Drawer open={dialog === 'drawer'} onClose={() => set('none')} label="A drawer">y</Drawer>
    </>
  )
}

let root = null
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

const isHidden = () => /(^| )hidden( |$)/.test(document.querySelector('button[aria-controls="need-help-guide"]').className)

describe('Need help? under dialogs', () => {
  it('hides while a Modal or a Drawer is open, and comes back after', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <I18nProvider>
          <MemoryRouter>
            <GuideProvider app="staff" menuSelector="nav a" onTalk={() => undefined}>
              <Page />
            </GuideProvider>
          </MemoryRouter>
        </I18nProvider>,
      )
    })
    expect(isHidden()).toBe(false)
    await act(async () => setDialog('modal'))
    expect(isHidden()).toBe(true)
    await act(async () => setDialog('none'))
    expect(isHidden()).toBe(false)
    await act(async () => setDialog('drawer'))
    expect(isHidden()).toBe(true)
    await act(async () => setDialog('none'))
    expect(isHidden()).toBe(false)
  })
})
