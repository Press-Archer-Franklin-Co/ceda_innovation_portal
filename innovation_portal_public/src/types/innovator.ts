/**
 * Types for the innovator screens (U3: 2.0 to 2.5) and the shared form renderer.
 *
 * Sources:
 * - main: code sign-in, notifications, preferences, media (B1).
 * - B2 (on main since 4facb3b): quick start, drafts, steps,
 *   /api/me/*, similar ideas, timeline.
 * - B3 and B4 are not built yet. Their types follow the prompts and are marked
 *   TODO(B3) / TODO(B4) until the backend lane publishes the schema.
 * - Fields the screens need but no prompt plans are optional and marked
 *   TODO(R-<n>) with the request number in ~/ceda-coord/requests.md.
 */

export type Lang = 'en' | 'tn'
export type BilingualText = { en: string; tn?: string }

/** Many endpoints wrap their payload as { success, message, data }. */
export interface Envelope<T> {
  success: boolean
  message: string
  data?: T
  errors?: Record<string, unknown>
}

export interface SectorRef {
  id: string
  slug: string
  name: string
}

// ── 2.0 Sign in with a code (main) ─────────────────────────────────────────

export type OtpTarget = { phone: string } | { email: string }

export interface OtpRequestResult {
  target_type: 'phone' | 'email'
  channel: string
  /** Masked destination, for example "+267 71 ••• 567". */
  destination_hint: string
  expires_in_seconds: number
  /** TODO(R-4): not returned yet; the screen falls back to 60 seconds. */
  resend_after_seconds?: number
}

// ── Quick start and drafts (B2) ────────────────────────────────────────────

export interface QuickStartRequest {
  title: string
  sector: string
  program_id?: string
}

export interface QuickStartResult {
  draft_id: string
  resume_token: string
  /** Seconds until the resume token expires. */
  expires_in: number
}

export interface DraftStepStatus {
  [sectionCode: string]: 'done' | 'not_done' | string
}

export interface StepSaveResult {
  saved_at: string
  step_status: DraftStepStatus
  percent_complete: number
  /** Field key to a list of messages. Empty when the step is valid. */
  errors: Record<string, string[] | string>
}

/**
 * ApplicationDraft in /api/schema/. The schema types percent_complete and
 * guest_phone_verified as strings (untyped method fields); the API sends a
 * number and a boolean.
 */
export interface IntakeDraft {
  id: string
  reference_number: string
  program: string
  /** The full Program; only the fields the screens use are typed here. */
  program_detail: {
    id: string
    title: string
    slug: string
    is_general_intake: boolean
    next_panel_at?: string | null
  } & Record<string, unknown>
  submission_type: 'idea' | 'hackathon_application' | 'innovation_challenge'
  sector: string | null
  is_general_idea: boolean
  percent_complete: number
  guest_phone_verified: boolean
  innovator: string | null
  team: string | null
  title: string
  status: 'draft' | 'submitted'
  version: number
  draft_data: Record<string, unknown>
  progress_metadata: Record<string, unknown>
  current_section_code: string
  submitted_submission: string | null
  submitted_at: string | null
  metadata: Record<string, unknown>
  channel: 'web' | 'whatsapp' | 'ussd' | 'office'
  /** TODO(R-6): which published form to load for this draft. */
  form_id?: string
  /** TODO(R-6) */
  form_version_id?: string
}

export interface SubmitRequest {
  consent: true
  create_account?: boolean
  name?: string
  /** TODO(R-1): two boxes on screen 1.2; until then they are joined into `name`. */
  first_name?: string
  /** TODO(R-1) */
  last_name?: string
}

export interface NextStep {
  name: string
  explanation: string
  usual_duration: string
}

export interface SubmitResult {
  submission_id: string
  reference: string
  title: string
  sector: SectorRef | null
  is_guest: boolean
  next_steps: NextStep[]
  copy_sent_to: { channel: 'email' | 'sms' | 'whatsapp' | string; to: string } | null
  account: { created: boolean; sign_in_with: 'phone_code' | 'email' } | null
  /** TODO(R-1) */
  first_name?: string
}

// ── Similar ideas (B2) ─────────────────────────────────────────────────────

