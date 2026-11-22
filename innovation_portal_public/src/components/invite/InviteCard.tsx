import { ReactNode, useRef, useState } from 'react'
import { LucideIcon, ShieldCheck } from 'lucide-react'
import PageBanner from '../layout/PageBanner'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Textarea from '../ui/Textarea'
import { useI18n } from '../../i18n'

// Figma 1.15 Judge invitation (138:3382 website, 138:3716 phone), also used for the specialist invitation.
// ① What it is and who invited them. ② What the work involves and by when. ③ The conflict of interest note.
// ④ Accept continues to the one sign-in page (2.0); Decline asks for an optional reason.

export interface InviteRow {
  icon: LucideIcon
  text: string
}

export function InvitePage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <>
      <PageBanner id="invite-title" overline={t('invite.over')} title={title} subtitle={subtitle} />
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 lg:py-12 flex justify-center">
        <section aria-labelledby="invite-title" className="w-full max-w-[640px] rounded-[16px] border border-border bg-bg p-5 lg:p-7 shadow-[0_10px_15px_rgb(46_26_15/0.06)] flex flex-col gap-4">
          {children}
        </section>
      </div>
    </>
  )
}

export function InvitedBy({ name, role, invitedOn }: { name: string; role?: string; invitedOn?: string }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} size="md" decorative className="!bg-banner-muted !text-banner" />
      <div className="min-w-0 flex flex-col">
        <p className="text-d-label text-text">{role ? t('invite.invitedBy', { name, role }) : name}</p>
        {invitedOn && <p className="text-d-cap text-muted">{t('invite.invitedOn', { date: invitedOn })}</p>}
      </div>
    </div>
  )
}

export function InviteRows({ rows, note }: { rows: InviteRow[]; note?: string }) {
  const { t } = useI18n()
  return (
    <>
      <h2 className="text-d-h5 font-heading text-text">{t('invite.whatYouDo')}</h2>
      <ul className="flex flex-col gap-4">
        {rows.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-d-body-s text-text">
            <Icon size={16} aria-hidden className="shrink-0 text-accent" />
            {text}
          </li>
        ))}
      </ul>
      {note && (
        <p className="flex items-start gap-2.5 rounded-[10px] bg-warning-soft p-[14px] text-d-cap text-text">
          <ShieldCheck size={16} aria-hidden className="shrink-0 text-accent" />
          {note}
        </p>
      )}
    </>
  )
}

/** Decline (ghost) and Accept (primary), right-aligned. Decline opens a short form for an optional reason. */
export function InviteActions({
  acceptLabel,
  accepting,
  onAccept,
  onDecline,
}: {
  acceptLabel: string
  accepting: boolean
  onAccept: () => void
  /** Leave out while the API cannot record a decline (R-50). Resolves when sent; throws to show an error. */
  onDecline?: (reason: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const declineRef = useRef<HTMLButtonElement>(null)

  async function send() {
    if (!onDecline) return
    setSending(true)
    setError('')
    try {
      await onDecline(reason.trim())
      setOpen(false)
    } catch {
      setError(t('invite.declineError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2.5">
      {onDecline && (
        <Button ref={declineRef} variant="ghost" onClick={() => setOpen(true)} disabled={accepting}>
          {t('invite.decline')}
        </Button>
      )}
      <Button onClick={onAccept} loading={accepting}>
        {accepting ? t('invite.accepting') : acceptLabel}
      </Button>
      {onDecline && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={t('invite.declineTitle')}
          size="sm"
          triggerRef={declineRef}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={send} loading={sending}>{t('invite.decline')}</Button>
            </>
          }
        >
          <Textarea label={t('invite.declineReason')} hint={t('invite.declineHint')} optional value={reason} maxChars={500} onChange={(e) => setReason(e.target.value)} error={error || undefined} />
        </Modal>
      )}
    </div>
  )
}
