import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { formsService } from '../../services/forms.service'
import type { FormStep, PublishedForm } from '../../types/innovator'

/**
 * Prompt 31 part B: the quick start is step 1 of the real form, so its progress bar shows the form's own steps
 * ("1 · Your idea", "2 · About you", ..., then Review), the same names the full form (2.3) shows.
 * Without a form id it uses the one General ideas form (GET /api/forms/general-ideas/published/).
 */
export interface Journey {
  form: PublishedForm | null
  steps: FormStep[]
  /** Step names for StepProgress: the form's steps, then Review. Empty until the form loads. */
  names: string[]
}

export function useJourney(formId: string | null): Journey {
  const { t, lang } = useI18n()
  const [form, setForm] = useState<PublishedForm | null>(null)
  useEffect(() => {
    let alive = true
    const load = formId ? formsService.published(formId, lang) : formsService.generalIdea(lang)
    load.then((doc) => alive && setForm(doc)).catch(() => alive && setForm(null))
    return () => {
      alive = false
    }
  }, [formId, lang])
  const steps = (form?.steps ?? []).filter((step) => step.is_active !== false)
  return { form, steps, names: steps.length ? [...steps.map((s) => s.title), t('form.reviewStep')] : [] }
}

/** The step that holds the person's name, if the form asks it (the general form's "About you"). */
export function nameStep(steps: FormStep[]): FormStep | undefined {
  return steps.find((step) => {
    const keys = step.rows.flatMap((row) => row.fields.map((f) => f.key))
    return keys.includes('first_name') && keys.includes('last_name')
  })
}

/**
 * Where the full form opens after the card. The card is step 1, so it opens at step 2. When the idea may not be
 * sent with just the basics (the switch is off, or it is a challenge entry), the first step's required questions
 * are still unanswered, so it opens at step 1 instead.
 */
export function startStep(steps: FormStep[], sendNowAllowed: boolean): string | null {
  if (steps.length === 0) return null
  return (sendNowAllowed && steps[1] ? steps[1] : steps[0]).code
}
