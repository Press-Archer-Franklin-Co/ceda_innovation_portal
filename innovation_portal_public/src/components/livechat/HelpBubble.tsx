import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MessageCircle, SendHorizontal, Star, X } from 'lucide-react'
import clsx from 'clsx'
import axios from 'axios'
import Modal from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { useShellSettings } from '../layout/shellData'
import { useI18n } from '../../i18n'
import { type ChatMessage, type HelpChatStatus, chatStore, helpChatService } from '../../services/helpChat.service'

// C1 help bubble and live chat (Figma 2.12: 133:565 website, 133:978 phone). ① Bottom right on every public and
// innovator page while live chat is on. ② An officer answers in the same window (the AI helper answers first once
// C3 is on). ③ Typing and Seen show live: the open chat checks every 3 seconds, a closed bubble every 15, both
// paused while the tab is hidden. ④ Out of hours the window shows the away message and offers WhatsApp or leaving a
// message. Phone: the chat opens full screen in the shared sheet; closing keeps the chat.

const OPEN_MS = 3000
const CLOSED_MS = 15000
const timeOf = (v: string) => new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'

function useIsPhone() {
  const query = '(max-width: 639px)'
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

/**
 * Need help guide (2.14): while the guide is on it is the one button, and "Talk to a person" opens this chat
 * window from there (fromGuide: no bubble of its own, opened and closed by the guide). With the guide off the
 * bubble works exactly as before. onStatus tells the guide whether live chat is on.
 */
export default function HelpBubble({ fromGuide = false, open: openProp, onOpenChange, onStatus }: {
  fromGuide?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onStatus?: (enabled: boolean) => void
} = {}) {
  const { t, lang } = useI18n()
  const { pathname } = useLocation()
  const [status, setStatus] = useState<HelpChatStatus | null>(null)
  const [openState, setOpenState] = useState(false)
  const open = fromGuide ? Boolean(openProp) : openState
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(open) : v
    if (fromGuide) onOpenChange?.(next)
    else setOpenState(next)
  }
  const phone = useIsPhone()
  const chat = useChat(open)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    helpChatService.status(lang).then((s) => alive && setStatus(s), () => alive && setStatus(null))
    return () => { alive = false }
  }, [lang])
  useEffect(() => { onStatus?.(Boolean(status?.enabled)) }, [status, onStatus])

  // Not on the staff hand-off pages or the sign-in flow, and never while live chat is off.
  if (!status?.enabled || pathname.startsWith('/sign-in')) return null

  const content = <ChatWindow status={status} chat={chat} />
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="help-chat"
        className={clsx(
          'fixed right-4 sm:right-8 bottom-[84px] lg:bottom-8 z-40 inline-flex items-center gap-2 rounded-full bg-primary pl-4 pr-3 h-12 text-white font-heading font-semibold text-d-btn shadow-pop',
          'transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          (fromGuide || (open && phone)) && 'hidden',
        )}
      >
        <MessageCircle size={20} aria-hidden />
        {t('chat.bubble')}
        {chat.unread > 0 ? (
          <span className="ml-0.5 min-w-[20px] h-5 rounded-full bg-amber text-banner-deep text-[12px] leading-5 text-center px-1" aria-label={t('chat.unread', { count: chat.unread })}>{chat.unread}</span>
        ) : <span className="w-1" />}
      </button>

      {phone ? (
        <Modal open={open} onClose={() => setOpen(false)} triggerRef={buttonRef} size="lg" bodyClassName="!p-0 flex flex-col" header={<ChatHeader status={status} chat={chat} />}>
          <div id="help-chat" className="flex flex-col min-h-[70vh]">{content}</div>
        </Modal>
      ) : (
        <section
          id="help-chat"
          aria-label={t('chat.title')}
          hidden={!open}
          className={clsx(
            'fixed right-8 bottom-24 z-40 w-[380px] h-[560px] max-h-[calc(100vh-140px)] flex flex-col rounded-card bg-surface shadow-pop border border-border overflow-hidden',
            'origin-bottom-right transition-[opacity,transform] duration-200',
            open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
          )}
        >
          <ChatHeader status={status} chat={chat} onClose={() => { setOpen(false); buttonRef.current?.focus() }} />
          {content}
        </section>
      )}
    </>
  )
}

