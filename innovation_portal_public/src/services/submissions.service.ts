import api from './api'
import type { SubmissionPayload, Submission, PaginatedResponse } from '../types/api'

export interface ApplicationDraft {
  id: string
  reference_number: string
  program: string
  program_title?: string
  submission_type: string
  title: string
  status: 'draft' | 'submitted'
  draft_data: Record<string, unknown>
  current_section_code: string
  progress_metadata: {
    percent_complete?: number
    sections?: Array<{ section_code: string; section_title: string; percent_complete: number }>
  }
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface SubmissionFileDocument {
  id: string
  field_key?: string
  original_filename?: string
  mime_type?: string
  size_bytes?: number
  file?: string
  file_url?: string
  external_url?: string
}

export const submissionsService = {

  async saveDraft(payload: SubmissionPayload): Promise<ApplicationDraft> {
    const { data } = await api.post<ApplicationDraft>('/drafts/', payload)
    return data
  },

  async updateDraft(id: string, payload: Partial<SubmissionPayload>): Promise<ApplicationDraft> {
    const { data } = await api.patch<ApplicationDraft>(`/drafts/${id}/`, payload)
    return data
  },

  async getMyDrafts(): Promise<ApplicationDraft[]> {
    const { data } = await api.get<ApplicationDraft[] | PaginatedResponse<ApplicationDraft>>('/drafts/?status=draft')
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  async getDraft(id: string): Promise<ApplicationDraft> {
    const { data } = await api.get<ApplicationDraft>(`/drafts/${id}/`)
    return data
  },

  async deleteDraft(id: string): Promise<void> {
    await api.delete(`/drafts/${id}/`)
  },

  async submitDraft(id: string): Promise<Submission> {
    const { data } = await api.post<{ data?: Submission } | Submission>(`/drafts/${id}/submit/`)
    return Array.isArray(data) ? data[0] : ('data' in (data as object) ? (data as { data?: Submission }).data ?? (data as Submission) : (data as Submission))
  },


  async create(payload: SubmissionPayload): Promise<ApplicationDraft> {
    return submissionsService.saveDraft(payload)
  },

  async finalize(id: string): Promise<Submission> {
    return submissionsService.submitDraft(id)
  },

  async getMySubmissions(): Promise<Submission[]> {
    const { data } = await api.get<Submission[] | PaginatedResponse<Submission>>('/my-submissions/')
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  async track(referenceNumber: string): Promise<unknown> {
    const { data } = await api.get(`/track/${referenceNumber}/`)
    return data
  },

  async getSubmission(id: string): Promise<SubmissionDetail> {
    const { data } = await api.get<SubmissionDetail>(`/submissions/${id}/`)
    return data
  },

  async updateSubmission(id: string, payload: Partial<Pick<Submission, 'title' | 'team'>>): Promise<Submission> {
    const { data } = await api.patch<Submission>(`/submissions/${id}/`, payload)
    return data
  },

  async getTrackingDetail(id: string): Promise<TrackingDetail> {
    const { data } = await api.get<{ data: TrackingDetail } | TrackingDetail>(`/submissions/${id}/tracking-detail/`)
    return ('data' in (data as object) ? (data as { data: TrackingDetail }).data : data) as TrackingDetail
  },

  async updateResponses(id: string, responses: ResponseUpdate[]): Promise<void> {
    await api.post(`/submissions/${id}/responses/`, { responses })
  },

  async resubmit(id: string): Promise<Submission> {
    const { data } = await api.post<{ data?: Submission } | Submission>(`/submissions/${id}/resubmit/`)
    return ('data' in (data as object) ? (data as { data?: Submission }).data ?? (data as Submission) : (data as Submission))
  },

  async uploadSubmissionDocument(submissionId: string, fieldKey: string, file: File, replaceDocumentId?: string): Promise<SubmissionFileDocument> {
    const fd = new FormData()
    fd.append('field_key', fieldKey)
    fd.append('document_type', 'file')
    fd.append('file', file)
    if (replaceDocumentId) fd.append('replace_document_id', replaceDocumentId)
    const { data } = await api.post<SubmissionFileDocument>(
      `/documents/submissions/${submissionId}/documents/`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return data
  },
}


export interface SubmissionResponse {
  id: string
  form_field: string
  field_label: string
  field_key: string
  field_type: string
  value: unknown
}

export interface SubmissionDetail extends Submission {
  responses: SubmissionResponse[]
  program_detail: {
    id: string
    title: string
    description?: string
  } | null
  workflow?: {
    id: string
    status: string
    current_step?: { id: string; name: string } | null
  } | null
  locked_for_editing: boolean
}

export interface StatusHistoryEntry {
  id: string
  from_status: string
  to_status: string
  changed_by: string | null
  changed_by_name: string | null
  reason: string
  comment: string
  created_at: string
}

export interface JourneyCriterion {
  id: string
  criterion_name: string
  raw_score: number
  max_score: number
  comment: string
}

export interface JourneyReview {
  id: string
  reviewer_label: string
  submitted_at: string | null
  total_score: number | null
  max_score: number
  total_pct: number | null
  overall_comment: string
  criteria: JourneyCriterion[]
}

export interface JourneyComment {
  id: string
  kind: 'status' | 'workflow' | 'manager' | string
  label: string
  action?: string
  comment: string
  timestamp: string | null
}

export interface JourneyAggregate {
  score: number | null
  pct: number | null
  outcome: string | null
  completed_reviews: number
  decision_note?: string
  source_stage_code?: string
  source_stage_name?: string
}

export interface JourneyActivity {
  id: string
  action: string
  state: 'pending' | 'current' | 'completed' | 'returned' | 'rejected' | string
  title: string
  comment: string
  timestamp: string | null
  comments: JourneyComment[]
  reviews: JourneyReview[]
  aggregate: JourneyAggregate | null
}

export interface JourneyStage {
  id: string
  code: string
  label: string
  order: number
  state: 'pending' | 'current' | 'completed' | 'returned' | 'rejected' | string
  timestamp: string | null
  activities: JourneyActivity[]
  comments: JourneyComment[]
  reviews: JourneyReview[]
  aggregate: JourneyAggregate | null
  comment_count: number
  review_count: number
  activity_count: number
  is_current: boolean
}

export interface TrackingDetail {
  reference_number: string
  current_status: string
  submitted_at: string | null
  updated_at: string
  current_step: string
  applicant_action_required: boolean
  status_history: StatusHistoryEntry[]
  journey: JourneyStage[]
  workflow_history: Array<{
    action?: string
    actor?: string
    reason?: string
    note?: string
    comment?: string
    created_at?: string
    timestamp?: string
  }>
}

export interface ResponseUpdate {
  form_field: string
  value: unknown
}
