import { useEffect, useRef, useState } from 'react'
import HomeSections from '../components/home/HomeSections'
import QuickStartCard from '../components/home/QuickStartCard'
import { useI18n } from '../i18n'
import { isStaffOrigin, postToStaff } from '../lib/previewBridge'
import type { ChallengeCard, HomeSection } from '../services/publicContent.service'
import type { Lang } from '../types/innovator'

/**
 * Staff home page editor preview (U6, 3.8). The staff console shows this page in an iframe and
 * posts the draft sections to it, already in one language and with their data, in the same shape
 * as GET /api/content/public/home/. It renders them with the home page's own HomeSections.
 *
 * Nothing here calls the content API. The quick start card is shown but cannot be used, so
 * typing in the preview never makes a real idea draft. Links do not navigate away.
 */
interface PreviewMessage {
  type: 'ceda-home-preview:page'
  sections: HomeSection[]
  lang?: Lang
}

export default function PreviewHome() {
  const { setLang } = useI18n()
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isStaffOrigin(event.origin) || event.source !== window.parent) return
      const data = event.data as PreviewMessage
      if (data?.type !== 'ceda-home-preview:page' || !Array.isArray(data.sections)) return
      setSections(data.sections)
      if (data.lang === 'en' || data.lang === 'tn') setLang(data.lang)
    }
    window.addEventListener('message', onMessage)
    postToStaff({ type: 'ceda-home-preview:ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [setLang])

  // Report the page height, so the console can scale the whole page into its preview panel.
  useEffect(() => {
    const el = root.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => postToStaff({ type: 'ceda-home-preview:height', height: Math.ceil(el.scrollHeight) }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [sections])

  if (!sections) return <div className="min-h-screen bg-bg" aria-busy="true" />

  const challenges = ((sections.find((s) => s.type === 'challenges')?.data as { items?: ChallengeCard[] } | null)?.items ?? [])
  const card = (
    <div {...{ inert: '' }} aria-hidden className="pointer-events-none select-none w-full lg:w-[470px] shrink-0">
      <QuickStartCard challenges={challenges} onContinue={() => undefined} />
    </div>
  )

  return (
    <div
      ref={root}
      className="bg-bg"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('a')) e.preventDefault()
      }}
    >
      <HomeSections sections={sections} card={card} />
    </div>
  )
}
