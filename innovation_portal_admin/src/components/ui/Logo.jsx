import { forwardRef } from 'react'
import { cn } from '../../lib/cn'
import markUrl from '../../assets/brand/ceda-mark.svg'
import lockupUrl from '../../assets/brand/ceda-logo.svg'
import lockupDarkUrl from '../../assets/brand/ceda-logo-on-dark.svg'
import { LOCKUP_VIEWBOX, MARK_PATHS, MARK_TRANSFORM, TAGLINE, WORD_PATHS } from './brandPaths'

// The official CEDA logo (U12). Always the drawing from src/assets/brand, never typed in a font: CEDA is thin and
// wide, the tagline is FINANCE • DEVELOP • SUSTAIN in small spaced capitals as wide as the word, and the mark
// keeps its four colours. Words are CEDA brown on light grounds and white on brown or dark grounds.

export const LOCKUP_ALT = 'CEDA. Finance, Develop, Sustain.'

/** The CEDA mark alone. Width follows height (240 × 123). */
export function CedaMark({ height = 27, className, label }) {
  return (
    <img
      src={markUrl}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      height={height}
      width={Math.round((height * 240) / 123)}
      className={cn('block shrink-0', className)}
      draggable={false}
    />
  )
}

/**
 * The word CEDA alone, as the logo draws it (thin strokes, currentColor). The letter shapes never change; below
 * 120px wide the strokes are a little heavier (40 instead of 30) so the thin letters stay crisp.
 */
export function CedaWord({ width = 96, className }) {
  return (
    <svg viewBox="0 520 1600 340" width={width} height={(width * 340) / 1600} aria-hidden className={cn('block overflow-visible', className)}>
      <g fill="none" stroke="currentColor" strokeWidth={width >= 120 ? 30 : 40} strokeMiterlimit="10">
        {WORD_PATHS.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  )
}

/**
 * Logo (Theme = Light | Dark), for headers and menus (Figma header logo, about 44px tall): the mark (27px) over
 * the word CEDA (60px wide, about as wide as the mark), a rule, then "Innovation / Ideas Portal". The word is CEDA
 * brown on light grounds and white on dark grounds or in dark mode (the brand-text token).
 */
export default function Logo({ theme = 'light', className, subtitle = 'Ideas Portal' }) {
  const dark = theme === 'dark'
  return (
    <span
      className={cn('inline-flex items-center gap-3', dark && 'bg-banner rounded-control p-2', className)}
      role="img"
      aria-label={`CEDA Innovation ${subtitle}`}
    >
      <span aria-hidden className="flex shrink-0 flex-col items-center gap-1" data-logo="mark-word">
        <CedaMark height={27} />
        <CedaWord width={60} className={dark ? 'text-on-banner' : 'text-brand-text'} />
      </span>
      <span aria-hidden className={cn('w-px h-[34px]', dark ? 'bg-banner-muted' : 'bg-border')} />
      <span className="flex flex-col whitespace-nowrap" aria-hidden>
        <span className={cn('font-heading font-semibold text-[15px] leading-[22px]', dark ? 'text-on-banner' : 'text-text')}>Innovation</span>
        <span className={cn('font-body text-[12px] leading-[18px]', dark ? 'text-banner-muted' : 'text-muted')}>{subtitle}</span>
      </span>
    </span>
  )
}

/** The full CEDA logo with its tagline, as a picture. theme="dark" (brown or dark grounds) uses the white words. */
export function BrandLockup({ width = 240, theme = 'light', className }) {
  const h = Math.round((width * 990) / 1600)
  if (theme === 'dark') return <img src={lockupDarkUrl} alt={LOCKUP_ALT} width={width} height={h} className={cn('block h-auto', className)} draggable={false} />
  // A light ground: brown words, or white words when the page is in dark mode.
  return (
    <>
      <img src={lockupUrl} alt={LOCKUP_ALT} width={width} height={h} className={cn('block h-auto brand-on-light', className)} draggable={false} />
      <img src={lockupDarkUrl} alt="" aria-hidden width={width} height={h} className={cn('block h-auto brand-on-dark', className)} draggable={false} />
    </>
  )
}

/**
 * The same full logo drawn inline, so each part can move (the loader only). Group ids follow the file:
 * ceda-mark, ceda-word, ceda-tag-finance, ceda-tag-dot-1, ceda-tag-develop, ceda-tag-dot-2, ceda-tag-sustain.
 * The words use currentColor, so set the colour on a parent. `parts` receives the moving groups:
 * { mark, word, tagline: [finance+dot, develop+dot, sustain] }.
 */
export const BrandLockupSvg = forwardRef(function BrandLockupSvg({ width = 300, className, idPrefix = '', parts }, ref) {
  const id = (name) => `${idPrefix}${name}`
  const set = (key, i) => (el) => {
    if (!parts) return
    if (i === undefined) parts[key] = el
    else (parts[key] ??= [])[i] = el
  }
  return (
    <svg ref={ref} viewBox={LOCKUP_VIEWBOX} width={width} role="img" aria-label={LOCKUP_ALT} className={cn('block h-auto overflow-visible', className)}>
      <g ref={set('mark')} className="brand-part">
        <g id={id('ceda-mark')} transform={MARK_TRANSFORM}>
          {MARK_PATHS.map((p) => <path key={p.fill} d={p.d} fill={p.fill} />)}
        </g>
      </g>
      <g ref={set('word')} className="brand-part">
        <g id={id('ceda-word')} fill="none" stroke="currentColor" strokeWidth="30" strokeLinejoin="miter" strokeMiterlimit="10">
          {WORD_PATHS.map((d) => <path key={d} d={d} />)}
        </g>
      </g>
      <g fill="currentColor">
        {TAGLINE.map((w, i) => (
          <g key={w.d.slice(0, 24)} ref={set('tagline', i)} className="brand-part">
            <path id={id(['ceda-tag-finance', 'ceda-tag-develop', 'ceda-tag-sustain'][i])} d={w.d} />
            {w.dot && <circle id={id(`ceda-tag-dot-${i + 1}`)} cx={w.dot.cx} cy={w.dot.cy} r={w.dot.r} />}
          </g>
        ))}
      </g>
    </svg>
  )
})
