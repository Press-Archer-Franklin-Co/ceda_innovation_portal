import { useEffect, useRef, useState } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'

// C1 chat thread (Figma 3.30 ②): the person on the left, staff on the right, notes for the team in amber (never
// shown to the person), system lines in the middle. When the AI helper talked first, its part is folded above:
// "AI helper talked with Neo for 2 minutes. Show". Typing dots and "Seen" come from the poll.

const timeOf = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

export default function ChatThread({ messages, personName, typing, loading, seenAt }) {
  const t = useT()
  const [showBot, setShowBot] = useState(false)
  const endRef = useRef(null)
  const last = messages[messages.length - 1]?.id

  // Newest at the bottom: follow new messages.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [last, typing])

  // The AI part: everything up to the last bot message, when there is one.
  const lastBot = messages.map((m) => m.role).lastIndexOf('bot')
  const folded = lastBot >= 0 && !showBot ? messages.slice(0, lastBot + 1) : []
  const shown = folded.length ? messages.slice(lastBot + 1) : messages
  const minutes = folded.length > 1 ? Math.max(1, Math.round((new Date(folded[folded.length - 1].created_at) - new Date(folded[0].created_at)) / 60000)) : 1

  if (loading) return <div className="flex-1" aria-busy="true" />

  return (
    <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
      {folded.length > 0 && (
        <li>
          <button type="button" onClick={() => setShowBot(true)} className="flex w-full items-center gap-2 rounded-control bg-cms-soft px-3 py-2 text-left text-[12px] text-text hover:bg-cms-soft/80">
            <Sparkles size={14} aria-hidden className="text-cms" />
            {t('inbox.aiFolded', { name: personName || t('inbox.thePerson'), n: minutes })} <span className="font-bold text-cms">{t('inbox.show')}</span>
          </button>
        </li>
      )}
      {shown.map((m) => <Bubble key={m.id} m={m} personName={personName} seen={Boolean(m.seen_by) || Boolean(seenAt && m.created_at <= seenAt)} />)}
      {typing && (
        <li className="flex items-center gap-2 text-[12px] text-muted">
          <Avatar name={typing.name || personName || '?'} size="xs" decorative />
          <span aria-hidden className="inline-flex gap-1 rounded-full bg-surface2 px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
          </span>
          {t('inbox.typing', { name: typing.name || personName || t('inbox.thePerson') })}
        </li>
      )}
      <li ref={endRef} aria-hidden />
    </ol>
  )
}

function Bubble({ m, personName, seen }) {
  const t = useT()
  if (m.role === 'system') {
    return <li className="text-center text-[12px] text-muted">{m.body}</li>
  }
  if (m.internal) {
    return (
      <li className="ml-auto max-w-[80%] rounded-card border border-warning/30 bg-warning-soft px-3.5 py-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-warning"><Lock size={12} aria-hidden />{t('inbox.noteLabel')}</p>
        <p className="whitespace-pre-line break-words text-[14px] text-text">{m.body}</p>
        <p className="mt-1 text-[11px] text-muted">{[m.author?.name, timeOf(m.created_at)].filter(Boolean).join(' · ')}</p>
      </li>
    )
  }
  if (m.role === 'staff') {
    return (
      <li className="ml-auto max-w-[80%] rounded-card bg-primary px-3.5 py-2.5 text-white">
        <p className="whitespace-pre-line break-words text-[14px]">{m.body}</p>
        <Attachments m={m} light />
        <p className="mt-1 text-[11px] text-white/80">
          {[m.author?.name || t('inbox.you'), timeOf(m.created_at), seen ? t('inbox.seen') : null, m.delivery === 'failed' ? t('inbox.notDelivered') : null].filter(Boolean).join(' · ')}
        </p>
      </li>
    )
  }
  const bot = m.role === 'bot'
  return (
    <li className="flex max-w-[80%] items-start gap-2">
      <span aria-hidden className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', bot ? 'bg-cms-soft text-cms' : 'bg-surface2 text-text')}>
        {bot ? 'AI' : initials(m.author?.name || personName)}
      </span>
      <div className="rounded-card bg-surface2 px-3.5 py-2.5">
        <p className="whitespace-pre-line break-words text-[14px] text-text">{m.body}</p>
        <Attachments m={m} />
        <p className="mt-1 text-[11px] text-muted">{[bot ? t('inbox.aiHelper') : null, timeOf(m.created_at)].filter(Boolean).join(' · ')}</p>
      </div>
    </li>
  )
}

function Attachments({ m, light }) {
  const t = useT()
  if (!m.attachments?.length) return null
  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {m.attachments.map((a) => (
        <li key={a.id ?? a.url}>
          <a href={a.url} target="_blank" rel="noreferrer" className={cn('text-[13px] underline', light ? 'text-white' : 'text-primary')}>{a.name || a.filename || t('inbox.file')}</a>
        </li>
      ))}
    </ul>
  )
}
