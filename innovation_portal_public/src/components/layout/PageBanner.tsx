import { ReactNode } from 'react'
import watermarkUrl from '../../assets/brand/ceda-watermark.png'

// Figma 1.6 › Page banner (13:487), 1.7 › Page banner (13:1027). Chocolate band with a yellow overline,
// white title, a sentence and an optional slot (search box, counts). The CEDA mark watermark sits on the right.

export default function PageBanner({ id, overline, title, subtitle, children }: { id: string; overline: string; title: ReactNode; subtitle?: string; children?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="relative overflow-hidden bg-banner text-on-banner">
      <img src={watermarkUrl} alt="" aria-hidden className="pointer-events-none select-none absolute right-[-120px] top-[-10px] w-[620px] max-w-none hidden md:block" />
      <div className="relative max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-12 flex flex-col gap-3">
        <p className="text-d-over uppercase font-heading text-yellow">{overline}</p>
        <h1 id={id} className="font-heading font-bold text-[28px] leading-9 lg:text-d-h2">{title}</h1>
        {subtitle && <p className="text-d-body text-banner-muted max-w-[640px]">{subtitle}</p>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </section>
  )
}
