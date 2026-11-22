/**
 * CEDA genie: an Apple-style genie transition for the web. No dependencies.
 *
 * How Apple's genie works, and how this file reproduces it
 * --------------------------------------------------------
 * 1. The two sides of the window are not straight lines. Each side is a
 *    smooth S-curve (a funnel) that runs from the window's edge down to the
 *    dock icon's edge. The curve is flat where it leaves the window, steepest
 *    in the middle and flat again where it meets the icon.
 * 2. The motion has two overlapping phases (minimise direction):
 *      - "slide": the bottom of the funnel narrows from the window's width to
 *        the icon's width. The window body bends while it is still in place.
 *      - "translate": the whole window then pours down through the funnel
 *        and is squeezed into the icon.
 *    The translate phase starts a little before the slide phase ends, which is
 *    what makes it feel like liquid rather than two steps.
 * 3. The window's real picture is visible the whole time. It is cut into thin
 *    horizontal slices and each slice is warped to sit between the two curves.
 *
 * Opening (our modal, popover, menu, toast) is the same timeline played
 * backwards: the content pours up out of the button through the funnel, then
 * the funnel's narrow end widens out and the panel settles.
 *
 * Technique on the web
 * --------------------
 * - The real panel is laid out at its final place, hidden.
 * - N slices are built from a static clone of the panel. Each slice shows one
 *   band of it (overflow hidden), so the content stays real text, not a blurry
 *   screenshot, and there is no delay taking a snapshot.
 * - Every frame, each slice is mapped onto the four-cornered shape between the
 *   two curves with one CSS matrix3d (a rectangle-to-quad projective
 *   transform). Adjacent slices share edges, so the sides read as smooth
 *   curves. Transforms run on the compositor; nothing is laid out per frame.
 * - At the end the slices are removed and the live panel is shown, pixel for
 *   pixel where the last frame left it.
 *
 * The geometry follows the reconstruction in Harshil Shah's "Recreating the
 * Mac genie effect" (slide phase 0 to 0.5, translate phase 0.4 to 1, funnel
 * mapped from height to width through an ease-in-out curve).
 */

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const GENIE = {
  /** Opening a modal from a button. */
  openMs: 620,
  /** Closing back into the button. */
  closeMs: 520,
  /** Smaller surfaces (popover, menu, toast) use these. */
  smallOpenMs: 440,
  smallCloseMs: 380,
  /** Phase split on the minimise timeline (0 = panel, 1 = inside trigger). */
  slideEnd: 0.5,
  translateStart: 0.4,
  /** One slice per this many pixels along the funnel, within the limits below. */
  slicePx: 8,
  minSlices: 16,
  maxSlices: 72,
  /** Slices overlap by this many px so no hairline seams show. */
  seamPx: 0.75,
  /** While the panel is still inside the trigger it fades in, so the first
   *  frame looks exactly like the button. Fraction of the open timeline. */
  fadeIn: 0.1,
  /** Backdrop opacity at rest. */
  backdrop: 1,
};

/* ------------------------------------------------------------------ */
/* Small maths                                                         */
/* ------------------------------------------------------------------ */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Flat at both ends, steepest in the middle. The funnel's side profile. */
export const smoothstep = (h) => h * h * (3 - 2 * h);
/** Each phase starts and ends gently. This is what makes it fluid. */
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/* ------------------------------------------------------------------ */
/* Which side of the panel the trigger is on                           */
/* ------------------------------------------------------------------ */

/**
 * Returns 'bottom' | 'top' | 'left' | 'right' | 'none'.
 * The funnel always points from the panel towards the trigger.
 */
export function funnelEdge(panel, trigger) {
  const pcx = panel.x + panel.width / 2;
  const pcy = panel.y + panel.height / 2;
  const tcx = trigger.x + trigger.width / 2;
  const tcy = trigger.y + trigger.height / 2;
  const nx = (tcx - pcx) / (panel.width / 2 || 1);
  const ny = (tcy - pcy) / (panel.height / 2 || 1);
  if (Math.abs(nx) < 0.35 && Math.abs(ny) < 0.35) return 'none';
  if (Math.abs(ny) >= Math.abs(nx)) return ny > 0 ? 'bottom' : 'top';
  return nx > 0 ? 'right' : 'left';
}

/* ------------------------------------------------------------------ */
/* Canonical frame: the funnel always runs "down" along axis a         */
/* ------------------------------------------------------------------ */

