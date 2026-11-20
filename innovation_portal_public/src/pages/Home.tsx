import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { publicContent, HomeSection, ChallengeCard as Challenge, PostCard } from '../services/publicContent.service'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/EmptyState'
import QuickStartCard, { QuickStartDraft } from '../components/home/QuickStartCard'
import QuickStartStep2 from '../components/home/QuickStartStep2'
import HomeSections from '../components/home/HomeSections'
import VideoStoryDialog from '../components/home/VideoStoryDialog'
import Modal from '../components/ui/Modal'
import { useMediaQuery } from '../lib/useMediaQuery'
import type { SubmitResult } from '../types/innovator'

// Screen 1.1 Home (Figma 10:189 website, 10:800 phone). Data-driven: one call to GET /api/content/public/home/;
// sections render in the order the API returns them, only the ones it returns, and an unknown type is skipped.
// The banner is first with the 2-minute idea card. Language switch refetches in the new language.

function HomeSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-banner">
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
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[320px] rounded-card" />)}
      </div>
    </div>
  )
}

export default function Home() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const home = useAsync(() => publicContent.home(), [lang])
  const [step, setStep] = useState<{ draft: QuickStartDraft } | null>(null)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  // 1.4: the open video story lives in the URL (?story=slug) so it can be shared.
  const [params, setParams] = useSearchParams()
  const storySlug = params.get('story')
  const openStory = useCallback(
    (post: PostCard | null) =>
      setParams((p) => {
        const next = new URLSearchParams(p)
        if (post) next.set('story', post.slug || post.id)
        else next.delete('story')
        return next
      }),
    [setParams],
  )
  const video: PostCard | null = storySlug ? ({ slug: storySlug, id: storySlug, title: '' } as PostCard) : null

  const onSent = useCallback(
    (result: SubmitResult) => navigate('/idea-sent', { state: { result } }),
    [navigate],
  )

  if (home.loading) return <HomeSkeleton />
  if (home.error && !home.data) {
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        <ErrorState title={t('home.loadError')} body={t('home.loadErrorBody')} onRetry={home.reload} retrying={home.fetching} />
      </div>
    )
  }

  const sections = (home.data?.sections ?? []) as HomeSection[]
  const challenges: Challenge[] = (sections.find((s) => s.type === 'challenges')?.data as { items: Challenge[] } | undefined)?.items ?? []

  const step1 = <QuickStartCard challenges={challenges} onContinue={(draft) => setStep({ draft })} />
  const step2 = step ? <QuickStartStep2 draft={step.draft} onEdit={() => setStep(null)} onSent={onSent} /> : null
  // Desktop: step 2 replaces the card in the banner (1.2 website). Phone: it slides up as a sheet (1.2 phone).
  const card = isDesktop && step2 ? step2 : step1

  return (
    <div aria-busy={home.fetching || undefined}>
      <HomeSections sections={sections} card={card} onOpenVideo={openStory} />
      <VideoStoryDialog post={video} onClose={() => openStory(null)} onOpenPost={openStory} />
      {!isDesktop && (
        <Modal open={Boolean(step)} onClose={() => setStep(null)} closeOnBackdrop={false} bodyClassName="!p-0" size="md">
          {step2 && <div className="[&>form]:shadow-none [&>form]:rounded-none">{step2}</div>}
        </Modal>
      )}
    </div>
  )
}
