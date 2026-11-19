import api from './api'
import { query, unwrapData } from './envelope'
import type { Envelope, Lang, PublishedForm } from '../types/innovator'

/**
 * Screen 2.3 and the shared FormRenderer.
 * TODO(B4): GET /api/forms/{id}/published/ is planned in B4 and not built yet.
 */
export const formsService = {
  async published(formId: string, lang: Lang = 'en'): Promise<PublishedForm> {
    const { data } = await api.get<Envelope<PublishedForm> | PublishedForm>(`/forms/${formId}/published/${query({ lang })}`)
    return unwrapData(data)
  },
}