// a = along the funnel (towards the trigger), c = across it.
function toCanonical(rect, edge) {
  const { x, y, width: w, height: h } = rect;
  switch (edge) {
    case 'bottom': return { a0: y, a1: y + h, c0: x, c1: x + w };
    case 'top': return { a0: -(y + h), a1: -y, c0: x, c1: x + w };
    case 'right': return { a0: x, a1: x + w, c0: y, c1: y + h };
    case 'left': return { a0: -(x + w), a1: -x, c0: y, c1: y + h };
    default: throw new Error('bad edge ' + edge);
  }
}

function toScreen(a, c, edge) {
  switch (edge) {
    case 'bottom': return [c, a];
    case 'top': return [c, -a];
    case 'right': return [a, c];
    case 'left': return [-a, c];
    default: throw new Error('bad edge ' + edge);
  }
}

/* ------------------------------------------------------------------ */
/* The genie shape at a moment                                         */
/* ------------------------------------------------------------------ */

/**
 * Slice boundaries at minimise fraction f (0 = full panel, 1 = in trigger).
 * Returns n + 1 rows. Row k is where the panel's band edge k / n now sits:
 *   { a, c0, c1 } in the canonical frame.
 */
export function genieRows(f, panel, trigger, edge, n, opts = GENIE) {
  const P = toCanonical(panel, edge);
  const T = toCanonical(trigger, edge);

  const slide = easeInOutSine(clamp01(f / opts.slideEnd));
  const move = easeInOutSine(clamp01((f - opts.translateStart) / (1 - opts.translateStart)));

  // Translate: the far edge travels to the trigger's far edge.
  const d = move * (T.a0 - P.a0);
  const top = P.a0 + d;
  const bottom = Math.max(top + 0.25, Math.min(P.a1 + d, T.a1));

  // Funnel band: from the panel's far edge to the trigger's far edge.
  const bandTop = P.a0;
  const bandBottom = Math.max(T.a0, P.a0 + 1);
  const narrowL = lerp(P.c0, T.c0, slide);
  const narrowR = lerp(P.c1, T.c1, slide);

  const rows = new Array(n + 1);
  for (let k = 0; k <= n; k++) {
    const a = lerp(top, bottom, k / n);
    const s = smoothstep(clamp01((a - bandTop) / (bandBottom - bandTop)));
    let c0 = lerp(P.c0, narrowL, s);
    let c1 = lerp(P.c1, narrowR, s);
    if (c1 - c0 < 0.5) { const m = (c0 + c1) / 2; c0 = m - 0.25; c1 = m + 0.25; }
    rows[k] = { a, c0, c1 };
  }
  return rows;
}

/**
 * The outline of the whole genie at f, as screen points (for drawing the
 * silhouette in a design tool, or a debug overlay). Clockwise.
 */
export function genieOutline(f, panel, trigger, opts = GENIE, n = 48) {
  const edge = funnelEdge(panel, trigger);
  if (edge === 'none') return null;
  const rows = genieRows(f, panel, trigger, edge, n, opts);
  const left = rows.map((r) => toScreen(r.a, r.c0, edge));
  const right = rows.map((r) => toScreen(r.a, r.c1, edge));
  return [...left, ...right.reverse()];
}

/* ------------------------------------------------------------------ */
/* Rectangle to quad as CSS matrix3d                                   */
/* ------------------------------------------------------------------ */

/**
 * Maps an element of size w x h (origin 0 0) onto quad p (4 screen points:
 * top-left, top-right, bottom-right, bottom-left of the element).
 */
export function quadMatrix(w, h, p) {
  const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g, hh;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = x1 - x0; b = x3 - x0; c = x0;
    d = y1 - y0; e = y3 - y0; f = y0;
    g = 0; hh = 0;
  } else {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-12) return null;
    g = (sx * dy2 - dx2 * sy) / den;
    hh = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
  }
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  for (const v of m) if (!Number.isFinite(v)) return null;
  return m;
}

/** Applies quadMatrix to a point, for tests. */
export function applyMatrix(m, x, y) {
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}

/* ------------------------------------------------------------------ */
/* DOM renderer                                                        */
/* ------------------------------------------------------------------ */

