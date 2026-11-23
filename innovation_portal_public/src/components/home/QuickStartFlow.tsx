import { ReactNode, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuickStartCard, { QuickStartDraft } from './QuickStartCard'
import QuickStartStep2 from './QuickStartStep2'
import Modal from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { intakeService, resumeStorage } from '../../services/intake.service'
import { parseApiError } from '../../utils/apiError'
import { formsService } from '../../services/forms.service'
import { startStep } from './journeySteps'
import type { ChallengeCard } from '../../services/publicContent.service'

// The quick start used on the home banner (1.1) and on /submit: one flow, so both pages behave the same.
// Prompt 31 part B: the card is step 1 of the real form (the one General ideas form, or the challenge's form).
// Signed out: the card, then 1.2 (name and phone, confirmed with a code, which signs them in), then the full
//   form (2.3) at step 2. Desktop: 1.2 replaces the card in the banner. Phone: it slides up as a sheet.
// Signed in: the card, then the draft joins the account and the full form opens at step 2.

export function useQuickStartFlow(challenges: ChallengeCard[]): { card: ReactNode; sheet: ReactNode } {
  const { t, lang } = useI18n()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [step, setStep] = useState<{ draft: QuickStartDraft } | null>(null)
  const [opening, setOpening] = useState(false)

  const onContinued = useCallback((path: string) => navigate(path), [navigate])

  const onContinue = useCallback(
    async (draft: QuickStartDraft) => {
      if (!isAuthenticated) {
        resumeStorage.setStage('confirm')
        setStep({ draft })
        return
      }
      setOpening(true)
      try {
        const joined = await intakeService.claim(draft.draftId, draft.token)
        const form = joined.form_id ? await formsService.published(joined.form_id, lang).catch(() => null) : null
        const first = startStep((form?.steps ?? []).filter((s) => s.is_active !== false), Boolean(joined.send_now_allowed))
        navigate(`/my-ideas/draft/${draft.draftId}${first ? `?step=${encodeURIComponent(first)}` : ''}`)
        // Forget the guest draft only once the full form has it.
        resumeStorage.clear()
      } catch (error) {
        toast.show({ tone: 'error', title: parseApiError(error, t('common.somethingWrong')) })
        setOpening(false)
      }
    },
    [isAuthenticated, lang, navigate, t, toast],
  )

  const back = useCallback(() => {
    resumeStorage.setStage(null)
    setStep(null)
  }, [])

  const step1 = <QuickStartCard challenges={challenges} onContinue={onContinue} busy={opening} />
  const step2 = step ? <QuickStartStep2 draft={step.draft} onEdit={back} onContinued={onContinued} /> : null
  const card = isDesktop && step2 ? step2 : step1
  const sheet = isDesktop ? null : (
    // Opens once the draft is saved (after a network call), not on the click itself.
    <Modal open={Boolean(step)} onClose={back} routeOpened closeOnBackdrop={false} bodyClassName="!p-0" size="md">
      {/* pr-10 on the heading keeps the title clear of the sheet's close button. */}
      {step2 && <div className="[&>form]:shadow-none [&>form]:rounded-none [&>form>h2:first-child]:pr-10">{step2}</div>}
    </Modal>
  )
  return { card, sheet }
}
