import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { clamp, lerp, menuDuration, menuLook, menuRest, menuState, menuWidth, rowColour, rowLight, seek, turnRound } from '../lib/motion/brand'

// The lit staff menu (U12), from the approved lab. Page open: the mark rises from below its horizon and the
// light flows down the menu, dim to lit, then the words fade in. Collapse: the labels fade, the menu narrows
// to the 72px rail and dims in place. Expand: it widens and lights up in place. Phone: the drawer lights up
// as it opens and dims as it closes; on page open the small mark in the top bar rises. A click mid-motion
// turns round from the current shape. Reduced motion: no rise and no light front, 150ms fades.
// All numbers come from lib/motion/brand.js; this hook only writes them to the elements.

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function fullWidth() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')
  return parseFloat(v) || 216
}

/**
 * els: refs to the menu parts ({ aside, lit, glow, markCol, sun, dimSun, halo, word, side, nav, foot, scrim }).
 * shellRef: the shell whose --sidebar-current moves the page. open, phone: the state to show.
 * boot: start-up store; the page-open sunrise waits for the loader to go. still: no motion (styleguide).
 */
export function useMenuMotion({ els, shellRef, open, phone, boot, still = false }) {
  const run = useRef(null) // { name, t, start, from, dur, frame }
  const rows = useRef([])
  const opened = useRef(false)
  const prev = useRef({ open, phone })

  const measure = useCallback(() => {
    const aside = els.aside
    if (!aside || !els.nav) return
    const top = aside.getBoundingClientRect().top
    rows.current = [...els.nav.querySelectorAll('[data-menu-row]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { el, y: r.top - top + r.height / 2, kind: el.dataset.menuRow, active: el.dataset.active === 'true', label: el.querySelector('[data-label]'), badge: el.querySelector('[data-badge]') }
    })
  }, [els])

  const apply = useCallback((s) => {
    const aside = els.aside
    if (!aside) return
    const reduced = prefersReduced()
    const h = aside.offsetHeight
    const look = menuLook(s, h, reduced)
    const full = fullWidth()
    const shell = shellRef?.current

    if (phone) {
      aside.style.width = `${full}px`
      aside.style.transform = `translateX(${((s.e - 1) * 100).toFixed(2)}%)`
      aside.style.visibility = s.e <= 0.001 ? 'hidden' : 'visible'
      if (els.scrim) {
        els.scrim.style.opacity = (s.e * 0.38).toFixed(3)
        els.scrim.style.pointerEvents = s.e > 0.5 ? 'auto' : 'none'
        els.scrim.style.visibility = s.e <= 0.001 ? 'hidden' : 'visible'
      }
      shell?.style.setProperty('--sidebar-current', '0px')
    } else {
      const w = menuWidth(s.e, full)
      aside.style.width = `${w.toFixed(1)}px`
      aside.style.transform = 'none'
      aside.style.visibility = 'visible'
      if (els.scrim) {
        els.scrim.style.opacity = '0'
        els.scrim.style.pointerEvents = 'none'
        els.scrim.style.visibility = 'hidden'
      }
      shell?.style.setProperty('--sidebar-current', `${w.toFixed(1)}px`)
    }

    if (els.markCol) els.markCol.style.transform = `translateX(${(phone ? 16 : lerp(-12, 16, s.e)).toFixed(1)}px)`
    if (els.sun) {
      els.sun.style.transform = `translateY(${look.sunY.toFixed(2)}px)`
      els.sun.style.opacity = look.sunOpacity.toFixed(3)
    }
    if (els.dimSun) els.dimSun.style.opacity = look.dimMarkOpacity.toFixed(3)
    if (els.halo) {
      els.halo.style.opacity = look.haloOpacity.toFixed(3)
      els.halo.style.transform = `translateY(${look.haloY.toFixed(1)}px) scale(${look.haloScale.toFixed(3)})`
    }
    if (els.word) els.word.style.opacity = look.words.toFixed(3)
    if (els.side) els.side.style.opacity = (look.words * s.e).toFixed(3)
    if (els.foot) els.foot.style.opacity = look.labels.toFixed(3)
    if (els.lit) {
      // The light front: a lit layer whose soft bottom edge (220px) sits at the front. Moving it is a transform
      // only, so the browser does not repaint the menu on every frame. Without a front it fades as a whole.
      const reach = look.masked ? look.front + 110 : h + 220
      els.lit.style.transform = `translateY(${(reach - (h + 220)).toFixed(1)}px)`
      els.lit.style.opacity = look.masked ? '1' : look.light.toFixed(3)
    }
    if (els.glow) els.glow.style.opacity = look.glowOpacity.toFixed(3)

    for (const r of rows.current) {
      const k = rowLight(look, r.y)
      if (r.kind === 'title') {
        const c = rowColour(k)
        const alpha = parseFloat(c.slice(c.lastIndexOf(',') + 1)) * look.labels
        r.el.style.color = c.replace(/,[^,]*\)$/, `,${alpha.toFixed(3)})`)
        r.el.style.setProperty('--rule', ((1 - look.labels) * 0.5).toFixed(3))
      } else {
        r.el.style.color = rowColour(k, r.active)
        r.el.style.setProperty('--lit', k.toFixed(3))
        if (r.active) r.el.style.backgroundColor = `rgba(255,255,255,${lerp(0.05, 0.12, k).toFixed(3)})`
        if (r.label) r.label.style.opacity = look.labels.toFixed(3)
        if (r.badge) r.badge.style.opacity = look.labels.toFixed(3)
      }
    }

    const top = shell?.querySelector('[data-top-sun]')
    if (top) {
      top.style.transform = `translateY(${look.topY.toFixed(2)}px)`
      top.style.opacity = look.topOpacity.toFixed(3)
    }
  }, [els, phone, shellRef])

  const stop = useCallback(() => {
    if (run.current) cancelAnimationFrame(run.current.frame)
    run.current = null
  }, [])

  const play = useCallback((name, fromT, done) => {
    stop()
    measure()
    const dur = menuDuration(name, prefersReduced())
    const job = { name, t: fromT, from: fromT, start: null, dur, frame: 0 }
    run.current = job
    const step = (now) => {
      if (run.current !== job) return
      if (job.start == null) job.start = now
      job.t = clamp(job.from + (now - job.start) / dur)
      apply(menuState(name, job.t, { phone }))
      if (job.t < 1) job.frame = requestAnimationFrame(step)
      else {
        run.current = null
        done?.()
      }
    }
    job.frame = requestAnimationFrame(step)
  }, [apply, measure, phone, stop])

  // Before paint: the resting look (or, before the sunrise, the menu waiting in the dark).
  useLayoutEffect(() => {
    measure()
    if (still) apply(menuRest(open, { phone }))
    else if (!opened.current) apply(phone ? { e: open ? 1 : 0, r: 0, la: 1, dm: 0, words: 1, top: 0, still: false } : { e: open ? 1 : 0, r: 0, la: open ? 1 : 0, dm: 0, words: 0, top: 1, still: false })
    else if (!run.current && prev.current.open === open && prev.current.phone === phone) apply(menuRest(open, { phone }))
  }) // every render: the rows may have changed (capabilities, badges)

  // Page open: once per full page load, after the loader has gone.
  useEffect(() => {
    if (still || opened.current) return undefined
    const go = () => {
      if (opened.current) return
      opened.current = true
      if (phone || open) play('open', 0, () => apply(menuRest(open, { phone })))
      else apply(menuRest(false, { phone }))
    }
    return boot ? boot.onLoaderGone(go) : (go(), undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Open and close: expand lights up, collapse dims, both in place. A click mid-motion turns round.
  useEffect(() => {
    const was = prev.current
    prev.current = { open, phone }
    if (still) return
    if (was.phone !== phone) {
      stop()
      apply(menuRest(open, { phone }))
      return
    }
    if (was.open === open) return
    const name = open ? 'expand' : 'collapse'
    const cur = run.current
    const rest = () => apply(menuRest(open, { phone }))
    if (!opened.current) {
      opened.current = true
      play(name, 0, rest)
    } else if (cur && (cur.name === 'expand' || cur.name === 'collapse') && cur.name !== name) {
      const back = turnRound(cur.name, cur.t, { phone })
      play(back.name, back.t, rest)
    } else if (cur && cur.name === 'open' && name === 'collapse') {
      const r = menuState('open', cur.t, { phone }).r
      play('collapse', seek('collapse', 'r', r, { phone }), rest)
    } else {
      play(name, 0, rest)
    }
  }, [open, phone]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => {
      if (run.current) return
      measure()
      apply(menuRest(open, { phone }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [apply, measure, open, phone])

  useEffect(() => stop, [stop])
}
