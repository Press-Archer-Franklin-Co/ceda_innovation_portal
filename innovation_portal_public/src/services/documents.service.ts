import api from './api'
import type { SubmissionDocument } from '../types/api'

export type DocumentAvailability = 'available' | 'external' | 'missing'

export const documentsService = {
  async uploadDraftDocument(draftId: string, fieldKey: string, file: File): Promise<SubmissionDocument> {
    const formData = new FormData()
    formData.append('field_key', fieldKey)
    formData.append('document_type', 'file')
    formData.append('file', file)
    const { data } = await api.post<SubmissionDocument>(`/documents/drafts/${draftId}/documents/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async getDocument(documentId: string): Promise<SubmissionDocument> {
    const { data } = await api.get<SubmissionDocument>(`/documents/${documentId}/`)
    return data
  },

  async downloadDocument(documentId: string, filename?: string): Promise<void> {
    const { data } = await api.get<Blob>(`/documents/${documentId}/download/`, { responseType: 'blob', timeout: 120000 })
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'document'
    a.click()
    URL.revokeObjectURL(url)
  },
}
