import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Logo, { BrandLockup, BrandLockupSvg, CedaWord } from './Logo'

// U12: the logo is always the official drawing, never CEDA typed in a font.
const typedCeda = (html) => html.replace(/<[^>]*>/g, ' ').includes('CEDA')

describe('Logo', () => {
  it('renders the mark over the CEDA word drawing, with no typed CEDA', () => {
    const html = renderToStaticMarkup(<Logo />)
    expect(html).toMatch(/<img[^>]+ceda-mark\.svg/)
    expect(html).toMatch(/<svg[^>]+viewBox="0 520 1600 340"[^>]+width="60"/)
    expect(html).toContain('text-brand-text')
    expect(html).not.toMatch(/ceda-logo-compact/)
    expect(typedCeda(html)).toBe(false)
  })

  it('draws the word white on dark grounds', () => {
    const html = renderToStaticMarkup(<Logo theme="dark" />)
    expect(html).toMatch(/<svg[^>]+class="[^"]*text-on-banner/)
    expect(html).not.toContain('text-brand-text')
  })

  it('gives the small word heavier strokes, the large word the file\'s', () => {
    expect(renderToStaticMarkup(<CedaWord width={60} />)).toContain('stroke-width="40"')
    expect(renderToStaticMarkup(<CedaWord width={120} />)).toContain('stroke-width="30"')
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
