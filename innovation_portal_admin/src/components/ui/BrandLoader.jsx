import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/context'
import { BrandLockupSvg } from './Logo'
import ErrorState from './ErrorState'
import { LOADER, clamp, easeProgress, flashScale, loaderState, rayLine, realProgress } from '../../lib/motion/brand'

// The idea bulb loader (U12, from the approved lab). The bulb's round top glows with real start-up progress
// (lib/boot) and pulses faster as it fills. When start-up ends, the first load of a browser session bursts into
// light and the CEDA logo comes out of it; later loads only fade the bulb. A failed step shows ErrorState with
// Retry instead, so the bulb never pulses forever. Animates transform, opacity and filter only (SVG attributes
// for the glow inside the bulb). Reduced motion: no pulse, burst or rays, a 150ms cross-fade.

const GLASS = 'M60 10 A46 46 0 0 1 92.5 88.5 C86 96 80 103 79 118 L41 118 C40 103 34 96 27.5 88.5 A46 46 0 0 1 60 10 Z'

/** The bulb (also drawn statically in index.html, same size and place). Refs receive the parts that change. */
export function Bulb({ refs = {}, clipId = 'ceda-bulb-clip', gradientId = 'ceda-bulb-glow' }) {
  return (
    <svg viewBox="0 0 120 170" aria-hidden>
      <defs>
        <clipPath id={clipId}><path d={GLASS} /></clipPath>
        <radialGradient id={gradientId} cx="60" cy="56" r="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffef4" />
          <stop offset=".28" stopColor="#fff2b0" />
          <stop offset=".6" stopColor="#fac800" stopOpacity=".85" />
          <stop offset="1" stopColor="#faa014" stopOpacity=".25" />
        </radialGradient>
      </defs>
      <path d={GLASS} fill="rgba(250,200,0,.06)" />
      <g clipPath={`url(#${clipId})`}>
        <circle ref={(el) => { refs.glow = el }} cx="60" cy="56" r="52" fill={`url(#${gradientId})`} opacity="0.12" />
      </g>
      <path
        ref={(el) => { refs.filament = el }}
        d="M50 112 L50 80 Q52 66 56 72 Q60 60 64 72 Q68 66 70 80 L70 112"
        fill="none"
        stroke="rgb(152,123,106)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle ref={(el) => { refs.core = el }} cx="60" cy="66" r="5.08" fill="#fffef4" opacity="0" />
      <path d={GLASS} fill="none" strokeWidth="2.6" className="ceda-loader__glass" />
      <g fill="#5a3c32">
        <rect x="40" y="118" width="40" height="8" rx="3" />
        <rect x="42" y="128" width="36" height="7" rx="3" />
        <rect x="44" y="137" width="32" height="7" rx="3" />
        <path d="M50 146 h20 l-4 8 h-12 z" />
      </g>
    </svg>
  )
}

function readSeen() {
  try {
    return sessionStorage.getItem(LOADER.sessionKey) === '1'
  } catch {
    return false
  }
}
function writeSeen() {
  try {
    sessionStorage.setItem(LOADER.sessionKey, '1')
  } catch {
    /* private mode: the burst may play again next time */
  }
}

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const isDark = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
const setBusy = (busy) => {
  const root = typeof document !== 'undefined' && document.getElementById('root')
  if (!root) return
  if (busy) root.setAttribute('aria-busy', 'true')
  else root.removeAttribute('aria-busy')
}

/**
 * boot: the start-up store (lib/boot). intro: force the full burst (styleguide Replay); default: only on the
 * first load of the session. onDone: called once the loader is gone. quiet: no loader at all (previews).
 */