/** The person's chat: resumes from storage, polls with ?after=, sends, types and rates. */
function useChat(open: boolean) {
  const { lang } = useI18n()
  const { isAuthenticated } = useAuth()
  const [seenAt, setSeenAt] = useState<string | null>(null)
  const [stored, setStored] = useState(() => chatStore.get())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setConvStatus] = useState<'waiting' | 'assigned' | 'closed' | null>(null)
  const [askRating, setAskRating] = useState(false)
  const [typing, setTyping] = useState<{ name: string } | null>(null)
  const [staffOnline, setStaffOnline] = useState(false)
  const [seenUpTo, setSeenUpTo] = useState<string | null>(null)
  const lastId = useRef<string | null>(null)

  const merge = (incoming: ChatMessage[], reset = false) =>
    setMessages((list) => {
      const map = new Map((reset ? [] : list).map((m) => [m.id, m]))
      for (const m of incoming) map.set(m.id, m)
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })

  const poll = useCallback(async () => {
    if (!stored) return
    try {
      const data = await helpChatService.get(stored.id, lastId.current, stored.token)
      merge(data.messages.results, lastId.current === null)
      if (data.messages.last_id) lastId.current = data.messages.last_id
      setTyping(data.messages.typing)
      if (data.messages.seen_at) setSeenAt(data.messages.seen_at)
      setConvStatus(data.conversation.status)
      setAskRating(Boolean(data.conversation.ask_rating))
      setStaffOnline(Boolean(data.staff_online))
    } catch (err) {
      // Gone (or someone else's after signing out): start afresh.
      if (axios.isAxiosError(err) && [403, 404].includes(err.response?.status ?? 0)) {
        chatStore.clear()
        setStored(null)
        setMessages([])
        lastId.current = null
      }
    }
  }, [stored])

  // Signed in on another device: pick up the open chat.
  useEffect(() => {
    if (stored || !isAuthenticated) return
    let alive = true
    helpChatService.mine().then((id) => { if (alive && id) { const next = { id }; chatStore.set(next); setStored(next) } }, () => {})
    return () => { alive = false }
  }, [stored, isAuthenticated])

  useEffect(() => {
    if (!stored) return
    poll()
    const timer = window.setInterval(() => { if (!document.hidden) poll() }, open ? OPEN_MS : CLOSED_MS)
    return () => window.clearInterval(timer)
  }, [stored, open, poll])

  // Unread: staff messages after the last one the person saw with the chat open.
  useEffect(() => {
    if (open && messages.length) setSeenUpTo(messages[messages.length - 1].created_at)
  }, [open, messages])
  const unread = open ? 0 : messages.filter((m) => m.author_role === 'staff' && (!seenUpTo || m.created_at > seenUpTo)).length

  async function send(text: string, guest?: { name: string; email: string }) {
    if (!stored) {
      const started = await helpChatService.start({ message: text, language: lang, ...(guest ?? {}) })
      const next = { id: started.conversation.id, token: started.token }
      chatStore.set(next)
      lastId.current = started.messages.last_id
      merge(started.messages.results, true)
      setConvStatus(started.conversation.status)
      setStored(next)
      return
    }
    const message = await helpChatService.send(stored.id, text, stored.token)
    merge([message])
  }

  const lastTyping = useRef(0)
  function typingNow() {
    if (!stored || Date.now() - lastTyping.current < 4000) return
    lastTyping.current = Date.now()
    helpChatService.typing(stored.id, stored.token).catch(() => {})
  }

  async function rate(n: number) {
    if (!stored) return
    await helpChatService.rate(stored.id, n, stored.token)
    setAskRating(false)
  }

  function startOver() {
    chatStore.clear()
    setStored(null)
    setMessages([])
    setConvStatus(null)
    lastId.current = null
  }

  return { started: Boolean(stored), messages, status, askRating, typing, staffOnline, unread, seenAt, send, typingNow, rate, startOver }
}

