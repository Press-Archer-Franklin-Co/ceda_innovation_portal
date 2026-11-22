import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Send } from 'lucide-react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Textarea from '../../components/ui/Textarea'
import StatusPill from '../../components/ui/StatusPill'
import Avatar from '../../components/ui/Avatar'
import DropdownMenu from '../../components/ui/DropdownMenu'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toast'
import ChatThread from '../../components/chat/ChatThread'
import { useT, useI18n } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { cn } from '../../lib/cn'
import { ideaChatApi, inboxApi, mergeMessages } from '../../lib/api/inbox'
import { staffSummary } from '../../lib/api/ideas'

// 3.30 ② ③ ④: one open chat. A conversation (web, WhatsApp, USSD, AI hand-over) or an idea's messages. New
// messages come in every 3 seconds with ?after=, paused while the tab is hidden. Replies go back on the channel the
// person used. Internal notes never reach the person.

const POLL_MS = 3000
const timeOf = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')

/** Messages, typing and the latest conversation, polled with ?after=. */
function useLiveChat(type, id) {
  const [messages, setMessages] = useState([])
  const [conversation, setConversation] = useState(null)
  const [typing, setTyping] = useState(null)
  const [seenAt, setSeenAt] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const lastId = useRef(null)

  const fetchOnce = useCallback(async () => {
    const after = lastId.current
    const data = type === 'idea' ? await ideaChatApi.messages(id, after) : await inboxApi.conversation(id, after)
    const block = type === 'idea' ? data : data.messages
    if (type !== 'idea') setConversation(data.conversation)
    setMessages((list) => mergeMessages(after ? list : [], block?.results ?? []))
    if (block?.last_id) lastId.current = block.last_id
    setTyping(block?.typing || null)
    if (block?.seen_at) setSeenAt(block.seen_at)
  }, [type, id])

  useEffect(() => {
    let alive = true
    lastId.current = null
    setState('loading')
    fetchOnce().then(() => alive && setState('ready'), (err) => { if (alive) { setError(err); setState('error') } })
    const timer = setInterval(() => {
      if (!document.hidden && alive) fetchOnce().catch(() => {})
    }, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [fetchOnce])

  return { messages, conversation, typing, seenAt, state, error, refresh: fetchOnce, setConversation }
}

export default function ChatPanel({ type, id, row, onChanged }) {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const { user } = useAuth()
  const chat = useLiveChat(type, id)
  const idea = useQuery({ queryKey: ['ideas', id, 'summary', lang], queryFn: () => staffSummary(id, lang), enabled: type === 'idea' })
  const replies = useQuery({ queryKey: ['inbox', 'saved-replies', lang], queryFn: () => inboxApi.savedReplies(lang), staleTime: 300_000 })
  const [dialog, setDialog] = useState(null)
  const closeRef = useRef(null)
  const assignRef = useRef(null)

  const c = chat.conversation
  const isIdea = type === 'idea'
  const name = (isIdea ? idea.data?.innovator?.name : c?.who?.name || c?.person?.name) || row?.who?.name || c?.who?.phone || t('inbox.someone')
  const channel = isIdea ? 'idea' : c?.channel ?? row?.channel
  const closed = c?.status === 'closed'
  const mine = c?.assignee?.id && String(c.assignee.id) === String(user?.id)

  async function act(action, body, done) {
    try {
      const result = await inboxApi.act(id, action, body)
      if (action !== 'reply' && action !== 'note' && result?.id) chat.setConversation((prev) => ({ ...prev, ...result }))
      await chat.refresh()
      onChanged?.()
      if (done) toast.show({ tone: 'success', title: done })
      return true
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.data?.errors?.reason?.[0] ?? err?.data?.errors?.detail ?? err?.message })
      return false
    }
  }

  if (chat.state === 'error') {
    return <ErrorState title={t('inbox.chatError')} message={chat.error?.status === 404 ? t('inbox.chatGone') : chat.error?.message} onRetry={() => window.location.reload()} />
  }

  const started = isIdea ? null : c?.started_at
  const subtitle = [
    t(`inbox.channel.${channel}`),
    started ? t('inbox.startedAt', { time: timeOf(started) }) : null,
    c?.handed_over_by === 'ai' ? t('inbox.handedOverByAi') : null,
    isIdea ? idea.data?.title : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-labelledby="chat-title" className="flex min-h-[520px] min-w-0 flex-col rounded-card border border-border bg-surface lg:h-[calc(100vh-220px)]">
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Avatar name={name} size="md" decorative />
          <div className="min-w-0 flex-1">
            <h2 id="chat-title" className="truncate font-heading text-[16px] font-bold text-text">{name}</h2>
            <p className="truncate text-[12px] text-muted">{subtitle}</p>
          </div>
          {isIdea ? (
            <Link to={`/submissions/${id}?tab=messages`} className="inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline">{t('inbox.openIdea')}<ExternalLink size={14} aria-hidden /></Link>
          ) : c && (
            <div className="flex items-center gap-2">
              {!closed && !mine && <Button variant="secondary" size="sm" onClick={() => act('take', null, t('inbox.taken'))}>{t('inbox.take')}</Button>}
              {closed
                ? <Button variant="secondary" size="sm" onClick={() => act('reopen', null, t('inbox.reopened'))}>{t('inbox.reopen')}</Button>
                : <Button ref={closeRef} variant="secondary" size="sm" onClick={() => setDialog('close')}>{t('inbox.resolve')}</Button>}
              <DropdownMenu
                label={t('inbox.more')}
                items={[
                  { key: 'task', label: t('inbox.makeTask'), onSelect: () => act('convert', { into: 'task' }, t('inbox.madeTask')) },
                  { key: 'support', label: t('inbox.makeSupport'), onSelect: () => act('convert', { into: 'support_request' }, t('inbox.madeSupport')) },
                ]}
              />
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {chat.state === 'loading' ? (
            <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-12 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /><Skeleton className="h-12 w-3/5" /></div>
          ) : chat.messages.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">{t('inbox.noMessages')}</p>
          ) : (
            <ChatThread messages={chat.messages} personName={name} typing={chat.typing} seenAt={chat.seenAt} />
          )}
        </div>

        <Composer
          key={`${type}:${id}`}
          name={name}
          channel={channel}
          disabled={closed}
          isIdea={isIdea}
          savedReplies={replies.data ?? []}
          onTyping={() => (isIdea ? ideaChatApi.typing(id) : inboxApi.act(id, 'typing')).catch(() => {})}
          onSend={async (body, note) => {
            if (isIdea) {
              try { await ideaChatApi.send(id, { body }); await chat.refresh(); onChanged?.(); return true } catch (err) { toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.data?.errors?.body?.[0] ?? err?.message }); return false }
            }
            return act(note ? 'note' : 'reply', { body })
          }}
        />
      </section>

      <SidePanel isIdea={isIdea} idea={idea} c={c} name={name} mine={mine} assignRef={assignRef} onAssign={() => setDialog('assign')}
        onNote={async (note) => {
          try { const updated = await inboxApi.saveTeamNote(id, note); chat.setConversation((prev) => ({ ...prev, ...updated })); toast.show({ tone: 'success', title: t('inbox.noteSaved') }) } catch (err) { toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message }) }
        }} />

      <CloseDialog open={dialog === 'close'} onClose={() => setDialog(null)} triggerRef={closeRef} name={name}
        onConfirm={(reason) => act('close', { reason }, t('inbox.resolved'))} />
      <AssignDialog open={dialog === 'assign'} onClose={() => setDialog(null)} triggerRef={assignRef}
        onPick={(userId) => act('assign', { user_id: userId }, t('inbox.assigned'))} />
    </div>
  )
}

