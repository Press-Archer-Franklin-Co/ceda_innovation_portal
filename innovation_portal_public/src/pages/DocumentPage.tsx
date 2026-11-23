import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import Button from '../components/ui/Button'
import { useDocumentPreview } from '../components/ui/useDocumentPreview'
import Skeleton from '../components/ui/Skeleton'
import { useI18n } from '../i18n'
import { usePageTitle } from '../lib/usePageTitle'
import { documentsService } from '../services/documents.service'
import type { SubmissionDocument } from '../types/api'

// One file sent with an idea (opened from 2.4 › Your idea › Files), in the Option D look of 2.4: a bordered
// card with the file and a Download button, and a way back to My ideas.

export default function DocumentPage() {
  const { id = '' } = useParams()
  const { t } = useI18n()
  const [doc, setDoc] = useState<SubmissionDocument | null>(null)
  const [loadError, setLoadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const preview = useDocumentPreview()
  usePageTitle(doc?.original_filename || t('docPage.title'))

  const load = useCallback(async () => {
    try {
      setDoc(await documentsService.getDocument(id))
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      setLoadError(status === 404 || status === 403 ? t('docPage.notFound') : t('docPage.loadError'))
    }
  }, [id, t])

  useEffect(() => { load() }, [load])

  async function download() {
    if (!doc) return
    setDownloading(true)
    setDownloadError(false)
    try {
      await documentsService.downloadDocument(doc.id, doc.original_filename)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 lg:py-12 flex flex-col gap-6">
      <Link to="/my-ideas" className="self-start inline-flex items-center gap-1.5 text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft size={16} aria-hidden /> {t('docPage.back')}
      </Link>
      <section aria-labelledby="doc-title" className="w-full max-w-[640px] rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-d-over uppercase font-heading text-accent">{t('docPage.over')}</p>
        {loadError ? (
          <p role="alert" className="text-d-body-s text-danger">{loadError}</p>
        ) : !doc ? (
          <div aria-hidden className="flex flex-col gap-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-11 w-32 rounded-control" />
          </div>
        ) : (
          <>
            <h1 id="doc-title" className="flex items-center gap-3 font-heading text-d-h4 text-text min-w-0">
              <FileText size={20} aria-hidden className="shrink-0 text-primary" />
              <span className="truncate">{doc.original_filename || t('docPage.title')}</span>
            </h1>
            {doc.availability === 'available' && (
              <div className="flex flex-col gap-2 items-start">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={download} loading={downloading}>{t('docPage.download')}</Button>
                  <Button variant="secondary" onClick={(e) => preview.show(e, { name: doc.original_filename || t('docPage.title'), mime: doc.mime_type, load: (signal) => documentsService.previewBlob(doc.id, signal), download: () => documentsService.downloadDocument(doc.id, doc.original_filename) })}>{t('preview.open')}</Button>
                </div>
                {downloadError && <p role="alert" className="text-d-cap text-danger">{t('docPage.downloadError')}</p>}
              </div>
            )}
            {doc.availability === 'external' && doc.external_url && (
              <a href={doc.external_url} target="_blank" rel="noreferrer" className="self-start inline-flex items-center gap-1.5 text-d-label text-primary hover:underline underline-offset-4">
                <ExternalLink size={16} aria-hidden /> {t('docPage.open')}
              </a>
            )}
            {doc.availability === 'missing' && <p className="text-d-body-s text-muted">{t('docPage.missing')}</p>}
          </>
        )}
      </section>
      {preview.element}
    </div>
  )
}
