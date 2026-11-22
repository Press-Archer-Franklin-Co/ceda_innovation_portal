import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Logo, { BrandLockup, BrandLockupSvg } from './Logo'

// U12: the logo is always the official drawing, never CEDA typed in a font.
const typedCeda = (html: string) => html.replace(/<[^>]*>/g, ' ').includes('CEDA')

describe('Logo', () => {
  it('renders the compact logo image, with no typed CEDA', () => {
    const html = renderToStaticMarkup(<Logo />)
    expect(html).toMatch(/<img[^>]+ceda-logo-compact\.svg[^>]+brand-on-light/)
    // The white-word file waits for dark mode, hidden by brand.css until then.
    expect(html).toMatch(/<img[^>]+ceda-logo-compact-on-dark\.svg[^>]+brand-on-dark/)
    expect(typedCeda(html)).toBe(false)
  })

  it('uses only the white-word file on dark grounds', () => {
    const html = renderToStaticMarkup(<Logo theme="dark" />)
    expect(html).toMatch(/ceda-logo-compact-on-dark\.svg/)
    expect(html).not.toMatch(/ceda-logo-compact\.svg/)
    expect(html).not.toMatch(/brand-on-dark/)
  })

  it('BrandLockup is the full logo with its tagline in the alt text', () => {
    const html = renderToStaticMarkup(<BrandLockup width={200} theme="dark" />)
    expect(html).toMatch(/ceda-logo-on-dark\.svg/)
    expect(html).toContain('alt="CEDA. Finance, Develop, Sustain."')
    expect(typedCeda(html.replace(/alt="[^"]*"/, ''))).toBe(false)
  })

  it('BrandLockupSvg keeps the group ids from the file and draws the words in currentColor', () => {
    const html = renderToStaticMarkup(<BrandLockupSvg />)
    for (const id of ['ceda-mark', 'ceda-word', 'ceda-tag-finance', 'ceda-tag-dot-1', 'ceda-tag-develop', 'ceda-tag-dot-2', 'ceda-tag-sustain']) {
      expect(html).toContain(`id="${id}"`)
    }
    expect(html).toContain('stroke="currentColor"')
    expect(typedCeda(html.replace(/aria-label="[^"]*"/, ''))).toBe(false)
  })
})
