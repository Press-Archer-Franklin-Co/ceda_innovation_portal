import api from './api'
import type { ApiFAQ, PaginatedResponse } from '../types/api'

export const faqsService = {
  /** Public questions in the asked language, ordered as the admins set them (group, then question). */
  async getPublic(lang?: string): Promise<ApiFAQ[]> {
    const { data } = await api.get<ApiFAQ[] | PaginatedResponse<ApiFAQ>>('/support/faqs/', { params: lang ? { lang } : undefined })
    return Array.isArray(data) ? data : (data.results ?? [])
  },
}
