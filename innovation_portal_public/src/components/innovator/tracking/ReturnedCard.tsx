import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, Upload } from 'lucide-react'
import clsx from 'clsx'
import Button from '../../ui/Button'
import Modal from '../../ui/Modal'
import Tag from '../../ui/Tag'
import FormRenderer from '../form/FormRenderer'
import { checkStep, type Answers, type FieldProblem } from '../form/logic'
import { useI18n, type StringKey } from '../../../i18n'
import { documentsService } from '../../../services/documents.service'
import { innovatorService } from '../../../services/innovator.service'
import { formatDate, formatShortDate } from '../format'
import type { FormStep, IdeaTracking, ReturnedForChanges, ReturnItem } from '../../../types/innovator'

// Figma 2.4b (157:922 website, 157:1287 phone). ① Why it came back and the date to fix it by. ② Exactly what to
// change: each item opens its field or asks for a file. ③ Fix and resend opens the form with only those parts
// unlocked; resending moves the idea back to the same stage and tells the officer.

/** The answers that really changed: only these are sent. */
export function changedAnswers(before: Record<string, unknown>, now: Answers): Answers {
  const out: Answers = {}
  for (const [key, value] of Object.entries(now)) {
    if (JSON.stringify(value ?? null) !== JSON.stringify(before[key] ?? null)) out[key] = value
  }
  return out
}

export default function ReturnedCard({ ideaId, returned, onChanged, onResent }: { ideaId: string; returned: ReturnedForChanges; onChanged: () => Promise<void> | void; onResent: (next: IdeaTracking) => void }) {
  const { t, lang } = useI18n()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [focusItem, setFocusItem] = useState<string | null>(null)
  const first = returned.requested_by.split(' ')[0]

  const show = (itemId: string | null) => {
    setFocusItem(itemId)
    setOpen(true)
  }

  return (
    <section aria-labelledby="returned-title" data-guide="track.returned" className="rounded-card border border-amber bg-warning-soft p-5 lg:p-6">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} aria-hidden className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0">
          <h2 id="returned-title" className="font-heading text-d-h5 text-text">
            {returned.fix_by ? t('trk.returnedBy', { date: formatShortDate(returned.fix_by, lang) }) : t('trk.returnedTitle')}
          </h2>
          <p className="text-d-cap text-muted">{t('trk.from', { name: returned.requested_by, date: formatShortDate(returned.requested_at, lang) })}</p>
        </div>
      </div>
      <p className="mt-3 text-d-body-s text-text whitespace-pre-line break-words">{returned.reason}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {returned.items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => show(item.id)} className="flex w-full items-center gap-3 rounded-control bg-surface px-3 py-2.5 text-left hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span aria-hidden className={clsx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border', item.done ? 'border-success bg-success text-white' : 'border-border bg-surface')}>
                {item.done && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 text-d-body-s text-text">{item.label}{item.done && <span className="sr-only"> ({t('trk.itemDone')})</span>}</span>
              <Tag tone="neutral">{t(`trk.kind.${item.kind}` as StringKey)}</Tag>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
        <a href="#messages" className="text-center text-d-label text-primary hover:underline">{first ? t('trk.askOfficer', { name: first }) : t('trk.askTeam')}</a>
        <Button ref={trigger} onClick={() => show(null)}>{t('trk.fixResend')}</Button>
      </div>
      {open && (
        <FixDialog ideaId={ideaId} returned={returned} focusItem={focusItem} triggerRef={trigger} onClose={() => setOpen(false)} onChanged={onChanged} onResent={(next) => { setOpen(false); onResent(next) }} />
      )}
    </section>
  )
}

function FixDialog({ ideaId, returned, focusItem, triggerRef, onClose, onChanged, onResent }: {
  ideaId: string
  returned: ReturnedForChanges
  focusItem: string | null
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onChanged: () => Promise<void> | void
  onResent: (next: IdeaTracking) => void
}) {
  const { t, lang } = useI18n()
  const [answers, setAnswers] = useState<Answers>(() => ({ ...returned.answers }))
  const [errors, setErrors] = useState<Record<string, FieldProblem | string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const step = useMemo<FormStep>(() => ({
    id: 'fix', code: 'fix', title: '', description: '', tips: [], is_active: true,
    rows: returned.fields.map((field, index) => ({ row: index + 1, fields: [{ ...field, width: 'full' as const }] })),
  }), [returned.fields])
  const documents = returned.items.filter((item) => item.kind === 'document')

  // An item in the checklist links to its own field.
  useEffect(() => {
    const item = returned.items.find((i) => i.id === focusItem)
    if (!item || item.kind !== 'answer') return
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-guide="idea.field.${CSS.escape(item.field_key)}"] :is(input, textarea, button)`)?.focus()
    }, 260)
    return () => window.clearTimeout(timer)
  }, [focusItem, returned.items])

  async function send() {
    const problems = checkStep(step, answers)
    if (Object.keys(problems).length) {
      setErrors(problems)
      return
    }
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      onResent(await innovatorService.resend(ideaId, changedAnswers(returned.answers, answers), lang))
    } catch (error) {
      const data = (error as { response?: { data?: { errors?: Record<string, unknown> } & Record<string, unknown> } }).response?.data
      const body = (data?.errors ?? data ?? {}) as Record<string, unknown>
      const fieldErrors: Record<string, string> = {}
      for (const [key, value] of Object.entries(body)) {
        if (key.startsWith('answers.')) fieldErrors[key.slice(8)] = Array.isArray(value) ? value.join(' ') : String(value)
      }
      setErrors(fieldErrors)
      const items = Array.isArray(body.items) ? (body.items as string[]) : []
      setMessage(items.length ? t('trk.notDone', { items: items.join(', ') }) : Object.keys(fieldErrors).length ? '' : t('trk.resendError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      triggerRef={triggerRef}
      size="lg"
      closeOnBackdrop={false}
      title={t('trk.fixTitle')}
      description={[returned.fix_by ? formatDate(returned.fix_by, lang) : '', t('trk.fixBody')].filter(Boolean).join(' · ')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={send}>{t('trk.resend')}</Button></>}
    >
      <div className="flex flex-col gap-6">
        {returned.fields.length > 0 && <FormRenderer step={step} answers={answers} onChange={(key, value) => setAnswers((a) => ({ ...a, [key]: value }))} lang={lang} errors={errors} />}
        {documents.map((item) => <DocumentItem key={item.id} ideaId={ideaId} item={item} autoFocus={focusItem === item.id} onChanged={onChanged} />)}
        {message && <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-d-body-s text-danger">{message}</p>}
      </div>
    </Modal>
  )
}

function DocumentItem({ ideaId, item, autoFocus, onChanged }: { ideaId: string; item: ReturnItem; autoFocus: boolean; onChanged: () => Promise<void> | void }) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await documentsService.uploadIdeaDocument(ideaId, file, { fieldKey: item.field_key })
      setName(file.name)
      await onChanged()
    } catch {
      setError(t('trk.uploadError'))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const done = item.done || Boolean(name)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-d-label text-text">{item.label}</p>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" loading={busy} autoFocus={autoFocus} onClick={() => input.current?.click()}>
          <Upload size={15} aria-hidden />{done ? t('trk.replaceFile') : t('trk.chooseFile')}
        </Button>
        {done && <span className="inline-flex items-center gap-1 text-d-cap text-success"><Check size={14} aria-hidden />{name || t('trk.itemDone')}</span>}
      </div>
      {error && <p role="alert" className="text-d-cap text-danger">{error}</p>}
    </div>
  )
}
