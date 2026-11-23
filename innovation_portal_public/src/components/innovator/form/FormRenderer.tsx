import { type ReactNode, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import Field from '../../ui/Field'
import { InputControl } from '../../ui/Input'
import Textarea from '../../ui/Textarea'
import { SelectControl } from '../../ui/Select'
import { Checkbox, RadioGroup, Toggle } from '../../ui/Choice'
import Tag from '../../ui/Tag'
import { useI18n } from '../../../i18n'
import type { FormField, FormStep, Lang } from '../../../types/innovator'
import { referenceService, type ReferenceItem } from '../../../services/reference.service'
import UploadField from './UploadField'
import {
  type Answers, type FieldProblem, type MaybeBilingual, WIDTH_SPAN,
  isEnabled, isRequired, isVisible, maxChars, pick,
} from './logic'

/**
 * Renders one step of a form exactly as the form builder saved it: rows,
 * widths (quarter, half, three-quarter, full; one column on phone), live
 * conditions, challenge-question badges. Answers stay in the parent, so
 * switching language never loses them.
 *
 * Used by the applicant full form (2.3) and the staff builder preview (U5).
 * Texts may be strings (published form) or {en, tn} (staff draft).
 */
export interface FormRendererProps {
  step: FormStep
  answers: Answers
  onChange: (key: string, value: unknown) => void
  lang: Lang
  /** Field key to a message (from checkStep or from the API). */
  errors?: Record<string, FieldError>
  /** Preview mode: nothing uploads and nothing is sent. */
  preview?: boolean
  /** Prompt 37: questions filled from the person's profile (key to the answer as they read it). Shown with Edit. */
  fromProfile?: Readonly<Record<string, string>>
  onEditProfile?: (key: string) => void
  /** "Respond to changes": the questions the officer flagged. Only these can change; they are highlighted. */
  flagged?: ReadonlySet<string>
}

export default function FormRenderer({ step, answers, onChange, lang, errors = {}, preview = false, fromProfile, onEditProfile, flagged }: FormRendererProps) {
  return (
    <div className="flex flex-col gap-6">
      {step.rows.map((row) => {
        const fields = row.fields.filter((field) => isVisible(field, answers))
        if (fields.length === 0) return null
        return (
          <div key={row.row} className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-6">
            {fields.map((field) => (
              <div
                key={field.key}
                id={flagged ? `field-${field.key}` : undefined}
                className={clsx('min-w-0 scroll-mt-40', WIDTH_SPAN[field.width] ?? WIDTH_SPAN.full)}
                // Need help guide (2.14): each question can be ringed; its label is sent, never the answer.
                {...(field.type === 'heading' || field.type === 'paragraph' ? {} : { 'data-guide': `idea.field.${field.key}`, 'data-guide-kind': 'field', 'data-guide-label': pick(field.label as MaybeBilingual, lang) })}
              >
                {/* Profile answers show only while filling a draft, never in "Respond to changes" (flagged). */}
                {!flagged && fromProfile && field.key in fromProfile && onEditProfile ? (
                  <ProfileAnswer label={pick(field.label as MaybeBilingual, lang)} shown={fromProfile[field.key]} onEdit={() => onEditProfile(field.key)} />
                ) : (
                  <FieldBlock field={field} answers={answers} onChange={onChange} lang={lang} error={errors[field.key]} preview={preview} locked={Boolean(flagged) && !flagged?.has(field.key)} flagged={Boolean(flagged?.has(field.key))} />
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** A question the profile answered: the answer, "From your profile" and Edit (it is not asked again). */
function ProfileAnswer({ label, shown, onEdit }: { label: string; shown: string; onEdit: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-d-label text-text">{label}</p>
      <div className="flex min-h-[46px] flex-wrap items-center gap-3 rounded-control border border-border bg-surface2 px-4 py-2.5">
        <span className="min-w-0 flex-1 break-words text-d-body text-text">{shown}</span>
        <Tag tone="neutral">{t('form.fromProfile')}</Tag>
        <button type="button" onClick={onEdit} aria-label={t('form.editProfileAnswer', { label })} className="text-d-label text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {t('form.edit')}
        </button>
      </div>
    </div>
  )
}

type FieldError = FieldProblem | string | string[]

function useErrorText(error: FieldError | undefined): string | undefined {
  const { t } = useI18n()
  if (!error) return undefined
  if (typeof error === 'string') return error
  if (Array.isArray(error)) return error.join(' ')
  switch (error.kind) {
    case 'required':
      return t('form.err.required')
    case 'email':
      return t('form.err.email')
    case 'phone':
      return t('form.err.phone')
    case 'number':
      return t('form.err.number')
    case 'omang':
      return t('form.err.omang')
    case 'url':
      return t('form.err.url')
    case 'rule':
      return error.message || t('form.err.required')
    default:
      return undefined
  }
}

interface FieldBlockProps {
  field: FormField
  answers: Answers
  onChange: (key: string, value: unknown) => void
  lang: Lang
  error?: FieldError
  preview: boolean
  /** Shown with its answer but cannot change (respond to changes: not flagged). */
  locked?: boolean
  /** The officer asked to change this one. */
  flagged?: boolean
}

function FieldBlock({ field, answers, onChange, lang, error, preview, locked = false, flagged = false }: FieldBlockProps) {
  const { t } = useI18n()
  const errorText = useErrorText(error)
  const text = (value: unknown) => pick(value as MaybeBilingual, lang)
  const label = text(field.label)
  const hint = text(field.help_text) || undefined
  const placeholder = text(field.placeholder) || undefined
  const required = isRequired(field, answers)
  const disabled = locked || !isEnabled(field, answers)
  const value = answers[field.key]
  const set = (next: unknown) => onChange(field.key, next)

  if (field.type === 'heading') {
    return <h3 className="font-heading text-d-h4 text-text">{label}</h3>
  }
  if (field.type === 'paragraph') {
    return <p className="text-d-body text-muted whitespace-pre-line">{label || hint}</p>
  }

  const badge = field.is_challenge_question ? (
    <Tag tone="orange" className="mb-2">{t('form.challengeQuestion')}</Tag>
  ) : null

  const wrap = (children: ReactNode) =>
    flagged ? (
      <div className="rounded-card border-2 border-amber bg-warning-soft p-4">
        <Tag tone="orange" className="mb-2">{t('chg.flagged')}</Tag>
        {children}
      </div>
    ) : field.is_challenge_question ? (
      <div className="rounded-card border border-accent/40 bg-accent-soft/40 p-4">
        {badge}
        {children}
      </div>
    ) : (
      <>{children}</>
    )

  const options = field.options.map((option) => ({
    value: option.value,
    label: text(option.label),
    description: text(option.description) || undefined,
  }))

  switch (field.type) {
    case 'textarea':
      return wrap(
        <Textarea
          label={label}
          hint={hint}
          error={errorText}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          maxChars={maxChars(field)}
          rows={5}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => set(e.target.value)}
        />,
      )

    case 'radio':
    case 'yes_no': {
      const choices =
        field.type === 'yes_no' && options.length === 0
          ? [
              { value: 'yes', label: t('form.yes') },
              { value: 'no', label: t('form.no') },
            ]
          : options
      return wrap(
        <RadioGroup
          name={field.key}
          legend={<LegendText label={label} required={required} />}
          options={choices.map((o) => ({ ...o, disabled }))}
          value={typeof value === 'string' ? value : value === true ? 'yes' : value === false ? 'no' : null}
          onChange={set}
          inline={field.type === 'yes_no'}
          variant={field.type === 'radio' && options.some((o) => o.description) ? 'cards' : 'list'}
          error={errorText}
          hint={hint}
        />,
      )
    }

    case 'checkboxes':
    case 'multiselect': {
      const chosen = Array.isArray(value) ? value.map(String) : []
      return wrap(
        <fieldset className="min-w-0">
          <legend className="text-d-label text-text mb-1">
            <LegendText label={label} required={required} />
          </legend>
          <div className="flex flex-col">
            {options.map((option) => (
              <Checkbox
                key={option.value}
                name={field.key}
                value={option.value}
                label={option.label}
                description={option.description}
                disabled={disabled}
                invalid={Boolean(errorText)}
                checked={chosen.includes(option.value)}
                onChange={(e) =>
                  set(e.target.checked ? [...chosen, option.value] : chosen.filter((v) => v !== option.value))
                }
              />
            ))}
          </div>
          {errorText && <p role="alert" className="text-d-cap text-danger mt-1">{errorText}</p>}
          {hint && <p className="text-d-cap text-muted mt-1">{hint}</p>}
        </fieldset>,
      )
    }

    case 'boolean':
      return wrap(
        <Toggle label={label} description={hint} checked={value === true} disabled={disabled} onChange={(checked) => set(checked)} />,
      )

    case 'select':
      return wrap(
        <Field label={label} hint={hint} error={errorText} required={required}>
          <SelectControl
            options={options.map((o) => ({ value: o.value, label: o.label }))}
            value={typeof value === 'string' ? value : null}
            onChange={set}
            placeholder={placeholder ?? t('form.chooseOne')}
            searchable={options.length > 8}
            disabled={disabled}
            invalid={Boolean(errorText)}
            name={field.key}
          />
        </Field>,
      )

    case 'district':
      return wrap(
        <Field label={label} hint={hint} error={errorText} required={required}>
          <DistrictSelect value={typeof value === 'string' ? value : null} onChange={set} lang={lang} disabled={disabled} invalid={Boolean(errorText)} placeholder={placeholder} />
        </Field>,
      )

    case 'file':
    case 'media':
      return wrap(
        <UploadField
          label={label}
          hint={hint}
          error={errorText}
          required={required}
          media={field.type === 'media'}
          value={value}
          onChange={set}
          disabled={disabled || preview}
        />,
      )

    default: {
      const inputType =
        field.type === 'email' ? 'email'
        : field.type === 'phone' ? 'tel'
        : field.type === 'number' ? 'number'
        : field.type === 'date' ? 'date'
        : field.type === 'url' ? 'url'
        : 'text'
      const inputMode = field.type === 'omang_id' ? 'numeric' : undefined
      const max = maxChars(field)
      return wrap(
        <Field label={label} hint={hint} error={errorText} required={required}>
          <InputControl
            type={inputType}
            inputMode={inputMode}
            autoComplete={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : undefined}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={max}
            value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
            onChange={(e) => set(e.target.value)}
          />
        </Field>,
      )
    }
  }
}

function LegendText({ label, required }: { label: string; required: boolean }) {
  return (
    <>
      {label}
      {required && <span aria-hidden className="text-primary"> *</span>}
    </>
  )
}

function DistrictSelect(props: {
  value: string | null
  onChange: (value: string) => void
  lang: Lang
  disabled: boolean
  invalid: boolean
  placeholder?: string
}) {
  const { t } = useI18n()
  const [items, setItems] = useState<ReferenceItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setFailed(false)
    referenceService
      .districts(props.lang)
      .then((list) => alive && setItems(list))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [props.lang])
  const options = useMemo(() => (items ?? []).map((d) => ({ value: d.slug, label: d.name })), [items])
  return (
    <SelectControl
      options={options}
      value={props.value}
      onChange={props.onChange}
      placeholder={failed ? t('common.somethingWrong') : props.placeholder ?? t('form.chooseOne')}
      searchable
      disabled={props.disabled || items === null}
      invalid={props.invalid}
    />
  )
}
