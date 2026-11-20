
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access: string
  refresh: string
  user?: AuthenticatedUser
}

export interface MfaRequiredResponse {
  mfa_required: true
  challenge_id: string
  method: 'email' | 'totp' | string
  email_hint?: string
  expires_at?: string
  provider?: string
  created?: boolean
  linked_existing_account?: boolean
}

export interface RegisterRequest {
  email: string
  first_name: string
  last_name: string
  phone_number?: string
  password: string
}

export interface RegisterResponse {
  id: string
  email: string
  first_name: string
  last_name: string
  phone_number?: string
}

export interface LogoutRequest {
  refresh: string
}

export interface TokenRefreshRequest {
  refresh: string
}

export interface TokenRefreshResponse {
  access: string
  refresh: string
}


export interface UserSummary {
  id: string
  email: string
  first_name: string
  last_name: string
  phone_number?: string
  email_verified?: boolean
}

export interface AuthenticatedUser extends UserSummary {
  email_verified: boolean
  primary_auth_method: string
  mfa_enabled?: boolean
  mfa_method?: string
  roles?: string[]
  /** What this person may do (S1). Ask for these with can(), not for roles. */
  capabilities?: string[]
  profile?: InnovatorProfile | null
}

export interface InnovatorProfile {
  id: string
  user: UserSummary
  national_id?: string
  id_passport_number?: string
  country_code?: string
  country?: string
  gender?: string
  date_of_birth?: string
  birthday?: string
  person_type?: string
  person_type_other?: string
  region?: string
  bio?: string
  sector_interests?: unknown
  skills?: unknown
  certifications?: unknown
  portfolio_url?: string
  website_portfolio?: string
  linkedin_url?: string
  linkedin_profile?: string
  past_participation_summary?: string
}


export type ProgramStatus = 'draft' | 'published' | 'closed' | 'archived' | string
export type SubmissionType = 'idea' | 'hackathon_application' | 'innovation_challenge' | string

export interface ProgramType {
  id: string
  code: string
  name: string
  description?: string
}

export interface Program {
  id: string
  title: string
  slug: string
  description: string
  program_type: ProgramType
  status: ProgramStatus
  opening_date: string
  closing_date: string
  screening_start?: string
  screening_end?: string
  judging_start?: string
  judging_end?: string
  event_date?: string
  owner: string
  max_team_size?: number
  is_public: boolean
  allow_team_submission: boolean
  allow_individual_submission: boolean
  terms_and_conditions?: { id: string; title: string; document_link: string | null; active: boolean } | null
  published_at?: string
  audience?: ProgramAudience
  results_announced_at?: string | null
  entry?: ChallengeEntry | null
}

export type ProgramAudience = 'internal' | 'public' | 'both'

export interface ChallengeEntry {
  can_enter: boolean
  blocked_by: '' | 'audience' | 'window' | 'limit'
  message: string
  entries_used: number
  max_entries: number | null
}

export interface FormFieldOption {
  id: string
  label: string
  value: string
  ordering?: number
}

export interface FormFieldRule {
  id: string
  rule_type: string
  rule_value?: string
  error_message?: string
  is_active?: boolean
}

export interface SubmissionFormField {
  id: string
  section?: string | null
  label: string
  key: string
  field_type: string
  help_text?: string
  placeholder?: string
  link_url?: string
  example_value?: Record<string, unknown>
  default_value?: unknown
  required: boolean
  validation_rules?: Record<string, unknown>
  visible_if?: Record<string, unknown>
  required_if?: Record<string, unknown>
  enabled_if?: Record<string, unknown>
  media_config?: Record<string, unknown>
  ordering?: number
  is_active?: boolean
  options?: FormFieldOption[]
  field_rules?: FormFieldRule[]
}

export interface SubmissionFormSection {
  id: string
  title: string
  code: string
  description?: string
  ordering?: number
  is_active?: boolean
  fields: SubmissionFormField[]
}

export interface SubmissionFormDefinition {
  id: string
  title: string
  code: string
  description?: string
  version: number
  active: boolean
  sections: SubmissionFormSection[]
  fields: SubmissionFormField[]
}


export interface ApiFAQ {
  id: string
  question: string
  answer: string
  ordering?: number
  is_public: boolean
}


export interface Guideline {
  id: string
  title: string
  content: string
  document_url?: string
  audience?: string
  is_public: boolean
}


export interface SupportRequestPayload {
  request_type?: string
  subject: string
  description: string
  email: string
  phone_number?: string
  submission?: string
}

export interface SupportRequest {
  id: string
  request_type?: string
  subject: string
  description: string
  email: string
  phone_number?: string
  submission?: string
  status: string
  resolution_notes?: string
  created_by?: string
  created_at: string
}


export interface SubmissionPayload {
  program: string
  submission_type: SubmissionType
  title: string
  team?: string
  draft_data?: Record<string, unknown>
  current_section_code?: string
  metadata?: Record<string, unknown>
}

export interface Submission {
  id: string
  reference_number: string
  program: string
  program_detail?: unknown
  submission_type: SubmissionType
  innovator: string
  team?: string
  title: string
  current_status: string
  submitted_at: string
  locked_for_editing: boolean
  latest_version_number: number
  form_version_number: number
  metadata?: Record<string, unknown>
  responses?: unknown[]
}

export interface SubmissionDocument {
  id: string
  field_key?: string
  original_filename?: string
  mime_type?: string
  size_bytes?: number
  file?: string
  document_type?: 'file' | 'url'
  external_url?: string
  availability?: 'available' | 'external' | 'missing'
}


export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}


export interface ApiErrorData {
  detail?: string
  non_field_errors?: string[]
  [key: string]: unknown
}
