import api from './api'
import type { ApiFAQ, PaginatedResponse } from '../types/api'

export const faqsService = {
  async getPublic(): Promise<ApiFAQ[]> {
    const { data } = await api.get<ApiFAQ[] | PaginatedResponse<ApiFAQ>>('/support/faqs/')
    return Array.isArray(data) ? data : (data.results ?? [])
  },
}
