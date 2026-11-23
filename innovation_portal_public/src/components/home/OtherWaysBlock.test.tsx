// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import OtherWaysBlock from './OtherWaysBlock'
import { otherWays, type PublicChannels } from '../../services/channels.service'

function block(channels: PublicChannels | null) {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(<I18nProvider><OtherWaysBlock channels={channels} /></I18nProvider>)
  return el
}
const on = (address: string) => ({ live: true, addresses: [address] })
const off = { live: false, addresses: [] }

describe('Send your idea another way', () => {
  it('is not there when neither channel is live, or the API could not be read', () => {
    expect(block({ whatsapp: off, ussd: off }).innerHTML).toBe('')
    expect(block(null).innerHTML).toBe('')
    expect(block({ whatsapp: { live: true, addresses: [] }, ussd: { live: false, addresses: ['*123#'] } }).innerHTML).toBe('')
  })

  it('shows only the live one', () => {
    const whatsapp = block({ whatsapp: on('+267 71 234 567'), ussd: off })
    expect(whatsapp.textContent).toContain('Open WhatsApp')
    expect(whatsapp.textContent).not.toContain('USSD')
    const ussd = block({ whatsapp: off, ussd: on('*384*123#') })
    expect(ussd.textContent).toContain('*384*123#')
    expect(ussd.textContent).not.toContain('Open WhatsApp')
  })

  it("uses the API's number and code in the links", () => {
    const el = block({ whatsapp: on('whatsapp:+26771234567'), ussd: on('*384*123#') })
    expect(el.querySelector('a[href^="https://wa.me/"]')?.getAttribute('href')).toBe('https://wa.me/26771234567')
    expect(el.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:*384*123%23')
  })

  it('leaves out an address that cannot make a working link', () => {
    expect(otherWays({ whatsapp: on('71234567'), ussd: on('call us') })).toEqual({ whatsapp: null, ussd: null })
  })
})
