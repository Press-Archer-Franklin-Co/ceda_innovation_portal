import api from './api'
import { query, unwrapData } from './envelope'
import type { Envelope, Lang, PublishedForm } from '../types/innovator'

/**
 * Screen 2.3 and the shared FormRenderer.
 * 404 when the form was never published, is archived or is a template.
 */
export const formsService = {
  async published(formId: string, lang: Lang = 'en'): Promise<PublishedForm> {
    const { data } = await api.get<Envelope<PublishedForm> | PublishedForm>(`/forms/${formId}/published/${query({ lang })}`)
    return unwrapData(data)
  },
}
