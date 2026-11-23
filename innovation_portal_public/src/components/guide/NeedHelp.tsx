import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { guideAvailability } from '../../lib/guide/guide'
import { guideStatus, type AssistantStatus } from '../../lib/guide/api'
import { usePublicConfig } from '../../lib/usePublicConfig'
import { useAuth } from '../../context/AuthContext'
import HelpBubble from '../livechat/HelpBubble'
import { GuideProvider } from './GuideProvider'
import { useGuide } from './guideContext'
import GuideButton from './GuideButton'
import GuidePanel from './GuidePanel'
import GuideSheet from './GuideSheet'
import Spotlight from './Spotlight'

// The public and innovator "Need help?" (2.14). One button bottom right, in the live chat bubble's place (2.12):
// - guide on: the guide; "Talk to a person" opens the live chat window (when live chat is on);
// - guide off, live chat on: the live chat bubble exactly as before;
// - both off: no button.

const MENU = 'header nav a[href], nav[aria-label] a[href]'
const BUTTON = 'right-4 sm:right-8 bottom-[84px] lg:bottom-8'

export default function NeedHelp() {
  const config = usePublicConfig()
  const { isAuthenticated } = useAuth()
  const [status, setStatus] = useState<AssistantStatus | null | undefined>(undefined)
  const [chatOn, setChatOn] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  useEffect(() => {
    let live = true
    guideStatus().then((s) => live && setStatus(s))
    return () => { live = false }
  }, [isAuthenticated]) // signing in or out changes what this person may use
  const onStatus = useCallback((on: boolean) => setChatOn(on), [])
  const talk = useCallback(() => setChatOpen(true), [])

  if (status === undefined) return null // a moment, so the old bubble never flashes before the guide
  const on = guideAvailability({ status, config, chat: chatOn, signedIn: isAuthenticated })
  if (!on.guide) return <HelpBubble onStatus={onStatus} />
  return (
    <GuideProvider app="public" menuSelector={MENU} onTalk={talk} canTalk={chatOn}>
      <GuideShell buttonClassName={BUTTON} />
      <GuideChat open={chatOpen} onOpenChange={setChatOpen} onStatus={onStatus} />
    </GuideProvider>
  )
}

/** The live chat opened from the guide; Back returns to the guide's start view and keeps the chat open. */
function GuideChat({ open, onOpenChange, onStatus }: { open: boolean; onOpenChange: (open: boolean) => void; onStatus: (on: boolean) => void }) {
  const g = useGuide()
  const back = useCallback(() => { g.reset?.(); g.setOpen(true) }, [g])
  return <HelpBubble fromGuide open={open} onOpenChange={onOpenChange} onStatus={onStatus} onBack={back} />
}

/** Button, panel or sheet, and spotlight. */
export function GuideShell({ buttonClassName }: { buttonClassName?: string }) {
  const g = useGuide()
  const phone = useMediaQuery('(max-width: 639px)')
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <GuideButton ref={ref} className={buttonClassName} hidden={phone && g.open} />
      {phone ? <GuideSheet triggerRef={ref} /> : <GuidePanel triggerRef={ref} />}
      {g.open && <Spotlight />}
    </>
  )
}
