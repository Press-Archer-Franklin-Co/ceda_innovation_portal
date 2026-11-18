import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, Download, ExternalLink, FileText } from 'lucide-react'
import Button from '../components/ui/Button'
import StandardHero from '../components/ui/StandardHero'
import { parseApiError } from '../utils/apiError'
import { documentsService } from '../services/documents.service'
import type { SubmissionDocument } from '../types/api'

export default function DocumentPage() {
  const { id = '' } = useParams()
  const [doc, setDoc] = useState<SubmissionDocument | null>(null)
  const [loadError, setLoadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const load = useCallback(async () => {
    try {
      setDoc(await documentsService.getDocument(id))
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      setLoadError(
        status === 404 || status === 403
          ? "This document doesn't exist or you don't have access to it."
          : parseApiError(err, 'This document could not be loaded.'),
      )
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function download() {
    if (!doc) return
    setDownloading(true)
    setDownloadError('')
    try {
      await documentsService.downloadDocument(doc.id, doc.original_filename)
    } catch (err) {
      setDownloadError(parseApiError(err, 'This document could not be downloaded.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <StandardHero className="!max-w-none !mx-0 !px-0 !py-0" eyebrow="Document" title={doc?.original_filename || 'Document'} />

        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!doc && !loadError && <p className="text-sm text-gray-500">Loading…</p>}

          {doc && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <FileText size={20} className="shrink-0 text-[#A01E0A]" />
                <p className="min-w-0 truncate font-medium text-gray-900">{doc.original_filename || 'Document'}</p>
              </div>

              {doc.availability === 'available' && (
                <div className="space-y-3">
                  <Button onClick={download} loading={downloading}>
                    <Download size={16} /> Download
                  </Button>
                  {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
                </div>
              )}

              {doc.availability === 'external' && doc.external_url && (
                <a href={doc.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#A01E0A] hover:underline">
                  <ExternalLink size={14} /> Open link
                </a>
              )}

              {doc.availability === 'missing' && (
                <p className="text-sm text-gray-600">No file is stored for this document.</p>
              )}
            </div>
          )}
        </div>

        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#A01E0A]">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
      </div>
    </div>
  )
}
