import { type FormEvent, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MessageCircleQuestion, UserRound } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import { useI18n } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { assistantService, type HelpAnswer, useAssistantStatus } from '../../services/assistant.service'

type State =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'answer'; answer: HelpAnswer }
  | { kind: 'handed_over' }
  | { kind: 'needs_contact' }
  | { kind: 'unavailable' }

/**
 * C3: "Ask how to do something". Answers come from the user manual that admins upload, with its
 * screenshots, and "Talk to a person" sends the question to the staff inbox. Renders nothing when
 * help is off, or for guests unless the admin allows them.
 */
export default function AskHelper({ className = '' }: { className?: string }) {
  const { t, lang } = useI18n()
  const { isAuthenticated } = useAuth()
  const status = useAssistantStatus()
  const { pathname } = useLocation()
  const [question, setQuestion] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [empty, setEmpty] = useState(false)

  if (!status?.features.help || (!isAuthenticated && !status.guests_can_ask)) return null

  async function ask(event: FormEvent) {
    event.preventDefault()
    if (!question.trim()) return setEmpty(true)
    setEmpty(false)
    setState({ kind: 'asking' })
    const result = await assistantService.askHelp({ question, lang, page_path: pathname })
    if (!result.available) return setState({ kind: 'unavailable' })
    // When the helper answered and also passed the question on, show both.
    setState(result.answer ? { kind: 'answer', answer: result } : { kind: 'handed_over' })
  }

  async function person() {
    if (!question.trim()) return setEmpty(true)
    setEmpty(false)
    const result = await assistantService.askHelp({ question, lang, page_path: pathname, handoff: true, contact_email: email, contact_phone: phone })
    if (result.available && result.needs_contact) return setState({ kind: 'needs_contact' })
    setState(result.available && result.handed_over ? { kind: 'handed_over' } : { kind: 'unavailable' })
  }

  const answer = state.kind === 'answer' ? state.answer : null

  return (
    <Card padding="md" className={`flex flex-col gap-4 ${className}`}>
      <div>
        <h2 className="flex items-center gap-2 font-heading text-d-h4 text-text">
          <MessageCircleQuestion size={20} aria-hidden className="text-accent" />
          {t('ai.help.title')}
        </h2>
        <p className="mt-1 text-d-body-s text-muted">{t('ai.help.body')}</p>
      </div>

      <form onSubmit={ask} className="flex flex-col gap-3">
        <Textarea
          label={t('ai.help.label')}
          error={empty ? t('ai.help.empty') : undefined}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('ai.help.placeholder')}
          rows={3}
          maxChars={1000}
        />
        {state.kind === 'needs_contact' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <p role="alert" className="sm:col-span-2 text-d-body-s text-text">{t('ai.help.needsContact')}</p>
            <Input label={t('ai.help.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label={t('ai.help.phone')} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {state.kind === 'needs_contact' ? (
            <Button type="button" onClick={person} disabled={!email && !phone}>{t('ai.help.send')}</Button>
          ) : (
            <>
              <Button type="submit" loading={state.kind === 'asking'}>{t('ai.help.ask')}</Button>
              <Button type="button" variant="ghost" icon={<UserRound size={16} aria-hidden />} onClick={person}>{t('ai.help.person')}</Button>
            </>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {state.kind === 'asking' && <p className="text-d-body-s text-muted">{t('ai.help.asking')}</p>}
        {state.kind === 'handed_over' && <p className="rounded-control bg-success-soft px-4 py-3 text-d-body-s text-text">{t('ai.help.handedOver')}</p>}
        {state.kind === 'unavailable' && <p className="text-d-body-s text-text">{t('ai.help.unavailable')}</p>}
        {answer && (
          <div className="flex flex-col gap-3 rounded-card bg-surface2 p-4">
            <p className="text-d-cap text-muted">{t('ai.help.suggestion')}</p>
            <p className="whitespace-pre-line text-d-body text-text">{answer.answer}</p>
            {answer.handed_over && <p className="rounded-control bg-success-soft px-4 py-3 text-d-body-s text-text">{t('ai.help.handedOver')}</p>}
            {(answer.screenshots ?? []).map((shot) => (
              <figure key={shot.id} className="flex flex-col gap-1">
                <img
                  src={shot.url}
                  alt={shot.caption}
                  width={shot.width ?? undefined}
                  height={shot.height ?? undefined}
                  loading="lazy"
                  className="h-auto w-full rounded-control border border-border"
                />
                {shot.caption && <figcaption className="text-d-cap text-muted">{shot.caption}</figcaption>}
              </figure>
            ))}
            {(answer.pages ?? []).filter((page) => page.portal_path.startsWith('/') && !page.portal_path.startsWith('/staff')).map((page) => (
              <Link key={page.id} to={page.portal_path} className="text-d-body-s font-semibold text-primary underline-offset-2 hover:underline">
                {t('ai.help.openPage')}: {page.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