const toRect = (src) => {
  if (!src) return null;
  if (typeof src.getBoundingClientRect === 'function') {
    const r = src.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  if ('width' in src) return { x: src.x, y: src.y, width: src.width, height: src.height };
  return { x: src.x - 1, y: src.y - 1, width: 2, height: 2 }; // a pointer position
};

/**
 * Builds the slices for one panel and returns render(f) and destroy().
 * The panel must already be in its final position (it may be hidden).
 */
export function createGenieRenderer(panelEl, triggerSrc, opts = GENIE) {
  const panel = toRect(panelEl);
  const trigger = toRect(triggerSrc);
  const edge = funnelEdge(panel, trigger);
  if (edge === 'none') return null;

  const vertical = edge === 'top' || edge === 'bottom';
  const length = vertical ? panel.height : panel.width;
  const n = Math.max(opts.minSlices, Math.min(opts.maxSlices, Math.round(length / opts.slicePx)));
  const sliceLen = length / n;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.genieLayer = '';
  Object.assign(layer.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483000',
    contain: 'strict',
  });

  const source = panelEl.cloneNode(true);
  source.removeAttribute('id');
  source.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  source.querySelectorAll('input,select,textarea,button,a').forEach((el) => el.setAttribute('tabindex', '-1'));
  const cs = getComputedStyle(panelEl);
  Object.assign(source.style, {
    position: 'absolute', left: '0', top: '0', margin: '0', transform: 'none',
    width: panel.width + 'px', height: panel.height + 'px', boxSizing: 'border-box',
    visibility: 'visible', opacity: '1', transition: 'none', animation: 'none',
    boxShadow: 'none', // the shadow is drawn once, on the whole silhouette, below
  });

  const slices = [];
  for (let k = 0; k < n; k++) {
    // Band k in canonical terms is v in [k/n, (k+1)/n] from the far edge.
    const farFirst = edge === 'bottom' || edge === 'right';
    const offset = farFirst ? k * sliceLen : length - (k + 1) * sliceLen;
    const seam = k === n - 1 ? 0 : opts.seamPx;
    const w = vertical ? panel.width : sliceLen + seam;
    const h = vertical ? sliceLen + seam : panel.height;
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', width: w + 'px', height: h + 'px',
      overflow: 'hidden', transformOrigin: '0 0', willChange: 'transform', backfaceVisibility: 'hidden',
      borderRadius: '0',
    });
    const inner = source.cloneNode(true);
    inner.style.left = vertical ? '0' : -offset + 'px';
    inner.style.top = vertical ? -offset + 'px' : '0';
    el.appendChild(inner);
    layer.appendChild(el);
    // The matrix maps only the band itself; the seam spills past it into the
    // neighbouring slice, which is what hides hairlines.
    const mw = vertical ? panel.width : sliceLen;
    const mh = vertical ? sliceLen : panel.height;
    slices.push({ el, mw, mh, k });
  }
  document.body.appendChild(layer);

  const pts = (r, side) => toScreen(r.a, side === 0 ? r.c0 : r.c1, edge);

  function render(f) {
    const rows = genieRows(f, panel, trigger, edge, n, opts);
    for (const s of slices) {
      const r0 = rows[s.k], r1 = rows[s.k + 1];
      let quad;
      // Element corners: TL, TR, BR, BL in screen orientation.
      if (edge === 'bottom') quad = [pts(r0, 0), pts(r0, 1), pts(r1, 1), pts(r1, 0)];
      else if (edge === 'top') quad = [pts(r1, 0), pts(r1, 1), pts(r0, 1), pts(r0, 0)];
      else if (edge === 'right') quad = [pts(r0, 0), pts(r1, 0), pts(r1, 1), pts(r0, 1)];
      else quad = [pts(r1, 0), pts(r0, 0), pts(r0, 1), pts(r1, 1)];
      const m = quadMatrix(s.mw, s.mh, quad);
      if (m) s.el.style.transform = 'matrix3d(' + m.join(',') + ')';
    }
    layer.style.opacity = String(clamp01((1 - f) / opts.fadeIn));
  }

  function destroy() { layer.remove(); }

  return { render, destroy, edge, slices: n, panel, trigger, radius: cs.borderRadius };
}

/* ------------------------------------------------------------------ */
/* Running it                                                          */
/* ------------------------------------------------------------------ */

// Also honours "Less motion" in the site's accessibility panel (<html data-motion="reduce">, U11C).
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (
    document.documentElement.dataset.motion === 'reduce' ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));

