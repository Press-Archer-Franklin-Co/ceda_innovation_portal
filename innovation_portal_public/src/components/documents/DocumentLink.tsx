import { useState, type ReactNode } from 'react'
import { parseApiError } from '../../utils/apiError'
import { documentsService } from '../../services/documents.service'

interface Props {
  documentId: string
  filename?: string
  className?: string
  children: ReactNode
}

export default function DocumentLink({ documentId, filename, className, children }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function open() {
    setBusy(true)
    setError('')
    try {
      await documentsService.downloadDocument(documentId, filename)
    } catch (err) {
      setError(parseApiError(err, 'This document could not be downloaded.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open} disabled={busy} className={className} aria-busy={busy}>
        {children}
      </button>
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </>
  )
}
