import { Fragment } from 'react'
import type { ReactNode } from 'react'
import HeroBanner, { HeroSettings } from './HeroBanner'
import {
  BulletinBoard, ChallengesSection, CtaBand, HowItWorks, NewsFlash, PartnersStrip, QuotesSection, SectorsSection, StoriesSection,
} from './sections'
import type { HomeSection, PostCard } from '../../services/publicContent.service'

/**
 * The home page sections in the order given (1.1). Used by the home page and by the staff
 * home page editor's preview (3.8, /preview/home), so the preview and the site never drift.
 * `card` is the quick start card shown in the banner.
 */
export default function HomeSections({ sections, card, onOpenVideo, afterHero }: { sections: HomeSection[]; card: ReactNode; onOpenVideo?: (post: PostCard) => void; afterHero?: ReactNode }) {
  return (
    <>
      {sections.map((section, i) => {
        const key = section.id ?? `${section.type}-${i}`
        switch (section.type) {
          case 'hero_banner':
            return (
              <Fragment key={key}>
                <HeroBanner settings={section.settings as HeroSettings} card={card} photo={section.data?.photo ?? null} />
                {afterHero}
              </Fragment>
            )
          case 'partners_strip':
            return <PartnersStrip key={key} title={section.settings.title} items={section.data?.items ?? []} />
          case 'challenges':
            return <ChallengesSection key={key} title={section.settings.title} items={section.data?.items ?? []} />
          case 'leadership_quotes':
            return <QuotesSection key={key} title={section.settings.title} items={section.data?.items ?? []} rotationSeconds={section.data?.rotation_seconds ?? 0} />
          case 'news_flash':
            return <NewsFlash key={key} title={section.settings.title} items={section.data?.items ?? []} onOpenVideo={onOpenVideo} />
          case 'bulletin_board':
            return <BulletinBoard key={key} title={section.settings.title} items={section.data?.items ?? []} />
          case 'sectors':
            return <SectorsSection key={key} title={section.settings.title} items={section.data?.items ?? []} />
          case 'how_it_works':
            return <HowItWorks key={key} title={section.settings.title} steps={section.settings.steps ?? []} />
          case 'cta_band':
            return <CtaBand key={key} headline={section.settings.headline} text={section.settings.text} button={section.settings.button} />
          case 'stories':
            return <StoriesSection key={key} title={section.settings.title} items={section.data?.items ?? []} />
          default:
            return null // a section type this site does not know yet is skipped, not an error
        }
      })}
    </>
  )
}
