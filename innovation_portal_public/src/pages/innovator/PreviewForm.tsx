import { useEffect, useMemo, useState } from 'react'
import StepProgress from '../../components/ui/StepProgress'
import FormRenderer from '../../components/innovator/form/FormRenderer'
import { pick, type Answers, type MaybeBilingual } from '../../components/innovator/form/logic'
import { useI18n } from '../../i18n'
import type { FormStep, Lang } from '../../types/innovator'
import { isStaffOrigin, postToStaff } from '../../lib/previewBridge'

/**
 * Staff form builder preview (U5, 3.5). The staff console shows this page in an
 * iframe and posts the draft form document to it, so staff see exactly what
 * applicants see. It calls no API and keeps answers only in memory.
 * Messages are checked in lib/previewBridge.
 */
interface PreviewMessage {
  type: 'ceda-form-preview:document'
  document: { steps?: FormStep[] }
  lang?: Lang
  stepIndex?: number
}

export default function PreviewForm() {
  const { setLang } = useI18n()
  const [doc, setDoc] = useState<PreviewMessage['document'] | null>(null)
  const [lang, setPreviewLang] = useState<Lang>('en')
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isStaffOrigin(event.origin) || event.source !== window.parent) return
      const data = event.data as PreviewMessage
      if (data?.type !== 'ceda-form-preview:document' || !data.document) return
      setDoc(data.document)
      if (data.lang === 'en' || data.lang === 'tn') {
        setPreviewLang(data.lang)
        setLang(data.lang)
      }
      if (typeof data.stepIndex === 'number') setStepIndex(data.stepIndex)
    }
    window.addEventListener('message', onMessage)
    postToStaff({ type: 'ceda-form-preview:ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [setLang])

  const steps = useMemo(() => (doc?.steps ?? []).filter((s) => s.is_active !== false), [doc])
  const step = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))]

  if (!doc || !step) return <div className="min-h-screen bg-bg" aria-busy="true" />

  const title = (value: unknown) => pick(value as MaybeBilingual, lang)

  return (
    <div className="min-h-screen bg-bg px-4 py-6 sm:px-6">
      <StepProgress steps={steps.map((s) => title(s.title))} current={steps.indexOf(step)} onStepClick={setStepIndex} />
      <h1 className="mt-6 font-heading text-d-h3 text-text">{title(step.title)}</h1>
      {title(step.description) && <p className="mt-2 text-d-body text-muted">{title(step.description)}</p>}
      <div className="mt-6">
        <FormRenderer step={step} answers={answers} onChange={(key, value) => setAnswers((prev) => ({ ...prev, [key]: value }))} lang={lang} preview />
      </div>
    </div>
  )
}
