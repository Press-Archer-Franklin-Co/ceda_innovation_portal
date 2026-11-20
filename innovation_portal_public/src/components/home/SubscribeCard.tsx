import { FormEvent, useState } from 'react'
import { Bell, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { Toggle } from '../ui/Choice'
import { useI18n } from '../../i18n'
import { subscriptionsService, SubscriptionsNotAvailable } from '../../services/subscriptions.service'

// Figma 1.1 › Bulletin board › Subscribe card (10:634). Double opt-in by email (B6 part D).
// TODO(B6 part 2): until the subscriptions endpoint is on main, sending says sign-ups open soon.

type State = 'idle' | 'sending' | 'done' | 'not-yet' | 'error'

/** headingLevel: 3 inside a home section (h2 above it), 2 in a page rail next to other h2 cards. */
export default function SubscribeCard({ className, headingLevel = 3 }: { className?: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  const { t, lang } = useI18n()
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState(false)
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<State>('idle')
  const [emailError, setEmailError] = useState<string | undefined>()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError(t('sub.emailError'))
      return
    }
    setEmailError(undefined)
    setState('sending')
    try {
      await subscriptionsService.subscribe({ email: email.trim(), language: lang, ...(whatsapp && phone.trim() ? { phone: phone.trim() } : {}) })
      setState('done')
    } catch (err) {
      setState(err instanceof SubscriptionsNotAvailable ? 'not-yet' : 'error')
    }
  }

  return (
    <div className={clsx('flex flex-col gap-3.5 bg-surface border border-border rounded-card p-6', className)}>
      <span aria-hidden className="w-11 h-11 rounded-full bg-primary-soft text-primary flex items-center justify-center">
        <Bell size={20} />
      </span>
      {state === 'done' ? (
        <div role="status" className="flex flex-col gap-2">
          <H className="text-d-h4 font-heading text-text flex items-center gap-2">
            <CheckCircle2 size={20} aria-hidden className="text-success" />
            {t('sub.done')}
          </H>
          <p className="text-d-body-s text-muted">{t('sub.doneBody')}</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
          <H className="text-d-h4 font-heading text-text">{t('sub.title')}</H>
          <p className="text-d-body-s text-muted">{t('sub.body')}</p>
          <Input label={t('sub.email')} type="email" autoComplete="email" placeholder="you@example.co.bw" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} />
          <Toggle label={t('sub.whatsapp')} checked={whatsapp} onChange={setWhatsapp} />
          {whatsapp && <Input label={t('sub.phone')} type="tel" autoComplete="tel" placeholder="7x xxx xxx" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          <Button type="submit" block loading={state === 'sending'}>{t('sub.button')}</Button>
          {state === 'not-yet' && <p role="status" className="text-d-cap text-info">{t('sub.notYet')}</p>}
          {state === 'error' && <p role="alert" className="text-d-cap text-danger">{t('sub.error')}</p>}
          <p className="text-d-cap text-muted">{t('sub.unsub')}</p>
        </form>
      )}
    </div>
  )
}
