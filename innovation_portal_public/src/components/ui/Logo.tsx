import clsx from 'clsx'
import markUrl from '../../assets/brand/ceda-mark.svg'

// Figma Foundations › Brand. The CEDA mark is a faithful vector trace: scale only, never recolour or crop.

/** The CEDA mark alone. Width follows height (240 × 123). */
export function CedaMark({ height = 27, className, label }: { height?: number; className?: string; label?: string }) {
  return (
    <img
      src={markUrl}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      height={height}
      width={Math.round((height * 240) / 123)}
      className={clsx('block shrink-0', className)}
      draggable={false}
    />
  )
}

/** Logo (Theme = Light | Dark): mark over "CEDA", a rule, then "Innovation / Ideas Portal". */
export default function Logo({ theme = 'light', className, subtitle = 'Ideas Portal' }: { theme?: 'light' | 'dark'; className?: string; subtitle?: string }) {
  const dark = theme === 'dark'
  return (
    <span
      className={clsx('inline-flex items-center gap-3', dark && 'bg-banner rounded-control p-2', className)}
      role="img"
      aria-label={`CEDA Innovation ${subtitle}`}
    >
      <span className="flex flex-col items-center gap-px" aria-hidden>
        <CedaMark height={26.65} />
        <span className={clsx('font-heading font-bold text-[15px] leading-4 tracking-[2.1px]', dark ? 'text-on-banner' : 'text-text')}>CEDA</span>
      </span>
      <span aria-hidden className={clsx('w-px h-[34px]', dark ? 'bg-banner-muted' : 'bg-border')} />
      <span className="flex flex-col whitespace-nowrap" aria-hidden>
        <span className={clsx('font-heading font-semibold text-[15px] leading-[22px]', dark ? 'text-on-banner' : 'text-text')}>Innovation</span>
        <span className={clsx('font-body text-[12px] leading-[18px]', dark ? 'text-banner-muted' : 'text-muted')}>{subtitle}</span>
      </span>
    </span>
  )
}
