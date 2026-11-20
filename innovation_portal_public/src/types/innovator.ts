/**
 * Types for the innovator screens (U3: 2.0 to 2.5) and the shared form renderer.
 *
 * Sources:
 * - main: code sign-in, notifications, preferences, media (B1).
 * - B2 (on main since 4facb3b): quick start, drafts, steps,
 *   /api/me/*, similar ideas, timeline.
 * - B4 (on main): the published form.
 * - B3 (on main): messages, open questions, notification categories.
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
  /** Wait this long before offering "Resend code" (R-4). */
  resend_after_seconds: number
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
  /** Load GET /api/forms/{form_id}/published/ for this draft (R-6). */
  form_id: string | null
  /** Latest published version; null if the form was never published. */
  form_version_id: string | null
}

export interface SubmitRequest {
  consent: true
  create_account?: boolean
  /** Still accepted; prefer first_name and last_name (R-1). */
  name?: string
  first_name?: string
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
  first_name: string
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

/** The short 5-step bar on idea cards (R-5 a). Empty for drafts. */
export interface StageDot {
  code: string
  name: string
  status: StageStatus
}

/** The officer's open question (R-5 c). */
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
  /** The raw status ("draft" for drafts), R-16. */
  status: string
  percent_complete: number
  last_change: string | null
  needs_action_reason: string
  reply_by: string | null
  stages: StageDot[]
  submitted_at: string | null
  /** Set for finished ideas only. */
  decided_at: string | null
  /** True for finished ideas with feedback. */
  has_feedback: boolean
  open_question: OpenQuestion | null
  /** Only on summary.active_idea (R-5 d). */
  unread_messages?: number
  /** Only on summary.active_idea (R-5 d). */
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
      open_question: OpenQuestion | null
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

/** What a notification or update is about: {type, id, slug}, null where not set. */
export interface UpdateLink {
  type: 'idea' | 'challenge' | 'post' | string
  id: string | null
  slug?: string | null
}

export type UpdateItem =
  | {
      type: 'notification'
      id: string
      title: string
      body: string
      is_read: boolean
      at: string
      /** Picks the icon (R-5 f). */
      notification_type: string
      link: UpdateLink | null
    }
  | {
      type: 'status_change'
      id: string
      idea_id: string
      reference: string
      title: string
      status: string
      at: string
      notification_type: 'status_change'
      link: UpdateLink
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
  /** TODO(R-5 e): the B5 public list item fields; comes with B5. */
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

/** One answer as the submission stored it (label and type are snapshots). */
export interface SubmissionAnswer {
  id: string
  field_key: string
  field_label: string
  field_type: string
  value: unknown
}

/** GET /api/submissions/{id}/tracking-detail/: the Submission plus its timeline. Only fields 2.4 uses. */
export interface TrackedIdea {
  id: string
  reference_number: string
  title: string
  current_status: string
  submitted_at: string | null
  sector: string | null
  program_detail: { id: string; title: string; is_general_intake: boolean } & Record<string, unknown>
  responses: SubmissionAnswer[]
  timeline: Timeline
}

// ── 2.4 Messages (B3, apps/communications/messaging.py) ───────────────────

export interface MessageAttachment {
  id: string
  kind: 'image' | 'video' | 'document' | 'audio'
  url: string
  mime_type: string
  duration_seconds: number | null
  original_filename: string
}

export interface IdeaMessage {
  id: string
  author_role: 'applicant' | 'officer' | 'system'
  /** label: "Kago T., Innovation officer"; the system's is "CEDA Innovation". */
  author: { name: string; role: string; label: string }
  body: string
  attachments: MessageAttachment[]
  reply_by: string | null
  is_question: boolean
  answered_at: string | null
  /** Read by the person viewing. */
  read: boolean
  created_at: string
}

/** GET /api/me/ideas/{id}/messages/ */
export interface MessageThreadPayload {
  idea_id: string
  open_question: IdeaMessage | null
  results: IdeaMessage[]
}

export interface NewMessage {
  body: string
  /** MediaAsset ids from POST /api/media/. */
  attachments?: string[]
}

/** One idea in GET /api/me/messages/recent/ (the 2.2 side panel). */
export interface RecentThread {
  idea_id: string
  reference: string
  title: string
  unread: number
  has_open_question: boolean
  latest: IdeaMessage
}

export interface RecentMessages {
  total_unread: number
  results: RecentThread[]
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
  category: NotificationCategory
  link: UpdateLink | null
  /** Questions with a reply-by date, for the "Reply by 25 Nov" tag. */
  due_at: string | null
}

export type NotificationChannel = 'web' | 'whatsapp' | 'sms' | 'email'

export interface NotificationPreferences {
  preferences: Record<string, Partial<Record<NotificationChannel, boolean>>>
  notification_types: Array<{ code: string; label: string }>
  channels: Array<{ code: NotificationChannel; label: string }>
}

// ── 2.3 Published form (B4, on main) ───────────────────────────────────────
// GET /api/forms/{id}/published/?lang= returns the latest FormVersion with
// every text already in one language (English when a translation is missing).
// Shape: apps/programs/form_schema.py.

export type FieldWidth = 'quarter' | 'half' | 'three_quarter' | 'full'

export type FormFieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'email' | 'phone' | 'url'
  | 'boolean' | 'select' | 'multiselect' | 'file'
  | 'radio' | 'checkboxes' | 'yes_no' | 'district' | 'omang_id' | 'media'
  | 'heading' | 'paragraph'

/** Layout-only types store no answer. */
export const LAYOUT_FIELD_TYPES: ReadonlySet<FormFieldType> = new Set(['heading', 'paragraph'])

export type ConditionOp = 'equals' | 'not_equals' | 'in' | 'is_empty' | 'is_not_empty'

export interface ConditionClause {
  field: string
  op: ConditionOp
  value?: unknown
}

/** The shape B4 documents. An unset condition comes as {}. */
export interface Condition {
  all?: ConditionClause[]
}

export interface FormOption {
  id: string
  value: string
  label: string
  /** Second line on radio cards; empty string when not set. */
  description: string
}

export interface FormValidationRule {
  rule_type: 'min_length' | 'max_length' | 'min_value' | 'max_value' | 'regex'
    | 'file_type' | 'file_size_mb' | 'exact_length' | 'required_extension' | string
  rule_value: string
  error_message: string
}

export interface FormField {
  id: string
  key: string
  type: FormFieldType
  label: string
  help_text: string
  placeholder: string
  required: boolean
  is_challenge_question: boolean
  width: FieldWidth
  is_active: boolean
  link_url: string
  options: FormOption[]
  rules: FormValidationRule[]
  visible_if: Condition
  required_if: Condition
  enabled_if: Condition
  validation_rules: Record<string, unknown>
  media_config: Record<string, unknown>
  default_value: unknown
  example_value: unknown
}

export interface FormRow {
  row: number
  fields: FormField[]
}

export interface FormStep {
  id: string
  code: string
  title: string
  description: string
  tips: string[]
  is_active: boolean
  rows: FormRow[]
}

export interface PublishedForm {
  id: string
  name: string
  description: string
  languages: Lang[]
  /** The language the texts are in. */
  language: Lang
  steps: FormStep[]
  /** Old fields that are in no step. */
  loose_fields: FormField[]
  version: { id: string; number: number; published_at: string }
}
