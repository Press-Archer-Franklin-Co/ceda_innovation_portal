import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, FileText, MessageCircle, StickyNote, Eye } from 'lucide-react'
import Button from '../ui/Button'
import Tabs from '../ui/Tabs'
import Textarea from '../ui/Textarea'
import Input from '../ui/Input'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import ErrorState from '../ui/ErrorState'
import StatusPill from '../ui/StatusPill'
import Avatar from '../ui/Avatar'
import Tag from '../ui/Tag'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { ideaApi } from '../../lib/api/ideas'
import { downloadDocument } from '../../lib/documentDownload'
import { documents as documentsApi } from '../../lib/api/endpoints'
import { isWebUrl, urlFile } from '../../lib/documentPreview'
import { useDocumentPreview } from '../ui/useDocumentPreview'
import { relativeTime } from '../../lib/forms/format'

// The tab panels of 3.16 (Figma 103:843): Answers, Documents, Messages, Notes (staff only), History, Related.

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])
/** One answer as text: lists joined, files and links by their name, yes/no in words. Never "[object Object]". */
function answerText(value, t) {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? t('ideas.yes') : t('ideas.no')
  if (Array.isArray(value)) return value.map((v) => answerText(v, t)).filter(Boolean).join(', ') || null
  if (typeof value === 'object') return value.label ?? value.name ?? value.original_filename ?? value.title ?? value.url ?? value.value ?? null
  return String(value)
}

