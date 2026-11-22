import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { guideAvailability } from '../../lib/guide/guide'
import { guideStatus, handOver } from '../../lib/guide/api'
import { usePublicConfig } from '../../lib/queries/platform'
import { useToast } from '../ui/toast'
import { useI18n } from '../../i18n/context'
import { GuideProvider } from './GuideProvider'
import { useGuide } from './guideContext'
import GuideButton from './GuideButton'
import GuidePanel from './GuidePanel'
import GuideSheet from './GuideSheet'
import Spotlight from './Spotlight'

// The staff "Need help?" guide (3.40): one button bottom right on every staff page, the panel (website) or sheet
// (phone), and the spotlight. Shown only while the guide is on (GET /api/assistant/status/ features.guide and the
// public config). "Talk to a person" hands the question to the team's inbox.

const MENU = 'aside nav a[href]'

export default function NeedHelp() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const config = usePublicConfig()
  const [status, setStatus] = useState(null)
  useEffect(() => {
    let live = true
    guideStatus().then((s) => live && setStatus(s))
    return () => { live = false }
  }, [])
  const on = guideAvailability({ status, config: config.data }).guide

  const talk = useCallback(async (question) => {
    try {
      await handOver(question || t('guide.title'), lang)
      toast?.show?.({ tone: 'success', title: t('guide.handedOver'), body: t('guide.handedOverBody') })
    } catch {
      toast?.show?.({ tone: 'danger', title: t('guide.handOverFailed'), body: t('guide.handOverFailedBody') })
    }
  }, [lang, t, toast])

  if (!on) return null
  return (
    <GuideProvider app="staff" menuSelector={MENU} onTalk={talk}>
      <GuideShell buttonClassName="right-4 bottom-4 sm:right-6 sm:bottom-6" />
    </GuideProvider>
  )
}

/** Button, panel or sheet, and spotlight. Shared by both apps' NeedHelp. */
export function GuideShell({ buttonClassName }) {
  const g = useGuide()
  const phone = useMediaQuery('(max-width: 639px)')
  const ref = useRef(null)
  return (
    <>
      <GuideButton ref={ref} className={buttonClassName} hidden={phone && g.open} />
      {phone ? <GuideSheet triggerRef={ref} /> : <GuidePanel triggerRef={ref} />}
      {g.open && <Spotlight />}
    </>
  )
}