export default function BrandLoader({ boot, intro, reduced: reducedProp, onDone, contained = false, quiet = false }) {
  const t = useT()
  const [gone, setGone] = useState(false)
  const [failed, setFailed] = useState(() => boot.state().failed)
  const rootRef = useRef(null)
  const parts = useRef({}).current
  const bulb = useRef({}).current
  const els = useRef({}).current

  useEffect(() => {
    const reduced = reducedProp ?? prefersReduced()
    const fullBurst = intro ?? !readSeen()
    const dark = isDark()
    let shown = 0
    let last = null
    let start = null
    let endAt = null // ms (from start) when start-up finished
    let frame = 0
    let stopped = false
    const busy = (v) => { if (!contained) setBusy(v) }
    if (quiet) {
      // Staff previews (an iframe in the console) show the page at once: no loader.
      busy(false)
      setGone(true)
      boot.loaderGone()
      return undefined
    }
    busy(true)

    const finish = () => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(frame)
      busy(false)
      setGone(true)
      boot.loaderGone()
      onDone?.()
    }

    const unsub = boot.subscribe((s) => {
      if (s.failed) {
        stopped = true
        cancelAnimationFrame(frame)
        busy(false)
        setFailed(s.failed)
      }
    })
    if (boot.state().failed) {
      busy(false)
      return unsub
    }

    const apply = (now) => {
      if (stopped) return
      if (start == null) start = now
      const el = now - start
      const dt = last == null ? 16 : now - last
      last = now
      const s = boot.state()
      shown = easeProgress(shown, realProgress(s.done, s.total), dt)
      if (s.finished && shown >= realProgress(s.done, s.total) - 0.001 && endAt == null) {
        endAt = el
        if (fullBurst) writeSeen()
      }
      const after = endAt == null ? 0 : el - endAt
      const root = rootRef.current
      const box = root?.getBoundingClientRect()
      const W = box?.width ?? window.innerWidth
      const H = box?.height ?? window.innerHeight
      const cx = W / 2
      const cy = H / 2 - (W < 640 ? 37.6 : 51.3)

      if (!fullBurst) {
        // A later load this session: the bulb only, then a short fade. No burst.
        const st = loaderState(shown, el / 1000, 0, reduced, { dark })
        paintBulb(st)
        if (endAt != null) {
          const fade = clamp(after / LOADER.quickFadeMs)
          if (root) root.style.opacity = String(1 - fade)
          if (fade >= 1) return finish()
        }
        frame = requestAnimationFrame(apply)
        return
      }

      const burstMs = reduced ? LOADER.reducedMs : LOADER.burstMs
      const b = endAt == null ? 0 : clamp(after / burstMs)
      const st = loaderState(shown, el / 1000, b, reduced, { dark })
      paintBulb(st)
      paintBurst(st, cx, cy, W, H)
      const fadeMs = reduced ? LOADER.reducedMs : LOADER.fadeMs
      const out = endAt == null ? 0 : clamp((after - burstMs - LOADER.holdMs) / fadeMs)
      if (root) root.style.opacity = String(1 - out)
      if (out >= 1) return finish()
      frame = requestAnimationFrame(apply)
    }

    function paintBulb(st) {
      const b = els.bulb
      if (b) {
        b.style.opacity = st.bulb.opacity.toFixed(3)
        b.style.transform = `scale(${st.bulb.scale.toFixed(3)})`
      }
      bulb.glow?.setAttribute('opacity', st.glow.toFixed(3))
      bulb.core?.setAttribute('opacity', st.core.opacity.toFixed(3))
      bulb.core?.setAttribute('r', st.core.r.toFixed(2))
      bulb.filament?.setAttribute('stroke', `rgb(${st.filament.join(',')})`)
      if (els.halo) {
        els.halo.style.opacity = st.halo.opacity.toFixed(3)
        els.halo.style.transform = `scale(${st.halo.scale.toFixed(3)})`
      }
      if (els.status) els.status.style.opacity = st.status.toFixed(3)
    }

    function paintBurst(st, cx, cy, W, H) {
      if (els.flash) {
        els.flash.style.opacity = st.flash.opacity.toFixed(3)
        els.flash.style.transform = `scale(${flashScale(st.flash.spread, cx, cy, W, H).toFixed(3)})`
      }
      const rays = els.rays?.children ?? []
      for (let i = 0; i < rays.length; i++) {
        const l = rayLine(i, st.rays.k, cx, cy)
        // Each ray is drawn once from the centre outwards; moving it is a transform and an opacity.
        const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1)
        const ang = Math.atan2(l.y2 - l.y1, l.x2 - l.x1)
        rays[i].style.transform = `translate(${l.x1.toFixed(1)}px,${l.y1.toFixed(1)}px) rotate(${ang.toFixed(4)}rad) scaleX(${(len / 100).toFixed(3)})`
        rays[i].style.opacity = st.rays.opacity.toFixed(3)
      }
      const m = parts.mark
      if (m) {
        m.style.opacity = st.mark.opacity.toFixed(3)
        m.style.transform = `scale(${st.mark.scale.toFixed(3)})`
        m.style.filter = st.mark.blur ? `blur(${st.mark.blur.toFixed(2)}px) brightness(${st.mark.brightness.toFixed(2)})` : 'none'
      }
      if (parts.word) {
        parts.word.style.opacity = st.word.opacity.toFixed(3)
        parts.word.style.transform = `scaleX(${st.word.scaleX.toFixed(3)})`
      }
      ;(parts.tagline ?? []).forEach((g, i) => {
        if (!g) return
        g.style.opacity = st.tagline[i].opacity.toFixed(3)
        g.style.transform = `translateY(${st.tagline[i].y.toFixed(2)}px)`
      })
    }

    frame = requestAnimationFrame(apply)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      unsub()
    }
    // The loader runs once per mount; Replay remounts it with a new key.
  }, [boot, intro, reducedProp, contained, quiet]) // eslint-disable-line react-hooks/exhaustive-deps

  if (gone) return null

  const position = contained ? { position: 'absolute' } : undefined
  if (failed) {
    return (
      <div className="ceda-loader" style={position}>
        <div className="ceda-loader__error">
          <ErrorState title={t('loader.failed')} message={t('loader.failedBody')} onRetry={() => window.location.reload()} framed />
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="ceda-loader" style={position} role="status" aria-live="polite">
      <div ref={(el) => { els.halo = el }} className="ceda-loader__halo" />
      <svg ref={(el) => { els.rays = el }} className="ceda-loader__rays" aria-hidden>
        {Array.from({ length: LOADER.rays }, (_, i) => {
          const l = rayLine(i, 0, 0, 0)
          return <line key={i} x1="0" y1="0" x2="100" y2="0" stroke={l.colour} strokeWidth={l.width} strokeLinecap="round" opacity="0" style={{ transformOrigin: '0 0' }} vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      <div ref={(el) => { els.flash = el }} className="ceda-loader__flash" />
      <div className="ceda-loader__lock" aria-hidden>
        <BrandLockupSvg parts={parts} idPrefix="loader-" className="ceda-loader__logo" />
      </div>
      <div ref={(el) => { els.bulb = el }} className="ceda-loader__bulb">
        <Bulb refs={bulb} />
      </div>
      <p ref={(el) => { els.status = el }} className="ceda-loader__status">{t('loader.status')}</p>
    </div>
  )
}

/**
 * Put inside a Suspense boundary next to the page: it mounts only once the page's code has loaded, and then
 * reports the "page" start-up step.
 */
export function BootStep({ boot, step = 'page' }) {
  useEffect(() => {
    boot.done(step)
  }, [boot, step])
  return null
}
