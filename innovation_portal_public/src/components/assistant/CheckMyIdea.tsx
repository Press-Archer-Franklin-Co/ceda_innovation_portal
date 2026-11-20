import { useRef, useState } from 'react'
import { CheckCircle2, HelpCircle, PenLine, Search, Sparkles } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Modal from '../ui/Modal'
import { useI18n } from '../../i18n'
import { assistantService, type DraftFeedback } from '../../services/assistant.service'

type Panel = { kind: 'closed' } | { kind: 'loading' } | { kind: 'ready'; feedback: DraftFeedback } | { kind: 'unavailable' }

interface Props {
  draftId: string
  stepCode: string
  /** Current answers on this step (unsaved ones too). */
  answers: Record<string, unknown>
  /** Label of each field on the step, by key, for the "Go to this field" links. */
  fieldLabels: Record<string, string>
}

/**
 * C3: "Check my idea" on one step of the innovator form. The parent shows it only when the
 * helper's draft_check feature is on. Feedback opens in a panel with sections.
 * TODO(R-37): use the shared Sheet (side panel, bottom sheet on phone) when ui-system adds it.
 */
export default function CheckMyIdea({ draftId, stepCode, answers, fieldLabels }: Props) {
  const { t, lang } = useI18n()
  const [panel, setPanel] = useState<Panel>({ kind: 'closed' })
  const trigger = useRef<HTMLButtonElement>(null)

  async function check() {
    setPanel({ kind: 'loading' })
    const result = await assistantService.checkDraft(draftId, stepCode, answers, lang)
    setPanel(result.available ? { kind: 'ready', feedback: result } : { kind: 'unavailable' })
  }

  function goTo(key: string) {
    setPanel({ kind: 'closed' })
    // The genie gives focus back to its trigger when the close finishes, so move focus to the
    // field only after the dialog has left the page (with a fallback in case it never does).
    let done = false
    const focusField = () => {
      if (done) return
      done = true
      observer.disconnect()
      window.clearTimeout(fallback)
      const el = document.querySelector<HTMLElement>(`[name="${CSS.escape(key)}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el?.focus({ preventScroll: true })
    }
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[role="dialog"]')) window.requestAnimationFrame(focusField)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const fallback = window.setTimeout(focusField, 1500)
  }

  const open = panel.kind !== 'closed'
  const feedback = panel.kind === 'ready' ? panel.feedback : null
  const empty =
    feedback && !feedback.unclear.length && !feedback.missing.length && !feedback.officer_questions.length && !feedback.clear.length

  return (
    <>
      <Card padding="md">
        <p className="flex items-center gap-2 font-heading text-d-h5 text-text">
          <Sparkles size={18} aria-hidden className="text-accent" />
          {t('ai.check.title')}
        </p>
        <p className="mt-2 text-d-body-s text-muted">{t('ai.check.body')}</p>
        <Button ref={trigger} variant="secondary" size="sm" className="mt-3" onClick={check} loading={panel.kind === 'loading'}>
          {t('ai.check.button')}
        </Button>
      </Card>

      <Modal
        open={open}
        onClose={() => setPanel({ kind: 'closed' })}
        triggerRef={trigger}
        size="lg"
        title={t('ai.check.panelTitle')}
        description={t('ai.check.note')}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setPanel({ kind: 'closed' })}>{t('ai.check.close')}</Button>
            {panel.kind !== 'loading' && <Button variant="secondary" onClick={check}>{t('ai.check.again')}</Button>}
          </div>
        }
      >
        {panel.kind === 'loading' && (
          <p role="status" className="py-6 text-d-body text-muted">{t('ai.check.working')}</p>
        )}
        {panel.kind === 'unavailable' && <p className="py-4 text-d-body text-text">{t('ai.check.unavailable')}</p>}
        {feedback && (
          <div className="flex flex-col gap-6">
            {empty && <p className="text-d-body text-text">{t('ai.check.nothing')}</p>}
            {feedback.unclear.length > 0 && (
              <Section icon={<PenLine size={18} aria-hidden className="text-amber" />} title={t('ai.check.unclear')}>
                {feedback.unclear.map((item, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    {item.quote && <q className="text-d-body-s italic text-muted">{item.quote}</q>}
                    <span>{item.suggestion}</span>
                    {item.field_key && fieldLabels[item.field_key] && (
                      <FieldLink label={fieldLabels[item.field_key]} onClick={() => goTo(item.field_key)} text={t('ai.check.goTo')} />
                    )}
                  </li>
                ))}
              </Section>
            )}
            {feedback.missing.length > 0 && (
              <Section icon={<Search size={18} aria-hidden className="text-accent" />} title={t('ai.check.missing')}>
                {feedback.missing.map((item, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <span>{item.what}</span>
                    {item.field_key && fieldLabels[item.field_key] && (
                      <FieldLink label={fieldLabels[item.field_key]} onClick={() => goTo(item.field_key)} text={t('ai.check.goTo')} />
                    )}
                  </li>
                ))}
              </Section>
            )}
            {feedback.officer_questions.length > 0 && (
              <Section icon={<HelpCircle size={18} aria-hidden className="text-info" />} title={t('ai.check.questions')}>
                {feedback.officer_questions.map((question, i) => <li key={i}>{question}</li>)}
              </Section>
            )}
            {feedback.clear.length > 0 && (
              <Section icon={<CheckCircle2 size={18} aria-hidden className="text-success" />} title={t('ai.check.clear')}>
                {feedback.clear.map((point, i) => <li key={i}>{point}</li>)}
              </Section>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-heading text-d-h5 text-text">{icon}{title}</h3>
      <ul className="mt-3 flex flex-col gap-3 text-d-body-s text-text">{children}</ul>
    </section>
  )
}

function FieldLink({ label, text, onClick }: { label: string; text: string; onClick: () => void }) {
  return (
    <Button variant="link" size="sm" className="self-start" onClick={onClick} aria-label={`${text}: ${label}`}>
      {text}: {label}
    </Button>
  )
}
