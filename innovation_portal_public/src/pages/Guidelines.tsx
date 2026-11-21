import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, Cog, Lightbulb, Package, Users } from 'lucide-react'
import PageBanner from '../components/layout/PageBanner'
import SectionHead from '../components/home/SectionHead'
import HelpContactCard from '../components/help/HelpContactCard'
import { buttonClasses } from '../components/ui/Button'
import { SUBMIT_PATH } from '../lib/paths'
import { useI18n, StringKey } from '../i18n'
import { usePageTitle } from '../lib/usePageTitle'

// The submission guide (footer "How it works", "Evaluation criteria" at #criteria, home "Full guide").
// Option D look of 1.6 and 1.7: page banner, then each part of the guide as a section with the shared section
// head. The words are CEDA's guide; the "How to send it" steps follow how the portal works now (no account
// needed to start).

const KINDS = [
  { icon: Lightbulb, n: 1 },
  { icon: Cog, n: 2 },
  { icon: Package, n: 3 },
  { icon: Users, n: 4 },
] as const
const FIELDS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const CRITERIA = [1, 2, 3, 4, 5, 6, 7] as const
const REVIEW = [1, 2, 3, 4] as const
const TIPS = [1, 2, 3, 4, 5] as const

const k = (key: string) => key as StringKey

function Section({ id, title, soft = false, children }: { id: string; title: string; soft?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={soft ? 'bg-surface2 scroll-mt-6' : 'scroll-mt-6'}>
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-16">
        <SectionHead id={`${id}-title`} title={title} />
        {children}
      </div>
    </section>
  )
}

export default function Guidelines() {
  const { t } = useI18n()
  usePageTitle(t('guide.over'))
  return (
    <>
      <PageBanner id="guide-title" overline={t('guide.over')} title={t('guide.title')} subtitle={t('guide.sub')}>
        <Link to={SUBMIT_PATH} className={buttonClasses({ variant: 'accent' })}>
          {t('nav.submit')}
          <ArrowRight size={18} aria-hidden />
        </Link>
      </PageBanner>

      <Section id="who" title={t('guide.who')}>
        <ul className="flex flex-col gap-3">
          {(['guide.who1', 'guide.who2'] as const).map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-d-body text-text">
              <CircleCheck size={20} aria-hidden className="text-success shrink-0 mt-0.5" />
              {t(key)}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="kinds" title={t('guide.kinds')} soft>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {KINDS.map(({ icon: Icon, n }) => (
            <article key={n} className="flex flex-col gap-3 p-6 rounded-card bg-surface border border-border">
              <span aria-hidden className="w-11 h-11 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center">
                <Icon size={22} />
              </span>
              <h3 className="text-d-h5 font-heading text-text">{t(k(`guide.kind${n}`))}</h3>
              <p className="text-d-body-s text-muted">{t(k(`guide.kind${n}Body`))}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="include" title={t('guide.include')}>
        <dl className="rounded-card border border-border overflow-hidden">
          {FIELDS.map((n) => (
            <div key={n} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-6 px-5 py-4 border-b border-border last:border-b-0">
              <dt className="text-d-h5 font-heading text-text sm:w-56 shrink-0">{t(k(`guide.f${n}`))}</dt>
              <dd className="text-d-body-s text-muted">{t(k(`guide.f${n}Body`))}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <section id="steps" aria-labelledby="steps-title" className="bg-banner text-on-banner scroll-mt-6">
        <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-16">
          <SectionHead id="steps-title" title={t('guide.steps')} tone="dark" />
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex flex-col gap-2 p-6 rounded-card bg-on-banner/10">
                <span aria-hidden className="w-8 h-8 rounded-full bg-yellow text-banner-deep flex items-center justify-center text-d-label-s">{n}</span>
                <span className="text-d-h5 font-heading">{t(k(`guide.step${n}`))}</span>
                <span className="text-d-body-s text-banner-muted">{t(k(`guide.step${n}Body`))}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Section id="criteria" title={t('guide.criteria')}>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CRITERIA.map((n) => (
            <li key={n} className="flex items-start gap-3 p-5 rounded-card border border-border">
              <span aria-hidden className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" />
              <span className="flex flex-col gap-1">
                <span className="text-d-h5 font-heading text-text">{t(k(`guide.c${n}`))}</span>
                <span className="text-d-body-s text-muted">{t(k(`guide.c${n}Body`))}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="review" title={t('guide.review')} soft>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {REVIEW.map((n) => (
            <li key={n} className="flex lg:flex-col gap-3">
              <span aria-hidden className="w-8 h-8 rounded-full bg-surface text-text border border-border flex items-center justify-center text-d-label-s shrink-0">{n}</span>
              <span className="flex flex-col gap-1">
                <span className="text-d-h5 font-heading text-text">{t(k(`guide.r${n}`))}</span>
                <span className="text-d-body-s text-muted">{t(k(`guide.r${n}Body`))}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-labelledby="rewards-title" className="p-6 rounded-card border border-border flex flex-col gap-3">
          <h2 id="rewards-title" className="text-d-h4 font-heading text-text">{t('guide.rewards')}</h2>
          <ul className="flex flex-col gap-2.5">
            {(['guide.reward1', 'guide.reward2'] as const).map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-d-body-s text-text">
                <CircleCheck size={18} aria-hidden className="text-success shrink-0 mt-0.5" />
                {t(key)}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="tips-title" className="p-6 rounded-card border border-border flex flex-col gap-3">
          <h2 id="tips-title" className="text-d-h4 font-heading text-text">{t('guide.tips')}</h2>
          <ol className="flex flex-col gap-2.5">
            {TIPS.map((n) => (
              <li key={n} className="flex items-start gap-2.5 text-d-body-s text-text">
                <span aria-hidden className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center text-d-cap font-bold shrink-0">{n}</span>
                {t(k(`guide.tip${n}`))}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 pb-12 lg:pb-[72px] flex flex-col gap-6">
        <section aria-labelledby="guide-cta-title" className="rounded-card bg-banner text-on-banner p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="guide-cta-title" className="text-d-h3 font-heading">{t('guide.ctaTitle')}</h2>
            <p className="text-d-body text-banner-muted">{t('guide.ctaBody')}</p>
          </div>
          <Link to={SUBMIT_PATH} className={buttonClasses({ variant: 'accent', className: 'shrink-0' })}>
            {t('nav.submit')}
            <ArrowRight size={18} aria-hidden />
          </Link>
        </section>
        <HelpContactCard id="guide-contact-title" showGuide={false} />
      </div>
    </>
  )
}
