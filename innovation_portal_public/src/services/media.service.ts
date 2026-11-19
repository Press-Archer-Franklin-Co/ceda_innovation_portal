import api from './api'
import { unwrapData } from './envelope'
import type { Envelope, MediaAsset } from '../types/innovator'

/** Photos, files and voice notes for 2.3 and 2.4 (main, B1). */
export const mediaService = {
  async upload(file: Blob, filename: string, onProgress?: (percent: number) => void): Promise<MediaAsset> {
    // TODO(R-7): Chrome records voice notes as audio/webm, which the API refuses today.
    const form = new FormData()
    form.append('file', file, filename)
    const { data } = await api.post<Envelope<MediaAsset>>('/media/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
      onUploadProgress: event => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded * 100) / event.total))
      },
    })
    return unwrapData(data)
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/media/${id}/`)
  },
}
