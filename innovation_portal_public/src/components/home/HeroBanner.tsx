import { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { buttonClasses } from '../ui/Button'
import Skeleton, { SkeletonText } from '../ui/Skeleton'
import { useI18n } from '../../i18n'
import watermarkUrl from '../../assets/brand/ceda-watermark.png'
import circleUrl from '../../assets/home/hero-circle.svg'
import ringUrl from '../../assets/home/hero-ring.png'
import dotUrl from '../../assets/home/hero-dot.svg'
import HeroHeadline, { type HeadlineMark } from './HeroHeadline'
import type { ButtonLink, HeroPhoto } from '../../services/publicContent.service'

// Figma 1.1 › Hero (10:243 website, 10:827 phone). Chocolate banner, the CEDA mark as a calm watermark
// (Figma export, never recoloured), headline with marked words (3.8), two buttons, three checks, the cut-out
// photo and the quick start card. The banner is always first on the home page.
//
// Website (1440): text column x 120, 137 px below the hero top, 450 wide; photo group x 570, 340 wide; quick start
// card x 910, 80 px below the hero top, 410 wide. Every column is top-aligned; the hero is as tall as the card
// needs (792 at 1440). The person stands on the hero's bottom edge in front of the brand circle, ring and dot.

export interface HeroSettings {
  /** 3.8 Small label; empty shows the default words. */
  small_label?: string
  headline: string
  headline_marks?: HeadlineMark[] | null
  text: string
  primary_button: ButtonLink | null
  secondary_button: ButtonLink | null
  show_watermark: boolean
  show_quick_start: boolean
}

function CtaLink({ button, variant, guide }: { button: ButtonLink; variant: 'accent' | 'onDark'; guide?: string }) {
  const external = /^https?:\/\//.test(button.url)
  const cls = buttonClasses({ variant, className: 'w-full sm:w-auto' })
  const inner = (
    <>
      {button.label}
      {variant === 'accent' && <ArrowRight size={18} aria-hidden />}
    </>
  )
  return external ? (
    <a href={button.url} className={cls} data-guide={guide}>{inner}</a>
  ) : (
    <Link to={button.url} className={cls} data-guide={guide}>{inner}</Link>
  )
}

// Small and Large (staff setting, 3.8) scale the person by about 0.85 and 1.15; the circle and ring keep their size.
const PHOTO_SCALE = { small: 0.85, medium: 1, large: 1.15 } as const

// Website photo stage (Figma 116:840), measured in the 340 px wide group from the top of the photo (y 287) to
// the bottom of the ring (y 741): 340 x 454. The photo's bottom (y 712) sits on the hero's bottom edge, so the
// stage hangs 29 px below it and the circle and ring are clipped there. Every position is a share of the stage,
// so the group can narrow between 1024 and 1440 without the shapes drifting apart.
const STAGE_H = 454
const pctW = (px: number) => `${(px / 340) * 100}%`
const pctH = (px: number) => `${(px / STAGE_H) * 100}%`

/** U7 + Figma 1.1: the cut-out innovator photo in front of the brand circle, the dashed ring and the dot. */
function HeroPhotoBlock({ photo }: { photo: HeroPhoto }) {
  const { lang } = useI18n()
  const alt = (lang === 'tn' ? photo.alt_tn : photo.alt_en) || photo.alt_en
  const scale = PHOTO_SCALE[photo.size] ?? 1
  const image = (className: string, style: CSSProperties, sizes: string) => (
    <img
      src={photo.src}
      srcSet={photo.srcset}
      sizes={sizes}
      width={photo.width}
      height={photo.height}
      alt={alt}
      loading="eager"
      decoding="async"
      className={clsx('absolute max-w-none object-contain object-bottom', className)}
      style={style}
    />
  )
  return (
    <>
      {/* Phone and tablet (116:847): 350 x 300 between the words and the card, the person 240 x 300 on its bottom edge. */}
      <div data-testid="hero-photo" className="relative mx-auto h-[300px] w-full max-w-[350px] overflow-hidden lg:hidden">
        <div className="absolute inset-y-0 left-1/2 w-[350px] -translate-x-1/2">
          <img src={circleUrl} alt="" aria-hidden width={230} height={230} className="absolute left-[60px] top-[88.4px] h-[230px] w-[230px]" />
          <img src={ringUrl} alt="" aria-hidden width={280.6} height={280.6} className="absolute left-[34.7px] top-[58.5px] h-[280.6px] w-[280.6px]" />
          <img src={dotUrl} alt="" aria-hidden width={18} height={18} className="absolute left-[271.6px] top-[81.5px] h-[18px] w-[18px]" />
          {image('bottom-0 left-[55px] h-[300px] w-[240px]', {}, '240px')}
        </div>
      </div>
      {/* Website (116:840): its own column, standing on the hero's bottom edge (the column runs into the bottom padding). */}
      <div data-testid="hero-photo-desktop" className="relative hidden lg:block lg:flex-[0_1_340px] lg:min-w-[220px] lg:self-stretch lg:-mb-[88px]">
        <div className="absolute inset-x-0 bottom-0 translate-y-[6.39%]" style={{ aspectRatio: `340 / ${STAGE_H}` }}>
          <img src={circleUrl} alt="" aria-hidden width={300} height={300} className="absolute" style={{ left: pctW(20), top: pctH(149), width: pctW(300) }} />
          <img src={ringUrl} alt="" aria-hidden width={330} height={330} className="absolute" style={{ left: pctW(5), top: pctH(124), width: pctW(330) }} />
          <img src={dotUrl} alt="" aria-hidden width={18} height={18} className="absolute" style={{ left: pctW(296), top: pctH(140), width: pctW(18) }} />
          {image('left-1/2 -translate-x-1/2', { bottom: pctH(STAGE_H - 425), width: `${scale * 100}%`, height: `${scale * (425 / STAGE_H) * 100}%` }, `${Math.round(340 * scale)}px`)}
        </div>
      </div>
    </>
  )
}

/** `card` is the quick start card (step 1 or step 2), shown when the CMS has it switched on. */
export default function HeroBanner({ settings, card, photo = null }: { settings: HeroSettings; card: ReactNode; photo?: HeroPhoto | null }) {
  const { t } = useI18n()
  const showCard = settings.show_quick_start
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
        <img src={watermarkUrl} alt="" aria-hidden className="pointer-events-none select-none absolute left-[-200px] top-[560px] w-[640px] max-w-none lg:hidden" />
      )}
      <div className="relative mx-auto flex max-w-[1248px] flex-col px-5 pt-7 pb-8 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:pt-20 lg:pb-[88px]">
        <div
          data-testid="hero-copy"
          className={clsx(
            'flex flex-col gap-[18px] lg:gap-6 lg:mt-[57px] lg:min-w-0',
            photo ? 'lg:flex-[0_1_450px]' : 'lg:max-w-[640px] lg:flex-[0_1_640px]',
          )}
        >
          <p className="inline-flex items-center gap-2 self-start rounded-full bg-on-banner/[0.14] px-3 py-1.5 text-d-label-s">
            <span aria-hidden className="w-2 h-2 rounded-full bg-yellow" />
            {settings.small_label?.trim() || t('home.pill')}
          </p>
          <h1 id="hero-title" className="font-heading font-extrabold text-d-mh1 lg:text-d-h1">
            <HeroHeadline text={settings.headline} marks={settings.headline_marks} />
          </h1>
          {settings.text && <p className="text-d-body-s lg:text-d-body text-banner-muted">{settings.text}</p>}
          {(settings.primary_button?.label || settings.secondary_button?.label) && (
            <div className="flex flex-col sm:flex-row gap-3">
              {settings.primary_button?.label && settings.primary_button.url && <CtaLink button={settings.primary_button} variant="accent" guide="home.primaryAction" />}
              {settings.secondary_button?.label && settings.secondary_button.url && <CtaLink button={settings.secondary_button} variant="onDark" guide="home.secondaryAction" />}
            </div>
          )}
          <ul className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-x-5 text-d-label-s">
            {(['home.check1', 'home.check2', 'home.check3'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <CircleCheck size={18} aria-hidden className="text-yellow shrink-0" />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        {photo ? <HeroPhotoBlock photo={photo} /> : <div aria-hidden className="h-8 lg:hidden" />}
        {showCard && (
          <div data-testid="hero-card" className="w-full lg:w-[410px] lg:shrink-0 lg:[&>*]:!w-full lg:[&_form]:!w-full">{card}</div>
        )}
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