function Composer({ name, channel, disabled, isIdea, savedReplies, onTyping, onSend }) {
  const t = useT()
  const [text, setText] = useState('')
  const [note, setNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const lastTyping = useRef(0)

  async function send(e) {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await onSend(text.trim(), note)
    setBusy(false)
    if (ok) setText('')
  }

  if (disabled) return <p className="border-t border-border px-4 py-3 text-[13px] text-muted">{t('inbox.closedNote')}</p>

  return (
    <form onSubmit={send} className="flex flex-col gap-2 border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {!isIdea && (
          <div role="group" aria-label={t('inbox.writeAs')} className="mr-1 inline-flex rounded-full bg-surface2 p-0.5">
            {[false, true].map((n) => (
              <button key={String(n)} type="button" aria-pressed={note === n} onClick={() => setNote(n)}
                className={cn('h-6 rounded-full px-2.5 text-[12px] font-bold', note === n ? (n ? 'bg-warning-soft text-warning' : 'bg-surface text-text shadow-sm') : 'text-muted')}>
                {n ? t('inbox.noteTab') : t('inbox.replyTab')}
              </button>
            ))}
          </div>
        )}
        {savedReplies.length > 0 && !note && (
          <>
            <span className="rounded-full bg-banner px-2.5 py-1 text-[11px] font-bold text-on-banner">{t('inbox.savedReplies')}</span>
            {savedReplies.slice(0, 4).map((r) => (
              <button key={r.id || r.title} type="button" onClick={() => setText((v) => (v ? `${v} ${r.body}` : r.body))}
                className="max-w-[180px] truncate rounded-full bg-surface2 px-2.5 py-1 text-[12px] font-bold text-text hover:bg-border/60">
                {r.title}
              </button>
            ))}
          </>
        )}
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
        <Textarea
          aria-label={note ? t('inbox.noteTab') : t('inbox.replyTo', { name, channel: t(`inbox.channel.${channel}`) })}
          placeholder={note ? t('inbox.notePlaceholder') : t('inbox.replyTo', { name, channel: t(`inbox.channel.${channel}`) })}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (!note && Date.now() - lastTyping.current > 4000) { lastTyping.current = Date.now(); onTyping() }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e) }}
        />
        </div>
        <Button type="submit" loading={busy} disabled={!text.trim()}>
          {note ? t('inbox.saveNote') : <><Send size={16} aria-hidden />{t('inbox.send')}</>}
        </Button>
      </div>
    </form>
  )
}

