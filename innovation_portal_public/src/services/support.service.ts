import api from './api'
import type { SupportRequestPayload, SupportRequest, PaginatedResponse } from '../types/api'

export const supportService = {
  async submitRequest(payload: SupportRequestPayload): Promise<SupportRequest> {
    const { data } = await api.post<SupportRequest>('/support/requests/', payload)
    return data
  },

  async getMyRequests(): Promise<SupportRequest[]> {
    const { data } = await api.get<SupportRequest[] | PaginatedResponse<SupportRequest>>('/support/my-requests/')
    return Array.isArray(data) ? data : (data.results ?? [])
  },
}