const when = (value) => (value ? new Date(value).toLocaleString('en-BW', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** A file answer from the form ({filename, url}): its files, or nothing when this answer is not files. */
function answerFiles(value) {
  if (!Array.isArray(value) || !value.length) return []
  const files = value.filter((v) => v && typeof v === 'object' && isWebUrl(v.url) && (v.filename || v.original_filename || v.name))
  return files.length === value.length ? files.map((v) => ({ name: v.filename || v.original_filename || v.name, url: v.url, mime: v.mime_type })) : []
}

function Rows({ n = 3 }) {
  return <div aria-hidden className="flex flex-col gap-3">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
}

/** ③ Answers in the innovator's language, with a switch to the other one when the form has it. */
export function AnswersTab({ summary }) {
  const t = useT()
  const own = summary.language === 'tn' ? 'tn' : 'en'
  const hasOther = summary.answers.some((g) => g.items.some((i) => i.value_other_language))
  const [lang, setLang] = useState(own)
  const preview = useDocumentPreview()
  const showOther = hasOther && lang !== own
  const groups = summary.answers.filter((g) => g.items.length)
  if (!groups.length) return <EmptyState compact title={t('ideas.noAnswers')} />
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g, gi) => (
        <section key={g.step_code ?? gi} aria-labelledby={`answers-${gi}`} className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
            <h2 id={`answers-${gi}`} className="text-[16px] font-bold text-text">
              {g.step_title ? t('ideas.stepTitle', { n: gi + 1, title: g.step_title }) : t('ideas.answers')}
            </h2>
            {gi === 0 && hasOther && (
              <Tabs
                variant="segment"
                label={t('ideas.answerLanguage')}
                idPrefix="answer-lang"
                tabs={[{ key: 'en', label: 'English' }, { key: 'tn', label: 'Setswana' }]}
                active={lang}
                onChange={setLang}
              />
            )}
          </div>
          <dl className="flex flex-col">
            {g.items.map((item) => {
              const value = answerText(showOther && item.value_other_language ? item.value_other_language : item.value, t)
              const files = answerFiles(item.value)
              return (
                <div key={item.key} className="border-b border-border py-4">
                  <dt className="text-[12px] font-bold text-muted">{item.label}</dt>
                  <dd className="mt-1 whitespace-pre-line break-words text-[15px] leading-6 text-text">
                    {files.length ? (
                      <ul className="flex flex-col gap-1">
                        {files.map((file) => (
                          <li key={file.url}>
                            <button type="button" aria-label={t('preview.openName', { name: file.name })} onClick={(e) => preview.show(e, urlFile(file))} className="inline-flex max-w-full items-center gap-1.5 rounded text-left text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                              <Eye size={15} aria-hidden className="shrink-0" /><span className="min-w-0 break-words">{file.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : value == null ? <span className="text-muted">{t('ideas.notAnswered')}</span> : value}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
      {preview.element}
    </div>
  )
}

export function DocumentsTab({ id }) {
  const t = useT()
  const toast = useToast()
  const docs = useQuery({ queryKey: ['ideas', id, 'documents'], queryFn: () => ideaApi.documents(id) })
  const preview = useDocumentPreview()
  if (docs.isLoading) return <Rows />
  if (docs.isError) return <ErrorState compact title={t('ideas.docsError')} message={docs.error?.message} onRetry={docs.refetch} />
  const list = asList(docs.data)
  if (!list.length) return <EmptyState compact icon={FileText} title={t('ideas.noDocs')} />
  return (
    <>
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
      {list.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-4 py-3">
          <FileText size={18} aria-hidden className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-text">{d.original_filename || d.field_key || t('ideas.document')}</span>
            {d.field_label && <span className="block truncate text-[12px] text-muted">{d.field_label}</span>}
          </span>
          {d.availability === 'external' && d.external_url ? (
            <a href={d.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline">
              <ExternalLink size={14} aria-hidden />{t('ideas.openLink')}
            </a>
          ) : (
            <span className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('preview.openName', { name: d.original_filename || t('ideas.document') })}
                onClick={(e) => preview.show(e, {
                  name: d.original_filename || d.field_key || t('ideas.document'),
                  mime: d.mime_type,
                  load: () => documentsApi.downloadBlob(d.id, { inline: true }),
                  download: () => downloadDocument(d),
                })}
              >
                <Eye size={14} aria-hidden />{t('preview.open')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadDocument(d).catch((err) => toast.show({ tone: 'error', title: t('ideas.downloadError'), body: err?.message }))}
              >
                <Download size={14} aria-hidden />{t('ideas.download')}
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
    {preview.element}
    </>
  )
}

/** Messages with the innovator. A reply-by date makes it a question ("Ask for more"). */
export function MessagesTab({ id, askRef }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const msgs = useQuery({ queryKey: ['ideas', id, 'messages'], queryFn: () => ideaApi.messages(id) })
  const [body, setBody] = useState('')
  const [replyBy, setReplyBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (!body.trim()) { setError(t('ideas.messageNeeded')); return }
    setBusy(true)
    try {
      await ideaApi.sendMessage(id, { body: body.trim(), ...(replyBy ? { reply_by: replyBy } : {}) })
      setBody('')
      setReplyBy('')
      qc.invalidateQueries({ queryKey: ['ideas', id] })
      toast.show({ tone: 'success', title: t('ideas.messageSent') })
    } catch (err) {
      setError(err?.data?.errors?.body?.[0] ?? err?.data?.errors?.reply_by?.[0] ?? err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  const list = msgs.data?.results ?? []
  return (
    <div className="flex flex-col gap-4">
      {msgs.isLoading ? <Rows /> : msgs.isError ? (
        <ErrorState compact title={t('ideas.messagesError')} message={msgs.error?.message} onRetry={msgs.refetch} />
      ) : list.length === 0 ? (
        <EmptyState compact icon={MessageCircle} title={t('ideas.noMessages')} message={t('ideas.noMessagesBody')} />
      ) : (
        <ol className="flex flex-col gap-3">
          {list.map((m) => {
            const staff = m.author_role !== 'applicant'
            return (
              <li key={m.id} className={`max-w-[85%] rounded-card px-4 py-3 ${staff ? 'self-end bg-primary-soft' : 'self-start bg-surface2'}`}>
                <p className="text-[12px] font-bold text-muted">{m.author?.label}{m.created_at ? ` · ${when(m.created_at)}` : ''}</p>
                <p className="mt-1 whitespace-pre-line break-words text-[14px] text-text">{m.body}</p>
                {m.is_question && (
                  <Tag tone={m.answered_at ? 'green' : 'amber'} className="mt-2">
                    {m.answered_at ? t('ideas.answered') : t('ideas.replyBy', { date: new Date(m.reply_by).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' }) })}
                  </Tag>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <div className="flex flex-col gap-3 rounded-card border border-border p-4">
        <Textarea ref={askRef} label={t('ideas.writeMessage')} value={body} onChange={(e) => { setBody(e.target.value); setError('') }} rows={3} maxChars={2000} error={error || undefined} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-[220px]">
            <Input type="date" label={t('ideas.askReplyBy')} hint={t('ideas.askReplyByHint')} optional value={replyBy} onChange={(e) => setReplyBy(e.target.value)} />
          </div>
          <Button onClick={send} loading={busy}>{replyBy ? t('ideas.sendQuestion') : t('ideas.send')}</Button>
        </div>
      </div>
    </div>
  )
}

/** Staff-only notes; the innovator never sees these. */
export function NotesTab({ id }) {
  const t = useT()
  const qc = useQueryClient()
  const notes = useQuery({ queryKey: ['ideas', id, 'notes'], queryFn: () => ideaApi.notes(id) })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    if (!text.trim()) { setError(t('ideas.noteNeeded')); return }
    setBusy(true)
    try {
      await ideaApi.addNote(id, { note: text.trim() })
      setText('')
      qc.invalidateQueries({ queryKey: ['ideas', id] })
    } catch (err) {
      setError(err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  const list = asList(notes.data)
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-control bg-surface2 px-3 py-2 text-[13px] text-muted">{t('ideas.notesPrivate')}</p>
      {notes.isLoading ? <Rows /> : notes.isError ? (
        <ErrorState compact title={t('ideas.notesError')} message={notes.error?.message} onRetry={notes.refetch} />
      ) : list.length === 0 ? (
        <EmptyState compact icon={StickyNote} title={t('ideas.noNotes')} />
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {list.map((n) => (
            <li key={n.id} className="flex gap-3 py-3">
              <Avatar name={n.author_detail?.full_name ?? ''} size="sm" decorative />
              <div className="min-w-0">
                <p className="text-[12px] text-muted"><span className="font-bold text-text">{n.author_detail?.full_name}</span> · {relativeTime(n.created_at, t)}</p>
                <p className="mt-0.5 whitespace-pre-line break-words text-[14px] text-text">{n.note}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-2">
        <Textarea label={t('ideas.addNote')} value={text} onChange={(e) => { setText(e.target.value); setError('') }} rows={3} error={error || undefined} />
        <Button variant="secondary" onClick={add} loading={busy} className="self-end">{t('ideas.saveNote')}</Button>
      </div>
    </div>
  )
}

export function HistoryTab({ id }) {
  const t = useT()
  const history = useQuery({ queryKey: ['ideas', id, 'history'], queryFn: () => ideaApi.history(id) })
  if (history.isLoading) return <Rows />
  if (history.isError) return <ErrorState compact title={t('ideas.historyError')} message={history.error?.message} onRetry={history.refetch} />
  const list = [...asList(history.data)].reverse()
  if (!list.length) return <EmptyState compact title={t('ideas.noHistory')} />
  return (
    <ol className="flex flex-col">
      {list.map((h) => (
        <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 text-[14px]">
          <StatusPill status={h.to_status} />
          <span className="text-text">{h.changed_by_name || t('ideas.system')}</span>
          <span className="text-muted">{when(h.created_at)}</span>
          {(h.comment || h.reason) && <span className="basis-full text-muted">{h.comment || h.reason}</span>}
        </li>
      ))}
    </ol>
  )
}

export function RelatedTab({ related }) {
  const t = useT()
  if (!related?.length) return <EmptyState compact title={t('ideas.noRelated')} message={t('ideas.noRelatedBody')} />
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
      {related.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-4 py-3">
          <Link to={`/submissions/${r.id}`} className="min-w-0 flex-1 hover:underline">
            <span className="block truncate text-[14px] font-bold text-text">{r.title}</span>
            <span className="block text-[12px] text-muted">{r.reference}</span>
          </Link>
          <StatusPill status={r.status} />
        </li>
      ))}
    </ul>
  )
}