type Chat = ReturnType<typeof useChat>

function ChatHeader({ status, chat, onClose }: { status: HelpChatStatus; chat: Chat; onClose?: () => void }) {
  const { t } = useI18n()
  const officer = [...chat.messages].reverse().find((m) => m.author_role === 'staff')?.author
  const online = chat.started ? chat.staffOnline || status.staff_online : status.staff_online
  const open = status.open_now
  return (
    <div className="flex items-center gap-3 bg-banner text-on-banner px-4 py-3 shrink-0">
      <span aria-hidden className="w-9 h-9 rounded-full bg-banner-muted text-banner-deep flex items-center justify-center font-heading font-bold text-[12px]">
        {officer ? initials(officer.name) : 'CEDA'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading font-semibold text-d-label truncate">{officer ? officer.name : t('chat.team')}</p>
        <p className="flex items-center gap-1.5 text-d-cap text-banner-muted">
          <span aria-hidden className={clsx('w-2 h-2 rounded-full', open && online ? 'bg-success' : open ? 'bg-amber' : 'bg-banner-muted')} />
          {!open ? t('chat.away') : online ? t('chat.online') : t('chat.soon')}
        </p>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t('chat.close')} className="p-1.5 rounded-full hover:bg-on-banner/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-banner">
          <X size={20} aria-hidden />
        </button>
      )}
    </div>
  )
}

