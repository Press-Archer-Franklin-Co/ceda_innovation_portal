import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Clock, FileText, ImagePlus, Mic, Paperclip, Square, X } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { ideaMessagesService } from '../../services/ideaMessages.service'
import { mediaService } from '../../services/media.service'
import type { IdeaMessage, MediaAsset, MessageAttachment } from '../../types/innovator'
import { formatDateTime, formatShortDate } from './format'

/**
 * 2.4 messages with the officer (B3). If the thread cannot be loaded (for
 * example the messages switch is off), the section says so plainly instead
 * of showing an empty conversation.
 */
export default function MessageThread({ ideaId }: { ideaId: string }) {
  const { t, lang } = useI18n()
  const [messages, setMessages] = useState<IdeaMessage[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'off'>('loading')
  const [typing, setTyping] = useState<{ name: string } | null>(null)
  const [typingSupported, setTypingSupported] = useState(false)
  const readCount = useRef(-1)

  const load = useCallback(async (quiet = false) => {
    try {
      const thread = await ideaMessagesService.thread(ideaId)
      setMessages(thread.results)
      setTyping(thread.typing ?? null)
      setTypingSupported(Boolean(thread.typing_supported))
      setState('ready')
      if (thread.results.length !== readCount.current) {
        readCount.current = thread.results.length
        ideaMessagesService.markRead(ideaId).catch(() => undefined)
      }
    } catch {
      if (!quiet) setState('off')
    }
  }, [ideaId])

  useEffect(() => {
    load()
  }, [load])

  // U11C (2.4): refresh while the page is open, so "Seen" and "typing" stay current.
  useEffect(() => {
    if (state !== 'ready') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(true)
    }, typingSupported ? 5000 : 20000)
    return () => window.clearInterval(timer)
  }, [state, typingSupported, load])

  const lastMine = messages ? [...messages].reverse().find((m) => m.author_role === 'applicant') : undefined

  return (
    <section id="messages" aria-labelledby="messages-title" className="scroll-mt-24">
      <h2 id="messages-title" className="font-heading text-d-h4 text-text">{t('track.messagesTitle')}</h2>
      {state === 'loading' && <div className="mt-4 h-24 animate-pulse rounded-card bg-surface2" />}
      {state === 'off' && <p className="mt-4 rounded-card bg-surface2 p-4 text-d-body-s text-muted">{t('track.messagesOff')}</p>}
      {state === 'ready' && messages && (
        <>
          {messages.length === 0 ? (
            <p className="mt-4 text-d-body-s text-muted">{t('track.messagesEmpty')}</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-4">
              {messages.map((message) => {
                const mine = message.author_role === 'applicant'
                const author = mine
                  ? t('track.you')
                  : message.author.label || message.author.name || (message.author_role === 'system' ? t('track.system') : t('track.officer'))
                return (
                  <li key={message.id} className={clsx('flex gap-3', mine && 'flex-row-reverse')}>
                    <Avatar name={mine ? t('track.you') : message.author.name || author} size="sm" decorative />
                    <div
                      className={clsx(
                        'max-w-[560px] rounded-card px-4 py-3',
                        mine ? 'bg-surface2' : message.is_question && !message.answered_at ? 'border-2 border-accent bg-surface' : 'border border-border bg-surface',
                      )}
                    >
                      <p className="text-d-cap text-muted">
                        {author} · {formatDateTime(message.created_at, lang)}
                      </p>
                      <p className="mt-1.5 whitespace-pre-line break-words text-d-body-s text-text">{message.body}</p>
                      {message.attachments.length > 0 && <Attachments items={message.attachments} />}
                      {message.reply_by && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-d-label-s text-accent-ink">
                          <Clock size={14} aria-hidden />
                          {t('track.replyBy', { date: formatShortDate(message.reply_by, lang) })}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          <Composer ideaId={ideaId} typingSupported={typingSupported} onSent={(message) => setMessages((prev) => [...(prev ?? []), message])} />
          {lastMine?.seen_by && (
            <p className="mt-3 text-d-cap text-muted">{t('track.seenBy', { name: lastMine.seen_by.name, time: formatDateTime(lastMine.seen_by.at, lang) })}</p>
          )}
          <div aria-live="polite" className="mt-3 min-h-[24px]">
            {typing && (
              <p className="flex items-center gap-2 text-d-cap text-muted">
                <Avatar name={typing.name} size="xs" decorative className="!bg-banner-muted !text-banner" />
                <span aria-hidden className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted motion-safe:animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                  ))}
                </span>
                {t('track.typing', { name: typing.name.split(' ')[0] })}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function Attachments({ items }: { items: MessageAttachment[] }) {
  const { t } = useI18n()
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item.id}>
          {item.kind === 'image' ? (
            <a href={item.url} target="_blank" rel="noreferrer">
              <img src={item.url} alt={item.original_filename} className="h-20 w-20 rounded-control object-cover" />
            </a>
          ) : item.kind === 'audio' ? (
            <audio controls src={item.url} aria-label={t('track.voiceNote')} className="max-w-full" />
          ) : (
            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-d-cap text-text hover:bg-surface2">
              <FileText size={14} aria-hidden />
              {item.original_filename}
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Formats in the order we prefer; the API accepts all four (webm since B3). */
const RECORD_TYPES: Array<{ mime: string; ext: string }> = [
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
]

function Composer({ ideaId, onSent, typingSupported = false }: { ideaId: string; onSent: (message: IdeaMessage) => void; typingSupported?: boolean }) {
  const lastTyping = useRef(0)
  const { t } = useI18n()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<MediaAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const photoRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recording])

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((track) => track.stop()), [])

  async function upload(blob: Blob, name: string) {
    setUploading(true)
    try {
      const asset = await mediaService.upload(blob, name)
      setFiles((prev) => [...prev, asset])
    } catch {
      toast.show({ tone: 'error', title: t('form.upload.failed', { name }) })
    } finally {
      setUploading(false)
    }
  }

  async function pick(list: FileList | null) {
    for (const file of Array.from(list ?? [])) await upload(file, file.name)
    if (photoRef.current) photoRef.current.value = ''
    if (fileRef.current) fileRef.current.value = ''
  }

  async function startRecording() {
    const type = RECORD_TYPES.find((option) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(option.mime))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, type ? { mimeType: type.mime } : undefined)
      const chunks: Blob[] = []
      rec.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data)
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: rec.mimeType || type?.mime || 'audio/webm' })
        upload(blob, `voice-note.${type?.ext ?? 'webm'}`)
      }
      recorder.current = rec
      rec.start()
      setSeconds(0)
      setRecording(true)
    } catch {
      toast.show({ tone: 'warning', title: t('track.micBlocked') })
    }
  }

  function stopRecording() {
    recorder.current?.stop()
    recorder.current = null
    setRecording(false)
  }

  async function send() {
    if (!body.trim() && files.length === 0) return
    setSending(true)
    try {
      const message = await ideaMessagesService.send(ideaId, { body: body.trim(), attachments: files.map((f) => f.id) })
      onSent(message)
      setBody('')
      setFiles([])
    } catch {
      toast.show({ tone: 'error', title: t('track.sendError') })
    } finally {
      setSending(false)
    }
  }

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const iconButton = 'flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50'

  return (
    <div className="mt-6 rounded-card border border-border bg-surface p-3">
      <label htmlFor="reply" className="sr-only">{t('track.replyLabel')}</label>
      <textarea
        id="reply"
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          // U11C (R-52): a typing signal at most every 4 seconds.
          if (typingSupported && Date.now() - lastTyping.current > 4000) {
            lastTyping.current = Date.now()
            ideaMessagesService.typing(ideaId).catch(() => undefined)
          }
        }}
        placeholder={t('track.replyPlaceholder')}
        rows={3}
        className="w-full resize-y rounded-control px-2 py-2 text-d-body-s text-text focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((file) => (
            <li key={file.id} className="inline-flex items-center gap-1 rounded-control bg-surface2 py-1 pl-2.5 pr-1 text-d-cap text-text">
              {file.kind === 'audio' ? t('track.voiceNote') : file.original_filename}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
                aria-label={t('form.upload.remove', { name: file.original_filename })}
                className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text"
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <input ref={photoRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files)} />
          <input ref={fileRef} type="file" multiple className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files)} />
          <button type="button" className={iconButton} aria-label={t('track.addPhoto')} disabled={uploading || recording} onClick={() => photoRef.current?.click()}>
            <ImagePlus size={20} aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label={t('track.addFile')} disabled={uploading || recording} onClick={() => fileRef.current?.click()}>
            <Paperclip size={20} aria-hidden />
          </button>
          {typeof MediaRecorder !== 'undefined' && (
            <button
              type="button"
              className={clsx(iconButton, recording && 'text-primary')}
              aria-label={recording ? t('track.stopVoice') : t('track.recordVoice')}
              aria-pressed={recording}
              disabled={uploading}
              onClick={recording ? stopRecording : startRecording}
            >
              {recording ? <Square size={18} aria-hidden /> : <Mic size={20} aria-hidden />}
            </button>
          )}
          {recording && <span className="text-d-cap text-primary" aria-live="polite">{t('track.recording', { time })}</span>}
        </div>
        <Button size="sm" onClick={send} loading={sending} disabled={uploading || recording || (!body.trim() && files.length === 0)}>
          {t('track.send')}
        </Button>
      </div>
    </div>
  )
}