function SidePanel({ isIdea, idea, c, name, mine, assignRef, onAssign, onNote }) {
  const t = useT()
  const person = isIdea ? idea.data?.innovator : c?.person
  const ideas = isIdea ? (idea.data ? [{ id: idea.data.id, title: idea.data.title, status: idea.data.status }] : []) : person?.ideas ?? []
  const facts = [person?.phone ?? c?.who?.phone, person?.district, person?.language ? t(`inbox.lang.${person.language}`) : null].filter(Boolean).join(' · ')
  const [note, setNote] = useState(c?.team_note ?? '')
  useEffect(() => { setNote(c?.team_note ?? '') }, [c?.team_note])

  return (
    <aside aria-label={t('inbox.aboutPerson')} className="flex flex-col gap-[14px]">
      <section className="rounded-card border border-border bg-surface p-4">
        <h3 className="font-heading text-[15px] font-bold text-text">{name}</h3>
        {facts && <p className="mt-1 text-[12px] text-muted">{facts}</p>}
        {person?.email && <p className="text-[12px] text-muted">{person.email}</p>}
        <p className="mt-3 text-[12px] font-bold text-text">{t('inbox.ideas')}</p>
        {ideas.length ? (
          <ul className="mt-1 flex flex-col gap-1.5">
            {ideas.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <Link to={`/submissions/${i.id}`} className="min-w-0 truncate text-[13px] text-primary hover:underline">{i.title}</Link>
                {i.status && <StatusPill status={i.status} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-muted">{t('inbox.noIdeas')}</p>
        )}
      </section>

      {!isIdea && c && (
        <>
          <section className="rounded-card border border-border bg-surface p-4">
            <h3 className="font-heading text-[15px] font-bold text-text">{t('inbox.assignedTo')}</h3>
            <div className="mt-2 flex items-center justify-between gap-2">
              {c.assignee ? (
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-text">
                  <Avatar name={c.assignee.name} size="xs" decorative />
                  <span className="truncate">{mine ? t('inbox.youName', { name: c.assignee.name }) : c.assignee.name}</span>
                </span>
              ) : (
                <span className="text-[13px] text-muted">{t('inbox.nobody')}</span>
              )}
              <button ref={assignRef} type="button" onClick={onAssign} className="shrink-0 text-[13px] font-bold text-primary hover:underline">{t('inbox.change')}</button>
            </div>
          </section>
          <section className="rounded-card border border-border bg-surface p-4">
            <h3 className="font-heading text-[15px] font-bold text-text">{t('inbox.teamNote')}</h3>
            <Textarea aria-label={t('inbox.teamNote')} hint={t('inbox.teamNoteHint')} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-2" />
            {note !== (c.team_note ?? '') && <Button size="sm" variant="secondary" className="mt-2" onClick={() => onNote(note)}>{t('inbox.saveNote')}</Button>}
          </section>
        </>
      )}
    </aside>
  )
}

function CloseDialog({ open, onClose, triggerRef, name, onConfirm }) {
  const t = useT()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])
  async function confirm() {
    if (!reason.trim()) { setError(t('inbox.reasonNeeded')); return }
    setBusy(true)
    const ok = await onConfirm(reason.trim())
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} size="sm" title={t('inbox.resolveTitle', { name })} description={t('inbox.resolveHint')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={confirm} loading={busy}>{t('inbox.resolve')}</Button></>}>
      <Textarea label={t('inbox.reason')} required rows={2} maxChars={300} value={reason} error={error || undefined} onChange={(e) => { setReason(e.target.value); setError('') }} />
    </Modal>
  )
}

function AssignDialog({ open, onClose, triggerRef, onPick }) {
  const t = useT()
  const people = useQuery({ queryKey: ['inbox', 'people'], queryFn: inboxApi.people, enabled: open })
  const list = Array.isArray(people.data) ? people.data : []
  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} size="sm" title={t('inbox.assignTitle')}>
      {people.isLoading ? <Skeleton className="h-24 w-full" /> : list.length === 0 ? <p className="text-[13px] text-muted">{t('inbox.noPeople')}</p> : (
        <ul className="flex flex-col divide-y divide-border">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={async () => { if (await onPick(p.id)) onClose() }} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface2">
                <Avatar name={p.name} size="sm" decorative />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-text">{p.name}{p.backup ? ` (${t('inbox.backup')})` : ''}</span>
                  <span className="block text-[12px] text-muted">{t('inbox.chatsOf', { open: p.open ?? 0, max: p.max_open ?? 5 })}{p.online ? ` · ${t('inbox.online')}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
