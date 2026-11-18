import React, { useState } from 'react'
import { downloadDocument } from '../../lib/documentDownload'

export default function DocumentLink({ doc, className, children }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function open() {
    setBusy(true)
    setError('')
    try {
      await downloadDocument(doc)
    } catch (err) {
      setError(err.message || 'This document could not be downloaded.')
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
