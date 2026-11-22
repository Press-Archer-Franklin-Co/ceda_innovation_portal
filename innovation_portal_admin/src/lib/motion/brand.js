// CEDA brand motion (U12): the idea bulb loader and the lit staff menu, ported from the approved lab
// (ceda-light-lab.html: loaderFrame, playLoader, menuFrame and TL). Pure functions only: they take time and
// state and return plain numbers. The components apply them to transform, opacity and filter.
// Keep this file the same in both apps (public: brand.ts).

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
/** Where t sits between a and b, 0..1. */
export const seg = (t, a, b) => clamp((t - a) / (b - a))
export const lerp = (a, b, t) => a + (b - a) * t
export const eSine = (t) => (1 - Math.cos(Math.PI * t)) / 2
export const eOut3 = (t) => 1 - Math.pow(1 - t, 3)
export const eBack = (t) => {
  const c = 1.4
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/** The four colours of the CEDA mark, in the order the rays use them. Never recolour the mark itself. */
export const MARK_COLOURS = ['#F0641E', '#FAA014', '#A01E0A', '#FAC800']

/* ------------------------------------------------------------------ loader */

export const LOADER = {
  burstMs: 1600, // burst and logo reveal
  holdMs: 700, // the logo stays
  fadeMs: 320, // then the loader fades out
  reducedMs: 150, // reduced motion: one cross-fade
  quickDelayMs: 400, // later loads in a session: show the bulb only after this
  quickFadeMs: 150, // ... and fade it, no burst
  stepMs: 450, // the glow eases to each finished step over this long
  rays: 16,
  sessionKey: 'ceda.intro.seen',
}

/** Total time from the end of loading to the loader being gone. */
export function loaderEndMs(reduced) {
  return reduced ? LOADER.reducedMs + LOADER.holdMs + LOADER.reducedMs : LOADER.burstMs + LOADER.holdMs + LOADER.fadeMs
}

/** Real progress: finished steps over all steps. Never more than what is done. */
export function realProgress(done, total) {
  return total > 0 ? clamp(done / total) : 0
}

/**
 * The shown progress eases towards the real one (so the glow never jumps) and never passes it.
 * shown: what is on screen now; real: finished/total; dtMs: time since the last frame.
 */
export function easeProgress(shown, real, dtMs) {
  if (shown >= real) return real
  const step = clamp(dtMs / LOADER.stepMs)
  return Math.min(real, shown + (real - shown) * (1 - Math.pow(1 - step, 3)) + 0.0005)
}

/** The glow inside the bulb before the burst: a faint ember plus what has loaded, with a pulse that quickens. */
export function glowLevel(progress, timeSeconds, reduced) {
  const fill = eSine(clamp(progress))
  const hz = lerp(0.8, 2.6, fill)
  const pulse = reduced ? 0 : Math.sin(timeSeconds * hz * Math.PI * 2) * lerp(0.16, 0.07, fill)
  return clamp(0.12 + 0.78 * fill + pulse)
}

/**
 * Everything the loader shows at one moment.
 * progress 0..1 (shown progress), timeSeconds drives the pulse, burst 0..1 (0 = not started).
 * Tagline: three steps (FINANCE with its dot, DEVELOP with its dot, SUSTAIN), 0.08 apart.
 */
export function loaderState(progress, timeSeconds, burst, reduced, { dark = false } = {}) {
  const R = !!reduced
  const b = clamp(burst)
  let g = glowLevel(progress, timeSeconds, R)
  const charge = R ? 0 : eSine(seg(b, 0, 0.12))
  g = Math.min(1.25, g + charge * 0.5)
  const bulbOut = R ? seg(b, 0, 0.4) : eSine(seg(b, 0.12, 0.3))
  const glow = clamp(g)
  const fil = Math.round(glow * 100) / 100

  const fs = R ? 0 : eOut3(seg(b, 0.1, 0.5))
  const fo = R ? 0 : Math.min(seg(b, 0.08, 0.18), 1 - eSine(seg(b, 0.32, 0.72)))
  const rk = R ? 0 : seg(b, 0.1, 0.55)

  const mk = R ? seg(b, 0.2, 0.6) : seg(b, 0.2, 0.58)
  const wk = seg(b, 0.42, 0.72)

  return {
    bulb: { opacity: 1 - bulbOut, scale: 1 + charge * 0.07 + bulbOut * 0.25 },
    glow,
    core: { opacity: clamp(g * 1.2 - 0.2), r: 4 + g * 9 },
    filament: [lerp(138, 255, fil) | 0, lerp(106, 243, fil) | 0, lerp(94, 196, fil) | 0],
    halo: { opacity: glow * (dark ? 0.95 : 0.75) * (1 - seg(b, 0.3, 0.7)), scale: 0.25 + 0.75 * glow + charge * 0.3 },
    flash: { spread: fs, opacity: fo },
    rays: { k: rk, opacity: Math.sin(Math.PI * rk) * 0.85 },
    mark: {
      opacity: R ? mk : eSine(mk),
      scale: R ? 1 : lerp(0.55, 1, eBack(mk)),
      blur: R || mk >= 1 ? 0 : (1 - eSine(mk)) * 10,
      brightness: R || mk >= 1 ? 1 : 1 + (1 - mk) * 0.8,
    },
    word: { opacity: eSine(wk), scaleX: R ? 1 : lerp(1.22, 1, eOut3(wk)) },
    tagline: [0, 1, 2].map((i) => {
      const k = seg(b, 0.62 + i * 0.08, 0.8 + i * 0.08)
      return { opacity: eSine(k), y: R ? 0 : (1 - eOut3(k)) * 8 }
    }),
    status: 1 - seg(b, 0, 0.2),
  }
}

/** One ray of light (i of LOADER.rays) at ray progress k, around the bulb centre (cx, cy), in px. */
export function rayLine(i, k, cx, cy) {
  const a = (i / LOADER.rays) * Math.PI * 2 + 0.2 + k * 0.25
  const len = i % 2 ? 0.75 : 1
  const r0 = 70 + eOut3(k) * 380 * len
  const r1 = r0 + (30 + 180 * Math.sin(Math.PI * k)) * len
  return { x1: cx + Math.cos(a) * r0, y1: cy + Math.sin(a) * r0, x2: cx + Math.cos(a) * r1, y2: cy + Math.sin(a) * r1, width: i % 2 ? 3 : 5, colour: MARK_COLOURS[i % 4] }
}

/** The flash disc scale that reaches past every screen edge from (cx, cy). The disc is 200px wide. */
export function flashScale(spread, cx, cy, w, h) {
  const diag = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 2.3
  return 0.3 + (spread * diag) / 200
}

/* -------------------------------------------------------------------- menu */

export const MENU = {
  railPx: 72,
  openMs: 1400,
  expandMs: 650,
  collapseMs: 450,
  reducedMs: 150,
  storageKey: 'ceda.sidebar.open',
  sunDropPx: 30, // the mark starts this far below its horizon (its box is 28px tall)
  topSunDropPx: 24,
  front: 110, // half the soft edge of the light front, px
  rowSoftness: 140,
}

/** How long a menu motion takes. Reduced motion: 150ms. */
export function menuDuration(name, reduced) {
  if (reduced) return MENU.reducedMs
  return { open: MENU.openMs, expand: MENU.expandMs, collapse: MENU.collapseMs }[name]
}

/**
 * The menu at time t (0..1) of a motion. The fields:
 *   e      open amount (desktop: rail 72px to full width; phone: drawer slide)
 *   r      light (0 dim, 1 lit). On page open it is also the sun's rise.
 *   la     labels alpha
 *   dm     dim mark alpha (the resting collapsed mark)
 *   words  "CEDA" and "Innovation / Ideas Portal" alpha
 *   top    phone top bar sun (0 below, 1 risen)
 *   still  true: dim and light in place, no rise (collapse and expand)
 */
export function menuState(name, t, { phone = false } = {}) {
  const x = clamp(t)
  if (name === 'open') {
    return phone
      ? { e: 0, r: 0, la: 1, dm: 0, words: 1, top: x, still: false }
      : { e: 1, r: x, la: 1, dm: 0, words: eSine(seg(x, 0.55, 0.95)), top: 1, still: false }
  }
  if (name === 'expand') {
    const r = eSine(seg(x, 0.15, 1))
    return { still: true, e: eSine(seg(x, 0, 0.5)), r, la: seg(x, 0.3, 0.65), dm: phone ? 0 : 1 - r, words: eSine(seg(x, 0.45, 0.9)), top: 1 }
  }
  if (name === 'collapse') {
    const r = 1 - eSine(seg(x, 0, 0.8))
    return { still: true, e: 1 - eSine(seg(x, 0.15, 1)), r, la: 1 - seg(x, 0, 0.3), dm: phone ? 0 : 1 - r, words: 1 - seg(x, 0, 0.25), top: 1 }
  }
  throw new Error(`menuState: unknown motion ${name}`)
}

/** The resting menu, open or closed. A closed desktop menu is the dim rail with the dim mark showing. */
export function menuRest(open, { phone = false } = {}) {
  if (open) return { e: 1, r: 1, la: 1, dm: 0, words: 1, top: 1, still: true }
  return phone ? { e: 0, r: 0, la: 1, dm: 0, words: 1, top: 1, still: true } : { e: 0, r: 0, la: 0, dm: 1, words: 0, top: 1, still: true }
}

/**
 * Turns a menu state into numbers to apply. h: menu height in px; reduced: no rise, no light front.
 *   light     0..1, how lit the whole menu is (also the dim to lit fade when there is no front)
 *   front     px from the top where the light front is (only when `masked`)
 *   sunY      px the mark sits below its resting place; sunOpacity
 *   haloOpacity, haloScale, haloY, glowOpacity, topY, topOpacity
 */
export function menuLook(s, h, reduced) {
  const R = !!reduced || !!s.still
  const rise = R ? 1 : eOut3(s.r)
  const light = R ? s.r : eSine(seg(s.r, 0.12, 1))
  const topRise = R ? 1 : eOut3(s.top)
  return {
    masked: !R,
    light,
    front: light * (h + 2 * MENU.front) - MENU.front,
    sunY: (1 - rise) * MENU.sunDropPx,
    sunOpacity: R ? s.r : 1,
    dimMarkOpacity: s.dm,
    haloOpacity: Math.pow(s.r, 1.4) * 0.95,
    haloScale: lerp(0.35, 1, R ? 1 : eOut3(s.r)),
    haloY: (1 - rise) * 16,
    glowOpacity: Math.pow(s.r, 1.2),
    words: s.words,
    labels: s.la,
    topY: (1 - topRise) * MENU.topSunDropPx,
    topOpacity: R ? s.top : 1,
  }
}

/** How lit one menu row is, 0..1, from its centre y (px from the menu top). */
export function rowLight(look, y) {
  return look.masked ? clamp((look.front - y) / MENU.rowSoftness + 0.5) : look.light
}

const DIM_TEXT = [234, 219, 210, 0.38]
const LIT_TEXT = [234, 219, 210, 1]

/** Row text colour at light k (matches --sidebar-dim-text and --sidebar-lit-text). Active rows go to white. */
export function rowColour(k, active = false) {
  if (active) return `rgba(255,255,255,${lerp(0.5, 1, k).toFixed(3)})`
  const c = DIM_TEXT.map((v, j) => lerp(v, LIT_TEXT[j], k))
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3].toFixed(3)})`
}

/** Width of the desktop menu at open amount e, between the rail and full width. */
export function menuWidth(e, fullPx) {
  return lerp(MENU.railPx, fullPx, clamp(e))
}

/**
 * Re-click mid-motion: the opposite motion, starting where its open amount matches the current one, so the
 * menu turns round from its current shape instead of jumping or restarting.
 */
export function turnRound(name, t, { phone = false } = {}) {
  const other = name === 'collapse' ? 'expand' : 'collapse'
  const e = menuState(name, t, { phone }).e
  // expand: e rises with t; collapse: e falls with t. Binary search the other timeline for the same e.
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const em = menuState(other, mid, { phone }).e
    if (other === 'expand' ? em < e : em > e) lo = mid
    else hi = mid
  }
  return { name: other, t: (lo + hi) / 2 }
}

/**
 * The time t (0..1) in a motion where `key` (e or r) first reaches `value`. Used when a click interrupts the
 * page-open sunrise: the collapse starts from the current light, so nothing jumps.
 */
export function seek(name, key, value, { phone = false } = {}) {
  const at = (t) => menuState(name, t, { phone })[key]
  const rising = at(1) >= at(0)
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (rising ? at(mid) < value : at(mid) > value) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
