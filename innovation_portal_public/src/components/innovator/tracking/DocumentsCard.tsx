import { useRef, useState } from 'react'
import { Download, Eye, FileText, Plus } from 'lucide-react'
import Button from '../../ui/Button'
import Card from '../../ui/Card'
import { useDocumentPreview } from '../../ui/useDocumentPreview'
import { useI18n } from '../../../i18n'
import { documentsService } from '../../../services/documents.service'
import { formatDate } from '../format'
import type { IdeaDocument, IdeaDocumentVersion } from '../../../types/innovator'

// Figma 2.4 pin 5: every file with the date sent, size and Download; add more while the idea is open.
// Downloads go through the API, which checks that this person owns the idea.

export function fileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsCard({ ideaId, documents, canAdd, onChanged }: { ideaId: string; documents: IdeaDocument[]; canAdd: boolean; onChanged: () => void }) {
  const { t, lang } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const preview = useDocumentPreview()

  const pick = (replaceId?: string) => {
    replacing.current = replaceId
    input.current?.click()
  }

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await documentsService.uploadIdeaDocument(ideaId, file, { replaceId: replacing.current })
      onChanged()
    } catch {
      setError(t('trk.uploadError'))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function download(doc: IdeaDocumentVersion) {
    setError('')
    try {
      if (doc.download_url.startsWith('/api/')) await documentsService.downloadDocument(doc.id, doc.name)
      else window.open(doc.download_url, '_blank', 'noopener')
    } catch {
      setError(t('trk.downloadError'))
    }
  }

  const meta = (doc: IdeaDocumentVersion) => [doc.sent_at ? t('trk.sent', { date: formatDate(doc.sent_at, lang) }) : '', fileSize(doc.size_bytes)].filter(Boolean).join(' · ')

  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-d-h5 text-text">{t('trk.documents')}</h2>
        {canAdd && (
          <Button variant="link" size="sm" loading={busy} onClick={() => pick()}><Plus size={15} aria-hidden />{t('trk.addDocument')}</Button>
        )}
      </div>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
      {error && <p role="alert" className="mt-3 text-d-cap text-danger">{error}</p>}
      {documents.length === 0 ? (
        <p className="mt-3 text-d-body-s text-muted">{t('trk.noDocuments')}</p>
      ) : (
        <ul className="mt-3">
          {documents.map((doc) => (
            <li key={doc.id} className="border-t border-border py-3.5">
              <div className="flex items-start gap-3">
                <FileText size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-d-label text-text break-words">{doc.name}</p>
                  <p className="text-d-cap text-muted">{meta(doc)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {canAdd && (
                    <button type="button" onClick={() => pick(doc.id)} aria-label={t('trk.replaceName', { name: doc.name })} className="text-d-label-s text-muted hover:text-text hover:underline">{t('trk.replace')}</button>
                  )}
                  {doc.download_url.startsWith('/api/') && (
                    <button
                      type="button"
                      aria-label={t('preview.openName', { name: doc.name })}
                      onClick={(e) => preview.show(e, { name: doc.name, mime: doc.mime_type, load: (signal) => documentsService.previewBlob(doc.id, signal), download: () => documentsService.downloadDocument(doc.id, doc.name) })}
                      className="inline-flex items-center gap-1 text-d-label-s text-primary hover:underline"
                    >
                      <Eye size={15} aria-hidden />{t('preview.open')}
                    </button>
                  )}
                  <button type="button" onClick={() => download(doc)} aria-label={t('trk.downloadName', { name: doc.name })} className="inline-flex items-center gap-1 text-d-label-s text-primary hover:underline">
                    <Download size={15} aria-hidden />{t('trk.download')}
                  </button>
                </div>
              </div>
              {doc.older_versions.length > 0 && (
                <details className="mt-2 pl-[30px]">
                  <summary className="cursor-pointer text-d-cap text-muted">{t('trk.older', { count: doc.older_versions.length })}</summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {doc.older_versions.map((old) => (
                      <li key={old.id} className="flex items-center justify-between gap-3 text-d-cap text-muted">
                        <span className="min-w-0 break-words">{t('trk.version', { n: old.version })} · {old.name} · {meta(old)}</span>
                        <button type="button" onClick={() => download(old)} aria-label={t('trk.downloadName', { name: old.name })} className="shrink-0 font-bold text-primary hover:underline">{t('trk.download')}</button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-d-cap text-muted">{t('trk.docsNote')}</p>
      {preview.element}
    </Card>
  )
}
