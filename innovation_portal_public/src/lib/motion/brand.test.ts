import { describe, expect, it } from 'vitest'
import {
  LOADER, MENU, easeProgress, glowLevel, loaderEndMs, loaderState, menuDuration, menuLook, menuRest, menuState, rayLine,
  realProgress, rowColour, rowLight, seek, turnRound,
} from './brand'

describe('idea bulb loader', () => {
  it('burst 0 shows the bulb and no logo', () => {
    const s = loaderState(0.5, 1.2, 0, false)
    expect(s.bulb.opacity).toBe(1)
    expect(s.mark.opacity).toBe(0)
    expect(s.word.opacity).toBe(0)
    expect(s.tagline.every((w) => w.opacity === 0)).toBe(true)
  })

  it('burst 1 shows the full logo and no bulb, flash or rays', () => {
    const s = loaderState(1, 3, 1, false)
    expect(s.bulb.opacity).toBe(0)
    expect(s.flash.opacity).toBeCloseTo(0, 6)
    expect(s.rays.opacity).toBeCloseTo(0, 6)
    expect(s.halo.opacity).toBe(0)
    expect(s.mark).toMatchObject({ opacity: 1, scale: 1, blur: 0 })
    expect(s.word).toMatchObject({ opacity: 1, scaleX: 1 })
    expect(s.tagline.map((w) => w.opacity)).toEqual([1, 1, 1])
    expect(s.tagline.map((w) => w.y)).toEqual([0, 0, 0])
  })

  it('follows the lab timeline: mark from 0.2, word from 0.42, tagline from 0.62, 0.08 apart', () => {
    expect(loaderState(1, 0, 0.2, false).mark.opacity).toBe(0)
    expect(loaderState(1, 0, 0.3, false).mark.opacity).toBeGreaterThan(0)
    expect(loaderState(1, 0, 0.42, false).word.opacity).toBe(0)
    expect(loaderState(1, 0, 0.5, false).word.opacity).toBeGreaterThan(0)
    const t = loaderState(1, 0, 0.75, false).tagline
    expect(t[0].opacity).toBeGreaterThan(t[1].opacity)
    expect(t[1].opacity).toBeGreaterThan(t[2].opacity)
    expect(loaderState(1, 0, 0.78, false).tagline[2].opacity).toBe(0)
  })

  it('shown progress eases towards real progress and never passes it', () => {
    let shown = 0
    for (const real of [realProgress(1, 3), realProgress(2, 3), realProgress(3, 3)]) {
      for (let i = 0; i < 200; i++) {
        shown = easeProgress(shown, real, 16)
        expect(shown).toBeLessThanOrEqual(real)
      }
      expect(shown).toBeCloseTo(real, 6)
    }
    expect(realProgress(0, 0)).toBe(0)
  })

  it('the glow never exceeds what the finished steps give it before the burst', () => {
    // Without the pulse the glow rises with progress only, so less progress never glows more.
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const shown = Math.max(0, p - 0.1)
      expect(glowLevel(shown, 0, true)).toBeLessThanOrEqual(glowLevel(p, 0, true) + 1e-9)
      expect(loaderState(shown, 0, 0, true).glow).toBeLessThanOrEqual(glowLevel(p, 0, true) + 1e-9)
    }
    // Before anything is done the bulb is only a faint ember.
    expect(glowLevel(0, 0, true)).toBeCloseTo(0.12, 6)
  })

  it('reduced motion: no pulse, burst or rays, and 150ms steps', () => {
    expect(glowLevel(0.5, 0.13, true)).toBe(glowLevel(0.5, 0.77, true))
    const mid = loaderState(1, 0, 0.5, true)
    expect(mid.flash.opacity).toBe(0)
    expect(mid.rays.opacity).toBe(0)
    expect(mid.word.scaleX).toBe(1)
    expect(LOADER.reducedMs).toBe(150)
    expect(loaderEndMs(true)).toBe(150 + 700 + 150)
    expect(loaderEndMs(false)).toBe(1600 + 700 + 320)
  })

  it('sends 16 rays in the four mark colours', () => {
    const colours = new Set(Array.from({ length: LOADER.rays }, (_, i) => rayLine(i, 0.5, 0, 0).colour))
    expect([...colours]).toEqual(['#F0641E', '#FAA014', '#A01E0A', '#FAC800'])
  })
})

describe('lit staff menu', () => {
  it('open at 0 has the mark below its horizon', () => {
    const look = menuLook(menuState('open', 0), 800, false)
    expect(look.sunY).toBeGreaterThanOrEqual(28) // its box is 28px tall
    expect(look.light).toBe(0)
  })

  it('open at 1 is lit with the mark risen and the words shown', () => {
    const look = menuLook(menuState('open', 1), 800, false)
    expect(look.sunY).toBe(0)
    expect(look.light).toBe(1)
    expect(look.words).toBe(1)
  })

  it('the light flows down: rows near the top light first', () => {
    const look = menuLook(menuState('open', 0.5), 800, false)
    expect(rowLight(look, 100)).toBeGreaterThan(rowLight(look, 700))
  })

  it('collapse at 1 is fully dim with the mark visible', () => {
    const s = menuState('collapse', 1)
    const look = menuLook(s, 800, false)
    expect(s.e).toBe(0)
    expect(look.light).toBe(0)
    expect(look.dimMarkOpacity).toBe(1)
    expect(look.labels).toBe(0)
    expect(look.sunY).toBe(0) // dims in place: no sunset
  })

  it('expand at 1 is fully lit', () => {
    const s = menuState('expand', 1)
    const look = menuLook(s, 800, false)
    expect(s.e).toBe(1)
    expect(look.light).toBe(1)
    expect(look.dimMarkOpacity).toBe(0)
    expect(look.labels).toBe(1)
    expect(rowColour(rowLight(look, 400))).toBe('rgba(234,219,210,1.000)')
  })

  it('collapse and expand never move the mark', () => {
    for (const name of ['collapse', 'expand'] as const) {
      for (let t = 0; t <= 1; t += 0.1) expect(menuLook(menuState(name, t), 800, false).sunY).toBe(0)
    }
  })

  it('rests: open is lit, the desktop rail is dim with the dim mark', () => {
    expect(menuRest(true)).toMatchObject({ e: 1, r: 1 })
    expect(menuRest(false)).toMatchObject({ e: 0, r: 0, dm: 1, la: 0 })
    expect(menuRest(false, { phone: true })).toMatchObject({ e: 0, dm: 0 })
  })

  it('a click mid-motion turns round from the same shape', () => {
    for (const t of [0.2, 0.5, 0.8]) {
      const back = turnRound('collapse', t)
      expect(back.name).toBe('expand')
      expect(menuState('expand', back.t).e).toBeCloseTo(menuState('collapse', t).e, 3)
    }
    const r = menuState('open', 0.4).r
    expect(menuState('collapse', seek('collapse', 'r', r)).r).toBeCloseTo(r, 3)
  })

  it('timings: 1.4s open, 0.65s expand, 0.45s collapse; reduced motion gives 150ms', () => {
    expect(menuDuration('open', false)).toBe(1400)
    expect(menuDuration('expand', false)).toBe(650)
    expect(menuDuration('collapse', false)).toBe(450)
    for (const name of ['open', 'expand', 'collapse'] as const) expect(menuDuration(name, true)).toBe(150)
    expect(MENU.railPx).toBe(72)
  })

  it('reduced motion: no rise and no light front', () => {
    const look = menuLook(menuState('open', 0.3), 800, true)
    expect(look.sunY).toBe(0)
    expect(look.masked).toBe(false)
  })
})