function ChatWindow({ status, chat }: { status: HelpChatStatus; chat: Chat }) {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()
  const { whatsapp_number } = useShellSettings()
  const { pathname } = useLocation()
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLLIElement>(null)
  const guest = !isAuthenticated
  const last = chat.messages[chat.messages.length - 1]?.id

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [last, chat.typing])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || busy) return
    if (!chat.started && guest && (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()))) {
      setError(t('chat.guestNeeded'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await chat.send(text.trim(), !chat.started && guest ? { name: name.trim(), email: email.trim() } : undefined)
      setText('')
    } catch (err) {
      const code = axios.isAxiosError(err) ? (err.response?.data as { errors?: { detail?: { code?: string } } })?.errors?.detail?.code : undefined
      setError(code === 'sign_in' ? t('chat.signInNeeded') : t('chat.sendError'))
    } finally {
      setBusy(false)
    }
  }

  const wa = whatsapp_number ? `https://wa.me/${whatsapp_number.replace(/[^\d]/g, '')}` : null
  const intro = introNotice(status.open_now ? status.welcome : status.away, chat.messages)
  const signInOnly = guest && !status.allow_guests && !chat.started
  const closed = chat.status === 'closed'

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
          {intro && <li className="text-center text-d-cap text-muted">{intro}</li>}
          {chat.messages.map((m) => <Bubble key={m.id} m={m} seen={Boolean(m.seen_by) || Boolean(chat.seenAt && m.created_at <= chat.seenAt)} />)}
          {chat.typing && (
            <li className="flex items-center gap-2 text-d-cap text-muted">
              <span aria-hidden className="inline-flex gap-1 rounded-full bg-surface2 px-2.5 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse [animation-delay:300ms]" />
              </span>
              {t('chat.typing', { name: chat.typing.name })}
            </li>
          )}
          {closed && chat.askRating && <Rate onRate={chat.rate} />}
          <li ref={endRef} aria-hidden />
        </ol>
      </div>

      {signInOnly ? (
        <div className="border-t border-border px-4 py-4 flex flex-col gap-2">
          <p className="text-d-body-s text-text">{t('chat.signInFirst')}</p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/sign-in?next=${encodeURIComponent(pathname)}`} className="rounded-control bg-primary text-white px-4 py-2 text-d-btn-s font-heading font-semibold">{t('chat.signIn')}</Link>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-control border border-border px-4 py-2 text-d-btn-s font-heading font-semibold text-text">{t('chat.whatsapp')}</a>}
          </div>
        </div>
      ) : closed ? (
        <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-2">
          <p className="text-d-body-s text-muted">{t('chat.closedNote')}</p>
          <button type="button" onClick={chat.startOver} className="text-d-label-s text-primary font-bold hover:underline">{t('chat.newChat')}</button>
        </div>
      ) : (
        <form onSubmit={submit} className="border-t border-border px-3 pt-2.5 pb-3 flex flex-col gap-2 shrink-0">
          {wa && (
            <div className="flex flex-wrap gap-1.5">
              <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-surface2 px-3 py-1 text-d-label-s text-text hover:bg-border">{t('chat.whatsapp')}</a>
            </div>
          )}
          {!chat.started && guest && (
            <div className="grid grid-cols-2 gap-2">
              <input aria-label={t('chat.name')} placeholder={t('chat.name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                className="h-10 rounded-control border border-border bg-surface px-3 text-d-body-s text-text focus:outline-none focus:ring-2 focus:ring-primary" />
              <input aria-label={t('chat.email')} placeholder={t('chat.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                className="h-10 rounded-control border border-border bg-surface px-3 text-d-body-s text-text focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              aria-label={status.open_now ? t('chat.write') : t('chat.leaveMessage')}
              placeholder={status.open_now ? t('chat.write') : t('chat.leaveMessage')}
              value={text}
              maxLength={2000}
              onChange={(e) => { setText(e.target.value); chat.typingNow() }}
              className="flex-1 h-11 rounded-control bg-surface2 px-3.5 text-d-body-s text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label={t('chat.send')}
              className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <SendHorizontal size={18} aria-hidden />
            </button>
          </div>
          {error && <p role="alert" className="text-d-cap text-danger">{error}</p>}
        </form>
      )}
    </>
  )
}

/** The welcome or away line at the top, unless the chat already has it as a system message (it showed twice). */
export function introNotice(text: string | null | undefined, messages: Pick<ChatMessage, 'author_role' | 'body'>[]): string {
  const intro = (text ?? '').trim()
  if (!intro) return ''
  return messages.some((m) => m.author_role === 'system' && (m.body ?? '').trim() === intro) ? '' : intro
}

function Bubble({ m, seen }: { m: ChatMessage; seen: boolean }) {
  const { t } = useI18n()
  if (m.author_role === 'system') return <li className="text-center text-d-cap text-muted">{m.body}</li>
  if (m.author_role === 'person') {
    return (
      <li className="ml-auto max-w-[82%] rounded-card bg-primary text-white px-3.5 py-2.5">
        <p className="text-d-body-s whitespace-pre-line break-words">{m.body}</p>
        <p className="mt-1 text-[11px] text-white/80">{[timeOf(m.created_at), seen ? t('chat.seen') : null].filter(Boolean).join(' · ')}</p>
      </li>
    )
  }
  const bot = m.author_role === 'bot'
  return (
    <li className="flex items-start gap-2 max-w-[86%]">
      <span aria-hidden className="w-7 h-7 shrink-0 rounded-full bg-surface2 text-text flex items-center justify-center text-[10px] font-bold">{bot ? 'AI' : initials(m.author?.name ?? '')}</span>
      <div className="rounded-card bg-surface2 px-3.5 py-2.5">
        <p className="text-d-body-s text-text whitespace-pre-line break-words">{m.body}</p>
        <p className="mt-1 text-[11px] text-muted">{[bot ? t('chat.aiHelper') : m.author?.name, timeOf(m.created_at)].filter(Boolean).join(' · ')}</p>
      </div>
    </li>
  )
}

function Rate({ onRate }: { onRate: (n: number) => Promise<void> }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  if (done) return <li className="text-center text-d-cap text-muted">{t('chat.thanksRating')}</li>
  return (
    <li className="rounded-card bg-surface2 px-3.5 py-3 text-center">
      <p className="text-d-label-s text-text">{t('chat.rate')}</p>
      <div className="mt-2 flex justify-center gap-1" role="group" aria-label={t('chat.rate')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={t('chat.stars', { count: n })} onClick={() => onRate(n).then(() => setDone(true), () => {})}
            className="p-1 text-amber hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
            <Star size={22} aria-hidden />
          </button>
        ))}
      </div>
    </li>
  )
}