export interface SimilarIdea {
  kind: 'published_idea' | 'story'
  title: string
  year: number | null
  place: string
}

// ── 2.1 and 2.2: /api/me/* (B2) ────────────────────────────────────────────

export type IdeaState = 'drafts' | 'needs_action' | 'in_review' | 'finished'
export type IdeasFilter = 'all' | IdeaState

export type StageStatus = 'done' | 'current' | 'upcoming' | 'skipped'

/** TODO(R-5): the short 5-step bar on idea cards. */
export interface StageDot {
  name: string
  status: StageStatus
}

/** TODO(R-5): the officer's open question; B3 fills it. */
export interface OpenQuestion {
  officer_first_name: string
  excerpt: string
  reply_by: string | null
  message_id: string
}

export interface IdeaItem {
  id: string
  kind: 'draft' | 'submission'
  state: IdeaState
  reference: string
  title: string
  sector: SectorRef | null
  program: { id: string; title: string; is_general_intake: boolean }
  stage: string
  percent_complete: number
  last_change: string | null
  needs_action_reason: string
  reply_by: string | null
  /** TODO(R-5) */
  stages?: StageDot[]
  /** TODO(R-5) */
  submitted_at?: string | null
  /** TODO(R-5) */
  decided_at?: string | null
  /** TODO(R-5) */
  has_feedback?: boolean
  /** TODO(R-5) */
  open_question?: OpenQuestion | null
  /** TODO(R-5): only on summary.active_idea. */
  unread_messages?: number
  /** TODO(R-5): only on summary.active_idea. */
  unread_updates?: number
}

export interface IdeasList {
  filter: IdeasFilter
  counts: Record<IdeasFilter, number>
  results: IdeaItem[]
}

export type NextAction =
  | {
      type: 'answer_question'
      idea_id: string
      reference: string
      title: string
      detail: string
      reply_by: string | null
      /** TODO(R-5) */
      open_question?: OpenQuestion
    }
  | {
      type: 'finish_draft'
      idea_id: string
      reference: string
      title: string
      detail: string
      percent_complete: number
    }
  | { type: 'complete_profile'; detail: string; percent_complete: number }

export interface MySummary {
  active_idea: IdeaItem | null
  next_action: NextAction | null
  unread_notifications: number
}

export interface UpdateLink {
  type: 'idea' | 'challenge' | 'post' | string
  id: string
  slug?: string
  url?: string
}

export type UpdateItem =
  | {
      type: 'notification'
      id: string
      title: string
      body: string
      is_read: boolean
      at: string
      /** TODO(R-5): picks the icon. */
      notification_type?: string
      /** TODO(R-5) */
      link?: UpdateLink | null
    }
  | {
      type: 'status_change'
      id: string
      idea_id: string
      reference: string
      title: string
      status: string
      at: string
    }

export interface UpdatesFeed {
  since: string
  results: UpdateItem[]
}

export interface RecommendedChallenge {
  id: string
  title: string
  slug: string
  program_type: string
  closes_at: string | null
  sectors: SectorRef[]
  matched_sectors: SectorRef[]
  can_enter: boolean
  /** TODO(R-5): the B5 public list item fields. */
  summary?: string
  support_headline?: string
  status?: 'open' | 'upcoming' | 'closed'
  opens_at?: string | null
  days_left?: number | null
  window_progress?: number | null
}

export interface ChallengeMatch extends RecommendedChallenge {
  answers_reused: number
  questions_left: number
}

export interface ChallengeMatches {
  idea_id: string
  results: ChallengeMatch[]
  detail?: string
}

export interface UnansweredQuestion {
  key: string
  label: string
  section_code: string
  required: boolean
}

export interface LinkChallengeResult {
  draft: IntakeDraft
  copied_fields: string[]
  unanswered_questions: UnansweredQuestion[]
}

export interface ProfileCompleteness {
  percent_complete: number
  missing_fields: Array<{ field: string; label: string }>
}

// ── 2.4 Timeline (B2) ──────────────────────────────────────────────────────

export interface TimelineStage {
  code: string
  name: string
  status: StageStatus
  reached_at: string | null
  explanation: string
  usual_duration: string
  /** Officer first name and initial, current stage only. Empty in public tracking. */
  officer: string
}

