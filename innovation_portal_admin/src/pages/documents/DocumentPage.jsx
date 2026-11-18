import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, ExternalLink, FileText } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import { documents as documentsApi } from '../../lib/api/endpoints'
import { downloadDocument } from '../../lib/documentDownload'

export default function DocumentPage() {
  const { id } = useParams()
  const [doc, setDoc] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const load = useCallback(async () => {
    try {
      setDoc(await documentsApi.get(id))
    } catch (err) {
      setLoadError(
        err?.status === 404 || err?.status === 403
          ? "This document doesn't exist or you don't have access to it."
          : err?.message || 'This document could not be loaded.',
      )
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function download() {
    setDownloading(true)
    setDownloadError('')
    try {
      await downloadDocument(doc)
    } catch (err) {
      setDownloadError(err.message || 'This document could not be downloaded.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={doc?.original_filename || 'Document'} subtitle="Submission document" />
      <SectionCard>
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!doc && !loadError && <p className="text-sm text-ceda-muted">Loading…</p>}

        {doc && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <FileText size={20} className="flex-shrink-0 text-ceda-forest" />
              <p className="min-w-0 truncate font-medium text-ceda-dark">{doc.original_filename || 'Document'}</p>
            </div>

            {doc.availability === 'available' && (
              <div className="space-y-3">
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={download} disabled={downloading}>
                  <Download size={16} /> {downloading ? 'Downloading…' : 'Download'}
                </button>
                {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
              </div>
            )}

            {doc.availability === 'external' && doc.external_url && (
              <a href={doc.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-ceda-forest hover:underline">
                <ExternalLink size={14} /> Open link
              </a>
            )}

            {doc.availability === 'missing' && <p className="text-sm text-ceda-muted">No file is stored for this document.</p>}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
