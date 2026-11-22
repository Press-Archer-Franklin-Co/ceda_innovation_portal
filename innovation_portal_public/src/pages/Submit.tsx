import { useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { usePageTitle } from '../lib/usePageTitle'
import { publicContent, HomeSection, ChallengeCard as Challenge } from '../services/publicContent.service'
import HeroBanner, { HeroBannerSkeleton, HeroSettings } from '../components/home/HeroBanner'
import { marksFromWords } from '../components/home/HeroHeadline'
import { useQuickStartFlow } from '../components/home/QuickStartFlow'

// "Submit an idea" (nav, header button, footer, challenge cards). The home banner with its quick start card
// (Figma 1.1 hero 10:243 / 10:827, then 1.2 step 2 11:188 / 11:375): the same components as on home, so a
// person can start without an account. Signed in, Continue opens the full form (2.3). ?challenge=<id> picks
// the challenge. The banner's own buttons are left out here: they point at this page.

export default function Submit() {
  const { t, lang } = useI18n()
  usePageTitle(t('nav.submit'))
  const home = useAsync(() => publicContent.home(), [lang])
  const sections = (home.data?.sections ?? []) as HomeSection[]
  const challenges: Challenge[] = (sections.find((s) => s.type === 'challenges')?.data as { items: Challenge[] } | undefined)?.items ?? []
  const { card, sheet } = useQuickStartFlow(challenges)

  if (home.loading) return <HeroBannerSkeleton />

  // The card does not need the home page content, so a failed load still lets people start.
  const hero = sections.find((s) => s.type === 'hero_banner')?.settings as HeroSettings | undefined
  const settings: HeroSettings = {
    headline: hero?.headline || t('submit.headline'),
    headline_marks: hero?.headline ? hero.headline_marks : marksFromWords(t('submit.headline'), t('submit.highlight')),
    text: hero?.headline ? hero.text : t('submit.text'),
    primary_button: null,
    secondary_button: null,
    show_watermark: hero?.show_watermark ?? true,
    show_quick_start: true,
  }

  return (
    <>
      <HeroBanner settings={settings} card={card} />
      {sheet}
    </>
  )
}
