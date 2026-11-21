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
import type { ChallengeCard } from '../../services/publicContent.service'
import type { SubmitResult } from '../../types/innovator'

// The quick start used on the home banner (1.1) and on /submit: one flow, so both pages behave the same.
// Signed out: step 1 (the card), then step 2 (1.2), which sends the idea and opens 1.5.
//   Desktop: step 2 replaces the card in the banner. Phone: it slides up as a sheet.
// Signed in: step 1, then the draft joins the account and the full form opens (2.3).

export function useQuickStartFlow(challenges: ChallengeCard[]): { card: ReactNode; sheet: ReactNode } {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [step, setStep] = useState<{ draft: QuickStartDraft } | null>(null)
  const [opening, setOpening] = useState(false)

  const onSent = useCallback((result: SubmitResult) => navigate('/idea-sent', { state: { result } }), [navigate])

  const onContinue = async (draft: QuickStartDraft) => {
    if (!isAuthenticated) {
      setStep({ draft })
      return
    }
    setOpening(true)
    try {
      await intakeService.claim(draft.draftId, draft.token)
      navigate(`/my-ideas/draft/${draft.draftId}`)
      // Forget the guest draft only once the full form has it.
      resumeStorage.clear()
    } catch (error) {
      toast.show({ tone: 'error', title: parseApiError(error, t('common.somethingWrong')) })
      setOpening(false)
    }
  }

  const step1 = <QuickStartCard challenges={challenges} onContinue={onContinue} busy={opening} />
  const step2 = step ? <QuickStartStep2 draft={step.draft} onEdit={() => setStep(null)} onSent={onSent} /> : null
  const card = isDesktop && step2 ? step2 : step1
  const sheet = isDesktop ? null : (
    <Modal open={Boolean(step)} onClose={() => setStep(null)} closeOnBackdrop={false} bodyClassName="!p-0" size="md">
      {/* pr-10 on the heading row keeps "Step 2 of 2" clear of the sheet's close button. */}
      {step2 && <div className="[&>form]:shadow-none [&>form]:rounded-none [&>form>div:first-child]:pr-10">{step2}</div>}
    </Modal>
  )
  return { card, sheet }
}