/**
 * Plays the genie.
 *
 *   const run = genie(panelEl, buttonEl, { direction: 'open', backdrop: el })
 *   await run.finished
 *   run.reverse()   // flips direction from where it is now
 *   run.cancel()    // jumps to the end state of the current direction
 *
 * Open: the panel is hidden while the slices play, then shown.
 * Close: the panel is hidden at once; remove it from the DOM after `finished`.
 */
export function genie(panelEl, triggerSrc, options = {}) {
  const opts = { ...GENIE, ...options };
  let direction = opts.direction || 'open';
  const small = !!opts.small;
  const durFor = (dir) => opts.durationMs ?? (dir === 'open'
    ? (small ? opts.smallOpenMs : opts.openMs)
    : (small ? opts.smallCloseMs : opts.closeMs));
  const backdrop = opts.backdropEl || null;

  let resolveDone;
  const finished = new Promise((r) => { resolveDone = r; });
  let raf = 0;
  let renderer = null;

  // Reduced motion, or a trigger sitting on the panel: a short fade, no warp.
  if (prefersReducedMotion() || opts.reduced || !triggerSrc ||
      funnelEdge(toRect(panelEl), toRect(triggerSrc)) === 'none') {
    const ms = 150;
    const from = direction === 'open' ? 0 : 1;
    panelEl.style.transition = `opacity ${ms}ms ease`;
    if (backdrop) backdrop.style.transition = `opacity ${ms}ms ease`;
    panelEl.style.opacity = String(from);
    if (backdrop) backdrop.style.opacity = String(from * opts.backdrop);
    requestAnimationFrame(() => {
      panelEl.style.opacity = String(1 - from);
      if (backdrop) backdrop.style.opacity = String((1 - from) * opts.backdrop);
    });
    setTimeout(() => { panelEl.style.transition = ''; resolveDone(direction); }, ms + 20);
    return { finished, reverse() {}, cancel() {} };
  }

  renderer = createGenieRenderer(panelEl, triggerSrc, opts);
  panelEl.style.visibility = 'hidden';
  if (opts.onStart) opts.onStart(renderer);

  // f is the minimise fraction: 0 = full panel, 1 = inside the trigger.
  let f = direction === 'open' ? 1 : 0;
  let last = performance.now();

  const paint = () => {
    renderer.render(f);
    if (backdrop) backdrop.style.opacity = String(easeInOutSine(1 - f) * opts.backdrop);
    if (opts.onFrame) opts.onFrame(f);
  };

  const step = (now) => {
    const dt = now - last;
    last = now;
    const delta = dt / durFor(direction);
    f = clamp01(direction === 'open' ? f - delta : f + delta);
    paint();
    const done = direction === 'open' ? f <= 0 : f >= 1;
    if (done) return finish();
    raf = requestAnimationFrame(step);
  };

  function finish() {
    cancelAnimationFrame(raf);
    renderer.destroy();
    if (direction === 'open') {
      panelEl.style.visibility = '';
      // The slices carry no shadow (it would repaint every frame), so the
      // panel's own shadow eases in as it settles instead of popping.
      const shadow = getComputedStyle(panelEl).boxShadow;
      if (shadow && shadow !== 'none' && panelEl.animate) {
        panelEl.animate([{ boxShadow: 'none' }, { boxShadow: shadow }], { duration: 200, easing: 'ease-out' });
      }
    }
    resolveDone(direction);
  }

  paint();
  raf = requestAnimationFrame((t) => { last = t; raf = requestAnimationFrame(step); });

  return {
    finished,
    /** Turn round mid-flight; keeps the current shape, so there is no jump. */
    reverse() { direction = direction === 'open' ? 'close' : 'open'; },
    cancel() { f = direction === 'open' ? 0 : 1; paint(); finish(); },
    get progress() { return 1 - f; },
    get direction() { return direction; },
  };
}

/**
 * For tests and design exports: draw one exact frame and leave it on screen.
 * Returns destroy().
 */
export function genieFrame(panelEl, triggerSrc, progress, opts = GENIE) {
  const r = createGenieRenderer(panelEl, triggerSrc, opts);
  if (!r) return () => {};
  panelEl.style.visibility = 'hidden';
  r.render(1 - progress);
  return () => { r.destroy(); panelEl.style.visibility = ''; };
}
