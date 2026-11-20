---
name: ceda-genie-motion
description: "Read before building or changing any modal, popover, dropdown menu, toast or other surface that opens from something the person clicked, in innovation_portal_admin or innovation_portal_public. Defines the CEDA genie: Apple's genie motion with curved funnel sides, the real content pouring out of the trigger, two overlapping phases, and reduced-motion support. Ships a tested reference implementation in reference/."
---

# CEDA genie motion

We copy Apple's genie (the macOS Dock minimise effect) as faithfully as the web
allows, played in the opening direction: the panel pours out of the button the
person pressed, and pours back into it when it closes.

**Use the reference implementation. Do not rewrite it.** Copy
`reference/genie.js` (and `genie.d.ts` for TypeScript, `useGenie.jsx` for
React) into `src/lib/motion/` and build the surfaces on it. The live demo is
`reference/genie-lab.html` (open it in a browser; it has slow motion and a
freeze slider).

## What Apple's genie actually does

Study it on a Mac: System Settings, Desktop & Dock, "Minimise windows using:
Genie effect", then hold Shift while minimising to watch it in slow motion.

1. **The sides are curves, not straight lines.** Each side of the window bends
   into a smooth S-shaped funnel that runs from the window's edge to the icon's
   edge. It leaves the window flat, is steepest in the middle and meets the icon
   flat again. A straight-edged trapezoid looks mechanical; the S-curve is what
   reads as liquid.
2. **Two phases that overlap.** In the minimise direction:
   - *Slide* (first half of the time): the narrow end of the funnel closes in
     from the window's width to the icon's width. The window body is already
     bending while it is still in place.
   - *Translate* (from 40% of the time to the end): the whole window slides down
     through the funnel and is squeezed into the icon.
   - The translate phase **starts before the slide phase finishes** (they overlap
     from 40% to 50%). That overlap is why it flows instead of happening in two steps.
3. **Each phase eases in and out** (sine curve). Nothing starts or stops abruptly.
4. **The window's real picture is visible the whole time**, stretched and
   squeezed between the curves. No empty shape, no content popping in at the end.

Opening is the same timeline played backwards: content pours **up out of the
button** through the funnel first, then the funnel's narrow end opens out to
full width and the panel settles.

## How the reference implementation does it

- The real panel is laid out at its final position and hidden.
- A static clone of it is cut into thin bands (one every 8px, 16 to 72 bands)
  across the direction of travel. Each band shows its own strip of the panel, so
  the text is real text, not a blurry screenshot, and nothing has to be captured
  before the motion can start.
- Every frame, each band is placed exactly between the two curves with one CSS
  `matrix3d` (a rectangle-to-quad projective transform). Neighbouring bands share
  edges and overlap by 0.75px, so the sides read as smooth curves with no seams.
- The funnel always points at the trigger: bottom, top, left or right, chosen from
  where the trigger sits. A trigger sitting on the panel's centre gets a short fade.
- At the end the bands are removed and the live panel is shown in exactly the
  same place. Its shadow eases in over 200ms rather than popping.
- Runs on the compositor (transform only). Measured in Chromium: a steady 16.7ms
  per frame, no dropped frames, no console errors.

### The maths (so it can be checked, not re-derived)

On the minimise timeline `f` (0 = full panel, 1 = inside the trigger), with the
funnel running along axis `a` towards the trigger and `c` across it:

```
slide = easeInOutSine(clamp(f / 0.5))
move  = easeInOutSine(clamp((f - 0.4) / 0.6))

top    = panel.a0 + move * (trigger.a0 - panel.a0)          the far edge travels
bottom = min(panel.a1 + move * (trigger.a0 - panel.a0), trigger.a1)

narrow edges:  L = lerp(panel.c0, trigger.c0, slide),  R = lerp(panel.c1, trigger.c1, slide)

for a row at position a:
  h  = clamp((a - panel.a0) / (trigger.a0 - panel.a0))      0 at the panel's far edge, 1 at the trigger
  s  = h*h*(3 - 2h)                                          the S-curve
  c0 = lerp(panel.c0, L, s);  c1 = lerp(panel.c1, R, s)
```

Opening plays `f` from 1 down to 0 on a linear clock; the per-phase sine easing
gives the fluid start and finish.

## Timing

| Surface | Open | Close | Comes from | Goes back to |
|---|---|---|---|---|
| Modal | 620ms | 520ms | the button or row that opened it | the same element |
| Popover (bell, profile) | 440ms | 380ms | its trigger | its trigger |
| Dropdown menu | 440ms | 380ms | its trigger | its trigger |
| Toast | 440ms in | 380ms out | the button that caused it (e.g. Save) | the bell |
| Reduced motion | 150ms fade | 150ms fade | in place | in place |

These are slower than a plain fade on purpose: the genie needs time to be seen
bending. Do not shorten the modal below 560ms or it turns snappy again.

## Behaviour rules

- A re-open during a close (or the reverse) **turns round from the current
  shape** (`run.reverse()`). Never restart from the beginning.
- While animating, the bands ignore the pointer and the live panel is hidden, so
  nothing half-formed can be clicked. Focus moves into the panel when the open
  finishes, and back to the trigger when the close finishes.
- Keep Esc, backdrop click, body scroll lock, and add a focus trap (the current
  admin `Modal.jsx` has none).
- **Prefetch on intent** so the content exists on frame one: start the dialog's
  TanStack query on `pointerenter` (80ms delay) and `pointerdown` of the trigger,
  with the same query key the dialog uses. If data is still loading, the panel
  shows skeleton rows of the right height; the panel never resizes mid-flight.
- Any picker that must work inside a modal (select options, date picker) renders
  inside the modal's own DOM, not in a portal outside it.
- `prefers-reduced-motion: reduce`: no warp, a 150ms fade. Test it.
- Very tall panels (over ~900px) still work; slices are capped at 72.

## Checklist before saying it is done

- [ ] Uses `src/lib/motion/genie.js` from the reference, unchanged except imports.
- [ ] `genie.test.mjs` assertions pass in the app's test runner (Vitest).
- [ ] In slow motion (Slow x10 in the lab, or DevTools Animations at 10%), the
      sides are smooth curves, and the panel's real text is visible throughout.
- [ ] Opening from a button below, above, left and right of the panel all bend towards that button.
- [ ] Re-opening during a close reverses smoothly.
- [ ] Reduced motion gives a fade only.
- [ ] Esc, focus trap, focus return and scroll lock all work.
- [ ] No console errors; no layout shift when the bands are swapped for the live panel.
