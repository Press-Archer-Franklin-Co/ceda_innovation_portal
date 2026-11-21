import { Fragment, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { buttonClasses } from '../ui/Button'
import Skeleton, { SkeletonText } from '../ui/Skeleton'
import { useI18n } from '../../i18n'
import watermarkUrl from '../../assets/brand/ceda-watermark.png'
import type { ButtonLink, HeroPhoto } from '../../services/publicContent.service'

// Figma 1.1 › Hero (10:243 website, 10:827 phone). Chocolate banner, the CEDA mark as a calm watermark
// (Figma export, never recoloured), headline with highlighted words in amber, two buttons, three checks,
// and the quick start card. The banner is always first on the home page.

export interface HeroSettings {
  headline: string
  highlighted_words: string
  text: string
  primary_button: ButtonLink | null
  secondary_button: ButtonLink | null
  show_watermark: boolean
  show_quick_start: boolean
}

/** Wraps each highlighted word or phrase (comma separated in the CMS) in amber. */
function highlight(headline: string, words: string): ReactNode {
  const list = words.split(',').map((w) => w.trim()).filter(Boolean)
  if (!list.length) return headline
  const escaped = list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = headline.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
  return parts.map((part, i) =>
    list.some((w) => w.toLowerCase() === part.toLowerCase()) ? (
      <span key={i} className="text-amber">{part}</span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

function CtaLink({ button, variant }: { button: ButtonLink; variant: 'accent' | 'onDark' }) {
  const external = /^https?:\/\//.test(button.url)
  const cls = buttonClasses({ variant, className: 'w-full sm:w-auto' })
  const inner = (
    <>
      {button.label}
      {variant === 'accent' && <ArrowRight size={18} aria-hidden />}
    </>
  )
  return external ? (
    <a href={button.url} className={cls}>{inner}</a>
  ) : (
    <Link to={button.url} className={cls}>{inner}</Link>
  )
}

// U7: the photo column width at Medium; Small and Large scale it by about 0.85 and 1.15.
const PHOTO_WIDTH = { small: 290, medium: 340, large: 390 } as const

/**
 * U7 (Figma 1.1): the cut-out innovator photo. Desktop: its own column, standing on the banner's
 * bottom edge, with the brand circle, a dashed amber ring and a dot behind the person. Phone: a
 * 300 px tall block between the words and the quick start card, clipped at its bottom edge.
 */
function HeroPhotoBlock({ photo }: { photo: HeroPhoto }) {
  const { lang } = useI18n()
  const alt = (lang === 'tn' ? photo.alt_tn : photo.alt_en) || photo.alt_en
  const width = PHOTO_WIDTH[photo.size] ?? PHOTO_WIDTH.medium
  return (
    <div
      data-testid="hero-photo"
      className="relative mx-auto h-[300px] w-full max-w-[340px] overflow-hidden lg:mx-0 lg:h-auto lg:min-w-[160px] lg:max-w-none lg:flex-[0_1_var(--hero-photo-w)] lg:self-end lg:overflow-visible lg:-mb-[88px]"
      style={{ ['--hero-photo-w' as string]: `${width}px` }}
    >
      <span aria-hidden className="absolute bottom-[14%] left-1/2 aspect-square w-full -translate-x-1/2 rounded-full bg-accent" />
      <span aria-hidden className="absolute bottom-[10%] left-1/2 aspect-square w-[118%] -translate-x-1/2 rounded-full border-2 border-dashed border-amber" />
      <span aria-hidden className="absolute right-[6%] top-[22%] h-3 w-3 rounded-full bg-amber" />
      <img
        src={photo.src}
        srcSet={photo.srcset}
        sizes={`(min-width: 1024px) ${width}px, 300px`}
        width={photo.width}
        height={photo.height}
        alt={alt}
        loading="eager"
        decoding="async"
        className="relative h-auto w-full lg:max-h-[620px] lg:object-contain lg:object-bottom"
      />
    </div>
  )
}

/** `card` is the quick start card (step 1 or step 2), shown when the CMS has it switched on. */
export default function HeroBanner({ settings, card, photo = null }: { settings: HeroSettings; card: ReactNode; photo?: HeroPhoto | null }) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-banner text-on-banner">
      {settings.show_watermark && (
        <img
          src={watermarkUrl}
          alt=""
          aria-hidden
          className="pointer-events-none select-none absolute left-[-200px] top-[300px] w-[1180px] max-w-none hidden lg:block"
        />
      )}
      {settings.show_watermark && (
        <img src={watermarkUrl} alt="" aria-hidden className="pointer-events-none select-none absolute left-[-160px] bottom-[-40px] w-[760px] max-w-none lg:hidden" />
      )}
      <div className="relative max-w-[1200px] mx-auto px-5 lg:px-6 pt-8 pb-10 lg:pt-20 lg:pb-[88px] flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className={photo ? 'flex flex-col gap-5 lg:gap-6 lg:max-w-[450px] lg:flex-[0_0.2_450px] lg:min-w-0' : 'flex flex-col gap-5 lg:gap-6 lg:max-w-[640px]'}>
          <p className="inline-flex items-center gap-2 self-start rounded-full bg-on-banner/[0.14] px-3 py-1.5 text-d-label-s">
            <span aria-hidden className="w-2 h-2 rounded-full bg-yellow" />
            {t('home.pill')}
          </p>
          <h1 id="hero-title" className="font-heading font-extrabold text-d-mh1 lg:text-d-h1">
            {highlight(settings.headline, settings.highlighted_words)}
          </h1>
          {settings.text && <p className="text-d-body text-banner-muted">{settings.text}</p>}
          {(settings.primary_button?.label || settings.secondary_button?.label) && (
            <div className="flex flex-col sm:flex-row gap-3">
              {settings.primary_button?.label && settings.primary_button.url && <CtaLink button={settings.primary_button} variant="accent" />}
              {settings.secondary_button?.label && settings.secondary_button.url && <CtaLink button={settings.secondary_button} variant="onDark" />}
            </div>
          )}
          <ul className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-5 text-d-label-s">
            {(['home.check1', 'home.check2', 'home.check3'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <CircleCheck size={18} aria-hidden className="text-yellow shrink-0" />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        {photo && <HeroPhotoBlock photo={photo} />}
        {settings.show_quick_start && (photo ? <div className="w-full lg:w-[410px] lg:shrink-0 lg:[&>*]:!w-full lg:[&_form]:!w-full">{card}</div> : card)}
      </div>
    </section>
  )
}

/** The banner while its words load: same size, so nothing jumps when they arrive. */
export function HeroBannerSkeleton() {
  return (
    <div aria-hidden className="bg-banner">
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-20 flex flex-col lg:flex-row gap-8 lg:justify-between">
        <div className="flex flex-col gap-5 lg:w-[640px]">
          <Skeleton className="h-7 w-56 rounded-full bg-on-banner/10" />
          <Skeleton className="h-14 w-full bg-on-banner/10" />
          <Skeleton className="h-14 w-3/4 bg-on-banner/10" />
          <SkeletonText lines={3} className="[&>span]:bg-on-banner/10" />
        </div>
        <Skeleton className="h-[540px] w-full lg:w-[470px] rounded-[16px] bg-on-banner/10" />
      </div>
    </div>
  )
}
