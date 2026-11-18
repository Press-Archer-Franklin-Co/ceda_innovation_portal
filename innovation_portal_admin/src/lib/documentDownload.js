import { documents as documentsApi } from './api/endpoints'

export async function downloadDocument(doc) {
  const blob = await documentsApi.downloadBlob(doc.id)
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = doc.original_filename || doc.field_key || 'document'
  a.click()
  URL.revokeObjectURL(url)
}
