import api from './api'
import type { Program, PaginatedResponse, SubmissionFormDefinition } from '../types/api'

function unwrap(data: Program[] | PaginatedResponse<Program>): Program[] {
  return Array.isArray(data) ? data : (data.results ?? [])
}

export const programsService = {
  async getPublic(): Promise<Program[]> {
    const { data } = await api.get<Program[] | PaginatedResponse<Program>>('/programs/public/')
    return unwrap(data)
  },

  async getById(id: string): Promise<Program> {
    const { data } = await api.get<Program>(`/programs/${id}/`)
    return data
  },

  async getForm(id: string): Promise<SubmissionFormDefinition> {
    const { data } = await api.get<SubmissionFormDefinition>(`/programs/${id}/form/`)
    return data
  },
}
