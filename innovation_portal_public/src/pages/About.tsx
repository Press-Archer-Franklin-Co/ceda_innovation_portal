import { CircleCheck, Compass, Eye, Heart } from 'lucide-react'
import PageBanner from '../components/layout/PageBanner'
import SectionHead from '../components/home/SectionHead'
import HelpContactCard from '../components/help/HelpContactCard'
import { useI18n, hasString, StringKey } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { usePageTitle } from '../lib/usePageTitle'
import { contentService } from '../services/content.service'

// About (footer "About the portal", "Contact"). Option D look of 1.6 and 1.7: page banner with the CEDA mark,
// three cards, why it matters on the chocolate band with the live portal numbers, the five steps, and the
// contact card at #contact. Numbers come only from GET /api/content/public-stats/; a number the page has no
// words for is left out, and nothing shows while they load or if they fail.

const CARDS = [
  { icon: Compass, title: 'about.missionTitle', body: 'about.missionBody' },
  { icon: Eye, title: 'about.visionTitle', body: 'about.visionBody' },
  { icon: Heart, title: 'about.valuesTitle', body: 'about.valuesBody' },
] as const

const WHY = ['about.why1', 'about.why2', 'about.why3', 'about.why4'] as const
const STEPS = [1, 2, 3, 4, 5] as const

export default function About() {
  const { t } = useI18n()
  usePageTitle(t('about.over'))
  const stats = useAsync(() => contentService.getPublicStats(), [])
  const numbers = (stats.data ?? []).filter((s) => hasString(`about.stat.${s.key}`) && /^\d[\d,\s]*$/.test(String(s.value)))

  return (
    <>
      <PageBanner id="about-title" overline={t('about.over')} title={t('about.title')} subtitle={t('about.sub')} />

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-[72px] grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        {CARDS.map(({ icon: Icon, title, body }) => (
          <article key={title} className="flex flex-col gap-3 p-6 rounded-card border border-border">
            <span aria-hidden className="w-11 h-11 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center">
              <Icon size={22} />
            </span>
            <h2 className="text-d-h4 font-heading text-text">{t(title)}</h2>
            <p className="text-d-body-s text-muted">{t(body)}</p>
          </article>
        ))}
      </div>

      <section aria-labelledby="about-why-title" className="bg-banner text-on-banner">
        <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-[72px] grid grid-cols-1 lg:grid-cols-2 gap-10 lg:items-center">
          <div>
            <SectionHead id="about-why-title" overline={t('about.whyOver')} title={t('about.whyTitle')} tone="dark" />
            <ul className="flex flex-col gap-3">
              {WHY.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-d-body">
                  <CircleCheck size={20} aria-hidden className="text-yellow shrink-0 mt-0.5" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
          {numbers.length > 0 && (
            <dl aria-label={t('about.statsLabel')} className="grid grid-cols-2 gap-4">
              {numbers.map((s) => (
                <div key={s.key} className="rounded-card bg-on-banner/10 p-5 flex flex-col-reverse gap-1">
                  <dt className="text-d-label-s text-banner-muted">{t(`about.stat.${s.key}` as StringKey)}</dt>
                  <dd className="font-heading font-extrabold text-d-h2 text-on-banner">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section aria-labelledby="about-how-title">
        <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-[72px]">
          <SectionHead id="about-how-title" overline={t('about.howOver')} title={t('about.howTitle')} link={{ to: '/guidelines', label: t('help.guide') }} />
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {STEPS.map((n) => (
              <li key={n} className="flex lg:flex-col gap-3">
                <span aria-hidden className={`w-8 h-8 rounded-full flex items-center justify-center text-d-label-s shrink-0 ${n === 1 ? 'bg-primary text-on-primary' : 'bg-surface2 text-text'}`}>
                  {n}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-d-h5 font-heading text-text">{t(`about.step${n}` as StringKey)}</span>
                  <span className="text-d-body-s text-muted">{t(`about.step${n}Body` as StringKey)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div id="contact" className="scroll-mt-6 max-w-[1200px] mx-auto px-5 lg:px-6 pb-12 lg:pb-[72px]">
        <p className="text-d-over uppercase font-heading text-accent mb-3">{t('about.contactOver')}</p>
        <HelpContactCard id="about-contact-title" title={t('about.contactTitle')} />
      </div>
    </>
  )
}