export interface Timeline {
  stages: TimelineStage[]
  current_stage_code: string
  next_panel_at: string | null
}

// ── 2.4 Messages (B3, not built) ───────────────────────────────────────────

/** TODO(B3): shape from the B3 prompt; confirm against the backend schema. */
export interface IdeaMessage {
  id: string
  author_role: 'applicant' | 'officer' | 'system'
  body: string
  attachments: MediaAsset[]
  reply_by: string | null
  created_at: string
  read_at?: string | null
  /** TODO(R-7): "Kago T." or "CEDA Innovation". */
  author_name?: string
  /** TODO(R-7): "Innovation officer". */
  author_title?: string
}

export interface NewMessage {
  body: string
  /** MediaAsset ids from POST /api/media/. */
  attachments?: string[]
}

/** TODO(B3): latest message per idea, for the 2.2 side panel. */
export interface RecentThread {
  idea_id: string
  idea_title: string
  last_message: IdeaMessage
  unread: number
}

// ── Media (main, B1) ───────────────────────────────────────────────────────

export interface MediaAsset {
  id: string
  kind: 'image' | 'video' | 'document' | 'audio'
  url: string
  monochrome_url: string | null
  captions_url: string | null
  original_filename: string
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  duration_seconds: number | null
  alt_text: BilingualText | Record<string, string> | null
  uploaded_by: string | null
  created_at: string
}

// ── 2.5 Notifications (main) ───────────────────────────────────────────────

export type NotificationCategory = 'ideas' | 'challenges' | 'news'

export interface NotificationItem {
  id: string
  notification_type: string
  title: string
  body: string
  is_read: boolean
  created_at: string
  /** TODO(R-8) */
  category?: NotificationCategory
  /** TODO(R-8) */
  link?: UpdateLink | null
  /** TODO(R-8): for the "Reply by 25 Nov" tag. */
  due_at?: string | null
}

export type NotificationChannel = 'web' | 'whatsapp' | 'sms' | 'email'

export interface NotificationPreferences {
  preferences: Record<string, Partial<Record<NotificationChannel, boolean>>>
  notification_types: Array<{ code: string; label: string }>
  channels: Array<{ code: NotificationChannel; label: string }>
}

// ── 2.3 Published form (B4, not built) ─────────────────────────────────────

export type FieldWidth = 'quarter' | 'half' | 'three_quarter' | 'full'

export type FormFieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'email' | 'phone' | 'url'
  | 'boolean' | 'select' | 'multiselect' | 'file'
  // Added by B4:
  | 'radio' | 'checkboxes' | 'yes_no' | 'district' | 'omang_id' | 'media'
  | 'heading' | 'paragraph'

export type ConditionOp = 'equals' | 'not_equals' | 'in' | 'is_empty' | 'is_not_empty'

/** The one condition shape B4 documents. */
export interface Condition {
  all: Array<{ field: string; op: ConditionOp; value?: unknown }>
}

export interface FormOption {
  value: string
  label: string
  /** TODO(R-6): second line on radio cards. */
  description?: string
}

export interface FormValidationRule {
  rule_type: 'min_length' | 'max_length' | 'min_value' | 'max_value' | 'regex'
    | 'file_type' | 'file_size_mb' | 'exact_length' | 'required_extension'
  rule_value: string
  error_message: string
}

export interface FormField {
  key: string
  field_type: FormFieldType
  label: string
  help_text: string
  placeholder: string
  required: boolean
  width: FieldWidth
  row: number
  ordering: number
  options: FormOption[]
  rules: FormValidationRule[]
  visible_if: Condition | null
  required_if: Condition | null
  enabled_if?: Condition | null
  media_config?: Record<string, unknown>
  /** TODO(R-6): "Challenge question" badge. */
  is_challenge_question?: boolean
}

export interface FormStep {
  code: string
  title: string
  description: string
  ordering: number
  fields: FormField[]
  /** TODO(R-6): "Tips for this step". */
  tips?: string[]
}

/** TODO(B4): GET /api/forms/{id}/published/?lang= */
export interface PublishedForm {
  form_id: string
  version_id: string
  version_number: number
  lang: Lang
  languages: Lang[]
  steps: FormStep[]
}
