import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, Upload } from 'lucide-react'
import clsx from 'clsx'
import Button, { buttonClasses } from '../../ui/Button'
import Tag from '../../ui/Tag'
import type { Answers } from '../form/logic'
import { useI18n, type StringKey } from '../../../i18n'
import { documentsService } from '../../../services/documents.service'
import { changesLink } from '../links'
import { formatShortDate } from '../format'
import type { ReturnedForChanges, ReturnItem } from '../../../types/innovator'

// Figma 2.4b (157:922 website, 157:1287 phone). ① Why it came back and the date to fix it by. ② Exactly what to
// change: each item opens its question on the changes page. ③ "Respond to changes" opens the form as it was sent
// (/my-ideas/:id/changes) with the notes pinned and only those parts unlocked; "Send changes" moves the idea back
// to the same stage and tells the officer.

/** The answers that really changed: only these are sent. */
export function changedAnswers(before: Record<string, unknown>, now: Answers): Answers {
  const out: Answers = {}
  for (const [key, value] of Object.entries(now)) {
    if (JSON.stringify(value ?? null) !== JSON.stringify(before[key] ?? null)) out[key] = value
  }
  return out
}

export default function ReturnedCard({ ideaId, returned }: { ideaId: string; returned: ReturnedForChanges }) {
  const { t, lang } = useI18n()
  const first = returned.requested_by.split(' ')[0]
  const to = changesLink(ideaId)

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
      <ReturnChecklist returned={returned} hrefFor={(item) => `${to}#${itemAnchor(item)}`} />
      <div className="mt-4 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
        <a href="#messages" className="text-center text-d-label text-primary hover:underline">{first ? t('trk.askOfficer', { name: first }) : t('trk.askTeam')}</a>
        {/* Opens the form in "Respond to changes" mode: notes pinned, flagged questions highlighted. */}
        <Link to={to} className={buttonClasses({})}>{t('chg.respond')}</Link>
      </div>
    </section>
  )
}

/** Where a checklist item points on the changes page. */
export const itemAnchor = (item: ReturnItem) => (item.kind === 'answer' ? `field-${item.field_key}` : `doc-${item.id}`)

/** The officer's list of things to change, ticked as each is done. */
export function ReturnChecklist({ returned, hrefFor }: { returned: ReturnedForChanges; hrefFor: (item: ReturnItem) => string }) {
  const { t } = useI18n()
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {returned.items.map((item) => (
        <li key={item.id}>
          {(() => {
            const href = hrefFor(item)
            const cls = 'flex w-full items-center gap-3 rounded-control bg-surface px-3 py-2.5 text-left hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
            const body = (
              <>
                <span aria-hidden className={clsx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border', item.done ? 'border-success bg-success text-white' : 'border-border bg-surface')}>
                  {item.done && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 text-d-body-s text-text">{item.label}{item.done && <span className="sr-only"> ({t('trk.itemDone')})</span>}</span>
                <Tag tone="neutral">{t(`trk.kind.${item.kind}` as StringKey)}</Tag>
              </>
            )
            // On the changes page an item scrolls to its question; elsewhere it opens that page at the question.
            return href.startsWith('#') ? (
              <button type="button" className={cls} onClick={() => document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{body}</button>
            ) : (
              <Link to={href} className={cls}>{body}</Link>
            )
          })()}
        </li>
      ))}
    </ul>
  )
}

export function DocumentItem({ ideaId, item, autoFocus, onChanged }: { ideaId: string; item: ReturnItem; autoFocus: boolean; onChanged: () => Promise<void> | void }) {
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
    <div id={`doc-${item.id}`} className="flex flex-col gap-2 scroll-mt-40">
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
