import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight,
  Layers, Upload, X, Clock, AlertCircle, Save, BookOpen,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { programsService } from '../services/programs.service'
import { submissionsService } from '../services/submissions.service'
import { documentsService } from '../services/documents.service'
import DocumentLink from '../components/documents/DocumentLink'
import { profileService } from '../services/profile.service'
import { parseApiError } from '../utils/apiError'
import type { Program, SubmissionFormDefinition, SubmissionFormField } from '../types/api'
import type { SubmissionDetail, SubmissionFileDocument } from '../services/submissions.service'
import VerificationRequired from '../components/ui/VerificationRequired'
import Countdown, { useNow } from '../components/challenges/Countdown'

const CONSENT_MESSAGE = 'Please tick the box to agree to the terms and privacy notice before you send your idea.'

/** True when the API refused the submission because consent was not given (code consent_required). */
function isConsentRequired(err: unknown): boolean {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  return JSON.stringify(data ?? '').includes('consent_required')
}


function asProgramType(program: Program) {
  const v = typeof program.program_type === 'string'
    ? program.program_type
    : String((program.program_type as { code?: string })?.code ?? '')
  return v.toLowerCase()
}

function programAccent(typeCode: string) {
  if (typeCode === 'hackathon')     return '#9A5200'
  if (typeCode === 'challenge_call') return '#1D4ED8'
  return '#A01E0A'
}

function programTypeLabel(typeCode: string) {
  if (typeCode === 'hackathon')     return 'Hackathon'
  if (typeCode === 'challenge_call') return 'Challenge Call'
  return 'Idea Submission'
}

function fmtDate(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fieldDefault(field: SubmissionFormField) {
  if (field.field_type === 'boolean') return false
  if (field.field_type === 'multiselect') return []
  return typeof field.default_value === 'string' || typeof field.default_value === 'number' || typeof field.default_value === 'boolean'
    ? field.default_value : ''
}

function deriveAge(values: Record<string, unknown>): number | null {
  const raw = values.birthday ?? values.date_of_birth ?? values.age_group
  if (!raw) return null
  const date = new Date(String(raw))
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - date.getFullYear()
  const beforeBirthday = (now.getMonth() < date.getMonth()) || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())
  if (beforeBirthday) years -= 1
  return years
}

function normalizeField(field: SubmissionFormField): SubmissionFormField {
  if (field.key === 'age_group') {
    return {
      ...field,
      label: 'Birthday',
      field_type: 'date',
      help_text: field.help_text || 'Your date of birth is used to calculate age.',
      required: true,
    }
  }
  return field
}

function profilePrefill(user: { first_name: string; last_name: string; email: string; profile?: unknown | null } | null) {
  if (!user) return {}
  const profile = (user.profile ?? {}) as Record<string, unknown>
  return {
    first_name: user.first_name,
    last_name: user.last_name,
    email_address: user.email,
    contact_number: (user as { phone_number?: string }).phone_number,
    country_code: profile.country_code,
    country: profile.country,
    id_passport_number: profile.id_passport_number ?? profile.national_id,
    gender: profile.gender,
    birthday: profile.birthday ?? profile.date_of_birth,
    linkedin_link: profile.linkedin_profile ?? profile.linkedin_url,
    linkedin_profile: profile.linkedin_profile ?? profile.linkedin_url,
    website_link: profile.website_portfolio ?? profile.portfolio_url,
    website_portfolio: profile.website_portfolio ?? profile.portfolio_url,
    person_type: profile.person_type,
    person_type_other: profile.person_type_other,
  } as Record<string, unknown>
}

function toTitleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && value !== ''
}

function containsValue(actual: unknown, expected: unknown) {
  if (Array.isArray(actual)) return actual.includes(expected)
  if (actual && typeof actual === 'object') return Object.values(actual as Record<string, unknown>).includes(expected)
  return String(actual ?? '').includes(String(expected ?? ''))
}

function numeric(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function evaluateCondition(definition: Record<string, unknown> | undefined, values: Record<string, unknown>): boolean {
  if (!definition || Object.keys(definition).length === 0) return false
  const conditions = definition.conditions as Array<Record<string, unknown>> | undefined
  const operator = String(definition.operator ?? 'equals').toLowerCase()
  if (conditions?.length) {
    const results = conditions.map((item) => evaluateCondition(item, values))
    return String(definition.operator ?? 'AND').toUpperCase() === 'OR' ? results.some(Boolean) : results.every(Boolean)
  }
  const fieldKey = String(definition.field ?? '')
  const actual = values[fieldKey]
  const expected = definition.value
  switch (operator) {
    case 'equals':              return actual === expected
    case 'not_equals':          return actual !== expected
    case 'in':                  return Array.isArray(expected) && expected.includes(actual)
    case 'not_in':              return Array.isArray(expected) && !expected.includes(actual)
    case 'exists':              return hasValue(actual)
    case 'not_exists':          return !hasValue(actual)
    case 'greater_than':        return numeric(actual) > numeric(expected)
    case 'less_than':           return numeric(actual) < numeric(expected)
    case 'greater_than_or_equal': return numeric(actual) >= numeric(expected)
    case 'less_than_or_equal':  return numeric(actual) <= numeric(expected)
    case 'contains':            return containsValue(actual, expected)
    case 'not_contains':        return !containsValue(actual, expected)
    default:                    return false
  }
}

function resolveFieldState(field: SubmissionFormField, values: Record<string, unknown>) {
  const visible  = !field.visible_if  || Object.keys(field.visible_if).length  === 0 ? true : evaluateCondition(field.visible_if, values)
  const enabled  = !field.enabled_if  || Object.keys(field.enabled_if).length  === 0 ? true : evaluateCondition(field.enabled_if, values)
  const required = Boolean(field.required) || (!!field.required_if && Object.keys(field.required_if).length > 0 && evaluateCondition(field.required_if, values))

  if (field.key === 'person_type_other') {
    const personType = String(values.person_type ?? '').toLowerCase()
    const show = personType === 'other'
    return { visible: show, enabled: show, required: show }
  }

  return { visible, enabled, required }
}

function validateField(field: SubmissionFormField, value: unknown, files: File[] = [], required: boolean) {
  const messages: string[] = []
  const candidate = field.field_type === 'file' ? (files.length > 0 ? files : value) : value
  if (required && !hasValue(candidate)) { messages.push('This field is required.'); return messages }
  if (!hasValue(candidate)) return messages
  for (const rule of field.field_rules ?? []) {
    if (rule.is_active === false) continue
    const raw = rule.rule_value ?? ''
    if (rule.rule_type === 'min_length'  && String(value ?? '').length < Number(raw)) messages.push(rule.error_message || `Minimum ${raw} characters.`)
    if (rule.rule_type === 'max_length'  && String(value ?? '').length > Number(raw)) messages.push(rule.error_message || `Maximum ${raw} characters.`)
    if (rule.rule_type === 'exact_length'&& String(value ?? '').length !== Number(raw)) messages.push(rule.error_message || `Must be exactly ${raw} characters.`)
    if (rule.rule_type === 'min_value'   && numeric(value) < Number(raw)) messages.push(rule.error_message || `Minimum value is ${raw}.`)
    if (rule.rule_type === 'max_value'   && numeric(value) > Number(raw)) messages.push(rule.error_message || `Maximum value is ${raw}.`)
    if (rule.rule_type === 'regex') {
      try { if (!new RegExp(String(raw)).test(String(value ?? ''))) messages.push(rule.error_message || 'Invalid format.') }
      catch { messages.push(rule.error_message || 'Invalid validation rule.') }
    }
    if (rule.rule_type === 'required_extension' && files.some((f) => !f.name.toLowerCase().endsWith(String(raw).toLowerCase()))) messages.push(rule.error_message || `File must be ${raw}.`)
    if (rule.rule_type === 'file_size_mb' && files.some((f) => f.size > Number(raw) * 1024 * 1024)) messages.push(rule.error_message || `File must be under ${raw} MB.`)
    if (rule.rule_type === 'file_type') {
      const allowed = String(raw).split(',').map((s) => s.trim()).filter(Boolean)
      if (files.some((f) => f.type && allowed.length > 0 && !allowed.includes(f.type))) messages.push(rule.error_message || `Allowed types: ${allowed.join(', ')}.`)
    }
  }
  return messages
}

function getFileItems(raw: unknown): SubmissionFileDocument[] {
  if (!raw) return []
  if (typeof raw === 'string') {
    return raw.startsWith('http') ? [{ id: '', file_url: raw }] : []
  }
  if (Array.isArray(raw)) {
    return raw.filter((item): item is SubmissionFileDocument => Boolean(item) && typeof item === 'object')
  }
  if (typeof raw === 'object') {
    return [raw as SubmissionFileDocument]
  }
  return []
}

function submissionToValues(submission: SubmissionDetail): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const response of submission.responses ?? []) {
    next[response.field_key] = response.value
    if (response.field_key === 'birthday' && next.age_group === undefined) {
      next.age_group = response.value
    }
    if (response.field_key === 'email' && next.email_address === undefined) {
      next.email_address = response.value
    }
    if (response.field_key === 'linkedin_profile' && next.linkedin_link === undefined) {
      next.linkedin_link = response.value
    }
    if (response.field_key === 'website_portfolio' && next.website_link === undefined) {
      next.website_link = response.value
    }
  }
  return next
}


function relativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 10)  return 'just now'
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}


function LockedState() {
  const howItWorks = [
    { step: '01', title: 'Pick a Challenge', body: 'Browse active programs and choose the one that fits your idea best.' },
    { step: '02', title: 'Complete the Form', body: 'Answer questions designed specifically for that program.' },
    { step: '03', title: 'Submit & Track',   body: 'Submit once and follow your progress from your Dashboard.' },
  ]
  return (
    <div className="bg-white">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="relative rounded-3xl px-10 py-12 overflow-hidden" style={{ background: 'linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)' }}>
          <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
          <div className="relative z-10 max-w-xl">
            <p className="eyebrow-white mb-3">Innovation Portal</p>
            <h1 className="text-4xl font-extrabold text-white mb-3 leading-tight">Got an idea?<br />Let&apos;s hear it.</h1>
            <p className="text-white/65 text-sm leading-relaxed mb-7 max-w-sm">
              Submit your innovation to an active challenge, get reviewed by the CEDA committee, and track your progress from concept to reality.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/login" className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold bg-white text-[#A01E0A] hover:bg-gray-50 transition-colors">
                Log In to Submit
              </Link>
              <Link to="/signup" className="inline-flex items-center gap-1.5 justify-center px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/30 text-white hover:bg-white/10 transition-colors">
                Create Account <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <p className="eyebrow-muted mb-1.5">Process</p>
        <h2 className="text-xl font-bold text-gray-900 mb-7">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {howItWorks.map(({ step, title, body }) => (
            <div key={step} className="surface rounded-2xl p-6">
              <span className="text-[11px] font-bold tracking-widest text-[#F0641E] mb-3 block">{step}</span>
              <h3 className="font-bold text-gray-900 mb-2 text-[15px]">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function UnverifiedState({ email }: { email?: string }) {
  return (
    <div className="bg-white">
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <VerificationRequired
          email={email}
          title="Verify your email before submitting"
          message="We need to confirm your email address before you can start or edit a submission."
          variant="card"
        />
        <div className="mt-6 text-center">
          <Link to="/dashboard" className="text-sm font-semibold text-[#A01E0A] hover:underline">
            Back to dashboard
          </Link>
        </div>
      </section>
    </div>
  )
}


function ProgramPicker({ programs, loading, onSelect }: {
  programs: Program[]
  loading: boolean
  onSelect: (id: string) => void
}) {
  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
    </div>
  )

  if (programs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Layers size={20} className="text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-500">No active programs right now</p>
      <p className="text-xs text-gray-400 mt-1">Check back soon — new challenges are added regularly.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {programs.map((p) => {
        const typeCode  = asProgramType(p)
        const accent    = programAccent(typeCode)
        const closeDate = fmtDate(p.closing_date)

        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="w-full text-left rounded-2xl border border-gray-100 bg-white hover:border-gray-300 hover:shadow-md active:scale-[0.995] transition-all duration-150 overflow-hidden group cursor-pointer"
          >
            <div className="flex items-stretch">
              <div className="w-1 flex-shrink-0" style={{ background: accent }} />
              <div className="flex-1 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: accent }}>
                      {programTypeLabel(typeCode)}
                    </span>
                    <h3 className="font-bold text-gray-900 mt-0.5 text-[15px] leading-snug truncate">{p.title}</h3>
                    {p.description && (
                      <p className="text-[13px] text-gray-400 mt-1 line-clamp-1 leading-relaxed">{p.description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center transition-colors">
                    <ArrowRight size={14} className="text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
                {closeDate && (
                  <p className="text-[11px] text-gray-400 mt-2.5">Closes {closeDate}</p>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}


function SectionSidebar({
  sections, currentStep, completedUpTo, accent, onSaveExit, saving,
}: {
  sections: { id: string; title: string; code: string }[]
  currentStep: number
  completedUpTo: number
  accent: string
  onSaveExit: () => void
  saving: boolean
}) {
  return (
    <aside className="hidden lg:flex flex-col gap-1">
      <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3 px-3">Sections</p>
      {sections.map((section, i) => {
        const isCompleted = i < completedUpTo
        const isCurrent   = i === currentStep
        const isPending   = i > completedUpTo

        return (
          <div
            key={section.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
              isCurrent
                ? 'bg-[#A01E0A]/[0.07] text-[#A01E0A] font-semibold'
                : isCompleted
                ? 'text-gray-500 font-medium'
                : 'text-gray-400'
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold transition-all ${
              isCompleted
                ? 'bg-[#A01E0A] text-white'
                : isCurrent
                ? 'text-white ring-2 ring-offset-1'
                : 'bg-gray-100 text-gray-400'
            }`} style={isCurrent ? { background: accent, boxShadow: `0 0 0 2px ${accent}40` } : {}}>
              {isCompleted
                ? <CheckCircle2 size={13} />
                : <span>{i + 1}</span>
              }
            </div>
            <span className={`leading-snug truncate ${isPending ? 'opacity-50' : ''}`}>{section.title}</span>
          </div>
        )
      })}

      <div className="mt-auto pt-6 border-t border-gray-100 mt-6">
        <button
          onClick={onSaveExit}
          disabled={saving}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors w-full cursor-pointer disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save & Exit'}
        </button>
      </div>
    </aside>
  )
}


function MobileProgress({ sections, currentStep }: {
  sections: { id: string; title: string }[]
  currentStep: number
}) {
  const total = sections.length
  const pct   = total > 1 ? Math.round(((currentStep) / (total - 1)) * 100) : 0

  return (
    <div className="lg:hidden space-y-2 mb-6">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-semibold text-gray-800">{sections[currentStep]?.title}</span>
        <span>Step {currentStep + 1} of {total}</span>
      </div>
      <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#5A3C32,#F0641E)' }}
        />
      </div>
    </div>
  )
}


function AutosaveBadge({ lastSaved, saving }: { lastSaved: Date | null; saving: boolean }) {
  const [, tick] = useState(0)

  useEffect(() => {
    if (!lastSaved) return
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [lastSaved])

  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400">
        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Saving…
      </span>
    )
  }
  if (lastSaved) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400">
        <CheckCircle2 size={12} className="text-[#F0641E]" />
        Saved {relativeTime(lastSaved)}
      </span>
    )
  }
  return null
}


const inputCls = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/20 focus:border-[#A01E0A]/50 transition-all'
const errorInputCls = 'border-red-300 ring-2 ring-red-100 focus:ring-red-200 focus:border-red-400'

function withErrorClass(hasError?: boolean) {
  return hasError ? `${inputCls} ${errorInputCls}` : inputCls
}

function FieldLabel({ field, required }: { field: SubmissionFormField; required: boolean }) {
  return (
    <label className="block text-sm font-semibold text-gray-800 mb-1.5">
      {field.label}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function FieldMeta({ field, error }: { field: SubmissionFormField; error?: string }) {
  return (
    <>
      {field.help_text && !error && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{field.help_text}</p>}
      {error && (
        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
          <AlertCircle size={11} className="flex-shrink-0" />
          {error}
        </p>
      )}
    </>
  )
}

function FieldControl({
  field, required, disabled, error, value, files, onChange, onFilesChange,
}: {
  field: SubmissionFormField; required: boolean; disabled: boolean; error?: string
  value: unknown; files: File[]; onChange: (value: unknown) => void; onFilesChange: (files: File[]) => void
}) {
  if (field.field_type === 'boolean') {
    return (
      <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${
        value ? 'border-[#A01E0A]/30 bg-[#A01E0A]/[0.03]' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}>
        <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          value ? 'bg-[#A01E0A] border-[#A01E0A]' : 'border-gray-300 bg-white'
        }`}>
          {Boolean(value) && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <input type="checkbox" className="sr-only" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span>
          <span className="block text-sm font-semibold text-gray-800">
            {field.label}
            {field.link_url && (
              <a
                href={field.link_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="ml-2 text-xs font-medium text-[#A01E0A] underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                View
              </a>
            )}
          </span>
          {field.help_text && <span className="block text-xs text-gray-400 mt-0.5 leading-relaxed">{field.help_text}</span>}
          {error && <span className="flex items-center gap-1 text-xs text-red-500 mt-1"><AlertCircle size={10} className="flex-shrink-0" />{error}</span>}
        </span>
      </label>
    )
  }

  if (field.field_type === 'textarea') {
    return (
      <div>
        <FieldLabel field={field} required={required} />
        <textarea
          className={withErrorClass(Boolean(error))}
          rows={5}
          placeholder={field.placeholder ?? ''}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <FieldMeta field={field} error={error} />
      </div>
    )
  }

  if (field.field_type === 'select') {
    return (
      <div>
        <FieldLabel field={field} required={required} />
        <select
          className={withErrorClass(Boolean(error))}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select an option…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.id ?? opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <FieldMeta field={field} error={error} />
      </div>
    )
  }

  if (field.field_type === 'multiselect') {
    const selected = Array.isArray(value) ? value.map(String) : []
    const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])
    return (
      <div>
        <FieldLabel field={field} required={required} />
        <div className="flex flex-wrap gap-2 mt-1">
          {(field.options ?? []).map((opt) => {
            const active = selected.includes(opt.value)
            return (
              <button
                key={opt.id ?? opt.value}
                type="button"
                onClick={() => !disabled && toggle(opt.value)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                  active
                    ? 'bg-[#A01E0A] text-white border-[#A01E0A]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <FieldMeta field={field} error={error} />
      </div>
    )
  }

  if (field.field_type === 'file') {
    const multiple = Boolean((field.media_config ?? {}).multiple)
    const accepted = Array.isArray((field.media_config ?? {}).accepted_types)
      ? ((field.media_config ?? {}).accepted_types as string[]).join(',')
      : undefined
    const existingFiles = files.length === 0 ? getFileItems(value) : []

    return (
      <div>
        <FieldLabel field={field} required={required} />
        <label className={`flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
          disabled ? 'opacity-50 cursor-not-allowed' : error ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white hover:border-[#A01E0A]/40 hover:bg-[#A01E0A]/[0.02]'
        }`}>
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
            <Upload size={18} className="text-gray-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600">
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
                : existingFiles.length > 0
                ? `${existingFiles.length} current file${existingFiles.length > 1 ? 's' : ''}`
                : 'Click to upload'}
            </p>
            {!files.length && <p className="text-xs text-gray-400 mt-0.5">{existingFiles.length > 0 ? 'Choose a replacement file if needed' : 'or drag and drop'}</p>}
          </div>
          <input
            type="file"
            className="sr-only"
            accept={accepted}
            multiple={multiple}
            disabled={disabled}
            onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
          />
        </label>
        {existingFiles.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {existingFiles.map((file, index) => {
              const label = file.original_filename || `Current file ${index + 1}`
              const legacyHref = file.file_url || file.file || file.external_url || ''
              return (
                <div key={file.id || `${field.key}-existing-${index}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#A01E0A] flex-shrink-0" />
                  {file.id ? (
                    <DocumentLink
                      documentId={file.id}
                      filename={file.original_filename}
                      className="text-xs text-[#A01E0A] hover:underline truncate text-left"
                    >
                      {label}
                    </DocumentLink>
                  ) : legacyHref ? (
                    <a href={legacyHref} target="_blank" rel="noreferrer" className="text-xs text-[#A01E0A] hover:underline truncate">
                      {label}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-600 truncate">{label}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {files.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {files.map((file) => (
              <div key={`${field.key}-${file.name}-${file.size}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F0641E] flex-shrink-0" />
                <span className="text-xs text-gray-600 truncate">{file.name}</span>
                <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
        )}
        <FieldMeta field={field} error={error} />
      </div>
    )
  }

  const inputType = field.field_type === 'number' ? 'number'
    : field.field_type === 'date'  ? 'date'
    : field.field_type === 'email' ? 'email'
    : field.field_type === 'phone' ? 'tel'
    : field.field_type === 'url'   ? 'url'
    : 'text'

  return (
    <div>
      <FieldLabel field={field} required={required} />
      <input
        className={withErrorClass(Boolean(error))}
        type={inputType}
        placeholder={field.placeholder ?? ''}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <FieldMeta field={field} error={error} />
    </div>
  )
}


function SubmissionForm() {
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const preselectedProgram = searchParams.get('program') ?? ''
  const resumeDraftId      = searchParams.get('draft')   ?? ''
  const editSubmissionId   = searchParams.get('submission') ?? ''
  const correctionMode     = !!editSubmissionId

  const [programs,        setPrograms]       = useState<Program[]>([])
  const [programId,       setProgramId]      = useState(preselectedProgram)
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const isChallengeEntry = selectedProgram ? asProgramType(selectedProgram) === 'innovation_challenge' : false
  const [programForm,     setProgramForm]    = useState<SubmissionFormDefinition | null>(null)
  const [loadingPrograms, setLoadingPrograms] = useState(true)
  const [loadingForm,     setLoadingForm]    = useState(false)
  const [draftLoading,    setDraftLoading]   = useState(false)
  const [title,           setTitle]          = useState('')
  const [values,          setValues]         = useState<Record<string, unknown>>({})
  const [files,           setFiles]          = useState<Record<string, File[]>>({})
  const [step,            setStep]           = useState(0)
  const [completedUpTo,   setCompletedUpTo]  = useState(0)
  const [submitted,       setSubmitted]      = useState(false)
  const [submitting,      setSubmitting]     = useState(false)
  const [saving,          setSaving]         = useState(false)
  const [lastSaved,       setLastSaved]      = useState<Date | null>(null)
  const [error,           setError]          = useState('')
  const [consent,         setConsent]        = useState(false)
  const [fieldErrors,     setFieldErrors]    = useState<Record<string, string>>({})
  const [refNumber,       setRefNumber]      = useState('')
  const [draftId,         setDraftId]        = useState<string | null>(null)
  const [editingSubmission, setEditingSubmission] = useState<SubmissionDetail | null>(null)
  const [versionMismatch, setVersionMismatch] = useState(false)
  const [latestProfile,   setLatestProfile]  = useState<Record<string, unknown> | null>(null)

  const focusField = (key: string) => {
    requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(`[data-field-key="${key}"]`)
      if (!container) return
      container.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const control = container.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]')
      control?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    if (correctionMode) {
      setLoadingPrograms(false)
      return
    }
    programsService.getPublic()
      .then((data) => {
        const ideaPrograms = data.filter((p) => {
          if (p.status !== 'published') return false
          const code = asProgramType(p)
          return code !== 'hackathon' && code !== 'challenge_call' && code !== 'innovation_challenge'
        })
        const challenge = preselectedProgram
          ? data.find((p) => asProgramType(p) === 'innovation_challenge' && (p.id === preselectedProgram || p.slug === preselectedProgram))
          : undefined
        setPrograms(challenge ? [challenge] : ideaPrograms)
        if (challenge) {
          setSelectedProgram(challenge); setProgramId(challenge.id)
        } else if (preselectedProgram) {
          const match = ideaPrograms.find((p) => p.id === preselectedProgram || p.slug === preselectedProgram)
          if (match) { setSelectedProgram(match); setProgramId(match.id) }
        } else if (ideaPrograms.length >= 1) {
          setSelectedProgram(ideaPrograms[0])
          setProgramId(ideaPrograms[0].id)
        }
      })
      .catch(() => setPrograms([]))
      .finally(() => setLoadingPrograms(false))
  }, [correctionMode, preselectedProgram])

  useEffect(() => {
    if (!editSubmissionId) return
    setDraftLoading(true)
    setError('')
    Promise.all([
      submissionsService.getSubmission(editSubmissionId),
      submissionsService.getTrackingDetail(editSubmissionId),
    ])
      .then(async ([submission, tracking]) => {
        if (!tracking.applicant_action_required || submission.locked_for_editing) {
          throw new Error('This submission is not currently editable.')
        }
        const program = await programsService.getById(submission.program)
        setEditingSubmission(submission)
        setSelectedProgram(program)
        setProgramId(program.id)
        setTitle(submission.title || '')
        setValues(submissionToValues(submission))
        setFiles({})
      })
      .catch((err) => setError(parseApiError(err)))
      .finally(() => setDraftLoading(false))
  }, [editSubmissionId])

  useEffect(() => {
    if (!user || correctionMode) return
    profileService.get()
      .then((profile) => setLatestProfile(profile as unknown as Record<string, unknown>))
      .catch(() => setLatestProfile(null))
  }, [correctionMode, user])

  useEffect(() => {
    if (!resumeDraftId) return
    setDraftLoading(true)
    submissionsService.getDraft(resumeDraftId)
      .then((draft) => {
        setDraftId(draft.id)
        setProgramId(draft.program)
        setTitle(draft.title !== 'Untitled idea' ? draft.title : '')
        if (draft.draft_data && typeof draft.draft_data === 'object') {
          setValues(draft.draft_data as Record<string, unknown>)
        }
      })
      .catch(() => {
        submissionsService.getMyDrafts()
          .then((drafts) => {
            const found = drafts.find((d) => d.id === resumeDraftId)
            if (found) {
              setDraftId(found.id)
              setProgramId(found.program)
              setTitle(found.title !== 'Untitled idea' ? found.title : '')
              if (found.draft_data && typeof found.draft_data === 'object') {
                setValues(found.draft_data as Record<string, unknown>)
              }
            }
          })
          .catch(() => {})
      })
      .finally(() => setDraftLoading(false))
  }, [resumeDraftId])

  useEffect(() => {
    if (!programId || selectedProgram?.id === programId || loadingPrograms) return
    const known = programs.find((p) => p.id === programId)
    if (known) { setSelectedProgram(known); return }
    programsService.getById(programId)
      .then((program) => {
        if (asProgramType(program) === 'innovation_challenge') setPrograms([program])
        setSelectedProgram(program)
      })
      .catch(() => {})
  }, [programId, programs, selectedProgram?.id, loadingPrograms])

  useEffect(() => {
    if (!programId) { setProgramForm(null); setValues({}); setFiles({}); setFieldErrors({}); setStep(0); setCompletedUpTo(0); return }
    setLoadingForm(true)
    setError('')
    programsService.getForm(programId)
      .then((form) => {
        setProgramForm(form)
        if (correctionMode && editingSubmission?.form_version_number && form.version !== editingSubmission.form_version_number) {
          setVersionMismatch(true)
          return
        }
        setVersionMismatch(false)
        setValues((prev) => {
          const next = { ...prev }
          for (const f of form.fields.filter((f) => f.field_type !== 'file')) {
            if (!(f.key in next)) next[f.key] = fieldDefault(f)
          }
          return next
        })
        setFiles({})
        setFieldErrors({})
        setStep(0)
        setCompletedUpTo(0)
      })
      .catch((err) => { setProgramForm(null); setVersionMismatch(false); setError(parseApiError(err)) })
      .finally(() => setLoadingForm(false))
  }, [correctionMode, editingSubmission?.form_version_number, programId])

  useEffect(() => {
    if (!programForm || !user || correctionMode) return
    const prefill = profilePrefill(latestProfile ? { ...user, profile: latestProfile } : user)
    setValues((prev) => {
      const next = { ...prev }
      for (const field of programForm.fields.filter((f) => f.field_type !== 'file')) {
        if (field.key === 'age_group') {
          if (!hasValue(next.age_group) && hasValue(prefill.birthday)) next.age_group = prefill.birthday
          continue
        }
        if (!hasValue(next[field.key]) && hasValue(prefill[field.key])) {
          next[field.key] = prefill[field.key]
        }
      }
      if (!hasValue(next.birthday) && hasValue(prefill.birthday)) next.birthday = prefill.birthday
      return next
    })
  }, [correctionMode, latestProfile, programForm, user])

  useEffect(() => {
    if (!programForm || !title.trim()) return
    setValues((prev) => {
      const next = { ...prev }
      const hasSolution = hasValue(next.solution_name) || hasValue(next.idea_name)
      if (hasSolution) return next
      const hasSolutionField = programForm.fields.some((f) => f.key === 'solution_name' || f.key === 'idea_name')
      if (!hasSolutionField) return next
      if (programForm.fields.some((f) => f.key === 'solution_name')) next.solution_name = title
      if (programForm.fields.some((f) => f.key === 'idea_name')) next.idea_name = title
      return next
    })
  }, [programForm, title])

  const sections = useMemo(
    () => (programForm?.sections ?? []).filter((s) => s.is_active !== false).sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0)),
    [programForm],
  )

  const effectiveValues = useMemo(
    () => ({ ...values, ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v])) }),
    [files, values],
  )

  const currentSection = sections[step] ?? null
  const currentSectionFields = useMemo(
    () => currentSection
      ? currentSection.fields
          .filter((f) => f.is_active !== false)
          .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
          .map((f) => normalizeField(f))
          .filter((f) => resolveFieldState(f, effectiveValues).visible)
      : [],
    [currentSection, effectiveValues],
  )

  const typeCode    = selectedProgram ? asProgramType(selectedProgram) : 'idea'
  const isHackathon = typeCode === 'hackathon'
  const accent      = programAccent(typeCode)

  useEffect(() => {
    if (correctionMode) return
    if (!programId || !title.trim()) return
    const timer = setTimeout(() => {
      setSaving(true)
      persistDraft(currentSection?.code ?? '').catch(() => {}).finally(() => setSaving(false))
    }, 1500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctionMode, values, title])

  const handleFieldChange = (key: string, val: unknown) => {
    setValues((c) => ({ ...c, [key]: val }))
    setFieldErrors((c) => { const n = { ...c }; delete n[key]; return n })
  }

  const handleFileChange = (key: string, nextFiles: File[]) => {
    setFiles((c) => ({ ...c, [key]: nextFiles }))
    setFieldErrors((c) => { const n = { ...c }; delete n[key]; return n })
  }

  const handleProgramSelect = (id: string) => {
    const match = programs.find((p) => p.id === id) ?? null
    setProgramId(id)
    setSelectedProgram(match)
  }

  const validateFields = (fields: SubmissionFormField[]) => {
    const nextErrors: Record<string, string> = {}
    for (const field of fields) {
      const state = resolveFieldState(field, effectiveValues)
      if (!state.visible) continue
      const msgs = validateField(field, values[field.key], files[field.key] ?? [], state.required)
      if (msgs.length) nextErrors[field.key] = msgs[0]
    }
    setFieldErrors(nextErrors)
    const firstErrorKey = Object.keys(nextErrors)[0]
    if (firstErrorKey) focusField(firstErrorKey)
    return Object.keys(nextErrors).length === 0
  }

  const persistDraft = async (sectionCode: string): Promise<string> => {
    const payload = {
      program: programId,
      submission_type: isChallengeEntry ? 'innovation_challenge' : 'idea',
      title: title || (isChallengeEntry ? 'Untitled entry' : 'Untitled idea'),
      current_section_code: sectionCode,
      draft_data: values,
    }
    if (draftId) {
      const updated = await submissionsService.updateDraft(draftId, payload)
      setLastSaved(new Date())
      return updated.id
    }
    const created = await submissionsService.saveDraft(payload)
    setDraftId(created.id)
    setLastSaved(new Date())
    return created.id
  }

  const persistCorrection = async (): Promise<void> => {
    if (!editSubmissionId || !programForm) return
    await submissionsService.updateSubmission(editSubmissionId, { title: title || editingSubmission?.title || 'Untitled idea' })
    const responseUpdates = programForm.fields
      .filter((field) => field.is_active !== false && field.field_type !== 'file')
      .map((field) => ({
        form_field: field.id,
        value: values[field.key] ?? fieldDefault(field),
      }))
    await submissionsService.updateResponses(editSubmissionId, responseUpdates)
    const uploadedFileValues: Record<string, SubmissionFileDocument[] | unknown> = {}
    for (const [key, fieldFiles] of Object.entries(files)) {
      if (!fieldFiles.length) continue
      const field = programForm.fields.find((item) => item.key === key)
      if (!field) continue
      const state = resolveFieldState(field, { ...values, ...uploadedFileValues })
      if (!state.visible || !state.enabled) continue
      const existingDocs = getFileItems(values[key])
      const allowsMultiple = Boolean((field.media_config ?? {}).multiple)
      const nextDocs: SubmissionFileDocument[] = []
      for (const [index, file] of fieldFiles.entries()) {
        const replaceDocumentId = !allowsMultiple && index === 0 ? existingDocs[0]?.id : undefined
        const doc = await submissionsService.uploadSubmissionDocument(editSubmissionId, key, file, replaceDocumentId)
        nextDocs.push({ ...doc, file_url: doc.file_url || doc.file || doc.external_url })
      }
      uploadedFileValues[key] = allowsMultiple ? [...existingDocs, ...nextDocs] : nextDocs
    }
    if (Object.keys(uploadedFileValues).length > 0) {
      setValues((prev) => ({ ...prev, ...uploadedFileValues }))
      setFiles((prev) => {
        const next = { ...prev }
        Object.keys(uploadedFileValues).forEach((key) => { delete next[key] })
        return next
      })
    }
    setLastSaved(new Date())
  }

  const handleContinue = async () => {
    if (!title.trim()) {
      setError(isHackathon ? 'Please name your project before continuing.' : 'Please name your idea before continuing.')
      focusField('submission_title')
      return
    }
    if (!validateFields(currentSectionFields)) { setError('Please complete the required fields before continuing.'); return }
    setError('')
    if (!correctionMode) {
      setSaving(true)
      persistDraft(currentSection?.code ?? '').catch(() => {}).finally(() => setSaving(false))
    }
    const nextStep = Math.min(sections.length - 1, step + 1)
    setStep(nextStep)
    setCompletedUpTo((c) => Math.max(c, nextStep))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSaveExit = async () => {
    if (correctionMode) {
      setSaving(true)
      setError('')
      try {
        await persistCorrection()
        navigate(`/submissions/${editSubmissionId}`)
      } catch (err) {
        setError(parseApiError(err))
      } finally {
        setSaving(false)
      }
      return
    }
    if (!programId || !title.trim()) { navigate('/dashboard'); return }
    setSaving(true)
    try {
      await persistDraft(currentSection?.code ?? '')
    } catch {
    } finally {
      setSaving(false)
    }
    navigate('/dashboard')
  }

  const handleSubmit = async () => {
    const allFields = sections.flatMap((s) => s.fields.filter((f) => f.is_active !== false))
    if (!validateFields(allFields)) { setError('Please correct the highlighted fields before submitting.'); return }
    setSubmitting(true); setError('')
    try {
      if (user) {
        const updatePayload: Record<string, unknown> = {
          id_passport_number: values.id_passport_number,
          country_code: values.country_code,
          country: values.country,
          gender: values.gender,
          birthday: values.birthday ?? values.age_group,
          linkedin_profile: values.linkedin_profile ?? values.linkedin_link,
          website_portfolio: values.website_portfolio ?? values.website_link,
          person_type: values.person_type,
          person_type_other: values.person_type_other,
        }
        Object.keys(updatePayload).forEach((k) => {
          if (!hasValue(updatePayload[k])) delete updatePayload[k]
        })
        if (Object.keys(updatePayload).length) {
          profileService.update(updatePayload as Record<string, unknown>).catch(() => {})
        }
      }
      if (correctionMode && editSubmissionId) {
        await persistCorrection()
        const final = await submissionsService.resubmit(editSubmissionId)
        setRefNumber((final as { reference_number?: string }).reference_number ?? editingSubmission?.reference_number ?? '')
        setSubmitted(true)
        return
      }
      if (!consent) {
        setError(CONSENT_MESSAGE)
        return
      }
      const id = await persistDraft(currentSection?.code ?? sections[0]?.code ?? '')
      for (const [key, fieldFiles] of Object.entries(files))
        for (const file of fieldFiles)
          await documentsService.uploadDraftDocument(id, key, file)
      const final = await submissionsService.submitDraft(id, { consent: true })
      setRefNumber((final as { reference_number?: string }).reference_number ?? '')
      setDraftId(null)
      setSubmitted(true)
    } catch (err) {
      setError(isConsentRequired(err) ? CONSENT_MESSAGE : parseApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: accent }}>
            <CheckCircle2 size={30} className="text-white" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
            {correctionMode ? 'Correction Submitted!' : isHackathon ? 'Application Submitted!' : 'Idea Submitted!'}
          </h2>
          <p className="text-gray-500 text-sm mb-2 leading-relaxed">
            <strong className="text-gray-800">{title}</strong> {correctionMode ? 'has been updated and sent back for review.' : 'has been received and is under review.'}
          </p>
          {refNumber && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 mb-7">
              <span className="text-xs text-gray-500">Reference</span>
              <span className="font-mono font-bold text-sm text-gray-900">{refNumber}</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={correctionMode && editSubmissionId ? `/submissions/${editSubmissionId}` : '/dashboard'}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: accent }}
            >
              {correctionMode ? 'Back to Submission' : 'Track in Dashboard'} <ArrowRight size={13} />
            </Link>
            {!correctionMode && (
              <button
              onClick={() => { setSubmitted(false); setTitle(''); setValues({}); setFiles({}); setStep(0); setCompletedUpTo(0) }}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Submit Another
            </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const hasProgramSelected = Boolean(programId)
  const isLastStep = step === sections.length - 1

  if (isChallengeEntry && selectedProgram && !editingSubmission) {
    const blocked = <ChallengeEntryBlocked program={selectedProgram} onBack={() => navigate(`/hackathons/${selectedProgram.id}`)} />
    const opens = new Date(selectedProgram.opening_date).getTime()
    const closes = new Date(selectedProgram.closing_date).getTime()
    const entry = selectedProgram.entry
    if (Date.now() < opens || Date.now() > closes || (entry && !entry.can_enter && entry.blocked_by !== 'window')) return blocked
  }

  if (!hasProgramSelected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
              <ArrowLeft size={14} /> Dashboard
            </button>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="mb-8">
            <p className="text-xs font-bold tracking-widest uppercase text-[#F0641E] mb-2">Step 1 of 2</p>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Choose a Challenge</h1>
            <p className="text-sm text-gray-500">Select the program you&apos;d like to apply to.</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm mb-5">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}
          <ProgramPicker programs={programs} loading={loadingPrograms} onSelect={handleProgramSelect} />
        </div>
      </div>
    )
  }

  if (correctionMode && versionMismatch) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center">
            <button onClick={() => navigate(editSubmissionId ? `/submissions/${editSubmissionId}` : '/dashboard')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
              <ArrowLeft size={14} /> Submission
            </button>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-6">
            <p className="text-sm font-bold text-amber-900">This returned submission cannot be safely edited in the current form.</p>
            <p className="text-sm text-amber-800 mt-2 leading-relaxed">
              The submission was created with form version {editingSubmission?.form_version_number ?? 'unknown'}, but the Program now uses form version {programForm?.version ?? 'unknown'}.
              To avoid mismapping fields or losing data, correction mode is blocked until a version-compatible editing path exists.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            onClick={handleSaveExit}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">{correctionMode ? 'Submission' : 'Dashboard'}</span>
          </button>

          <div className="flex-1" />

          <AutosaveBadge lastSaved={lastSaved} saving={saving} />
        </div>
      </header>

      {selectedProgram && !draftLoading && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-2">
          <div
            className="relative rounded-2xl px-8 sm:px-10 py-8 overflow-hidden flex items-center justify-between min-h-[140px]"
            style={{ background: isHackathon
              ? 'linear-gradient(125deg,#1a0c00 0%,#3d2000 55%,#5c3300 100%)'
              : 'linear-gradient(125deg,#2E1E18 0%,#5A3C32 55%,#6B4A3E 100%)'
            }}
          >
            <div className="absolute inset-0 opacity-[0.45]" style={{ backgroundImage: 'radial-gradient(circle,rgba(148,163,184,0.9) 1px,transparent 1px)', backgroundSize: '26px 26px' }} />
            <div className="relative z-10 flex-1 max-w-lg">
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: isHackathon ? '#F0641E' : '#6ee7b7' }}>
                {correctionMode ? 'Correction & Resubmission' : isHackathon ? 'Hackathon Application' : isChallengeEntry ? 'Innovation Challenge Entry' : 'Idea Submission'}
                {selectedProgram.closing_date && ` · Closes ${fmtDate(selectedProgram.closing_date)}`}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-snug mb-1">{selectedProgram.title}</h1>
              {selectedProgram.description && (
                <p className="text-white/60 text-sm leading-relaxed line-clamp-2 mt-1">{selectedProgram.description}</p>
              )}
              <Link
                to="/guidelines"
                target="_blank"
                rel="noopener noreferrer"
                className="sm:hidden inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold rounded-lg px-3 py-1.5 transition-colors"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <BookOpen size={13} />
                Guidelines
              </Link>
            </div>
            <div className="relative z-10 flex-shrink-0 ml-6 hidden sm:block">
              <Link
                to="/guidelines"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <BookOpen size={15} />
                Guidelines
              </Link>
            </div>
          </div>
        </section>
      )}

      {draftLoading && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
          <div className="flex items-center gap-3 text-sm text-gray-500 py-6">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Resuming your draft…
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {(resumeDraftId || correctionMode) && !draftLoading && (draftId || editSubmissionId) && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 mb-6 text-sm text-amber-800">
            <Clock size={14} className="text-amber-500 flex-shrink-0" />
            <span>{correctionMode ? 'You are editing a returned submission. The original program form and your saved answers have been loaded.' : 'You&apos;re resuming a saved draft. Your previous answers have been loaded.'}</span>
            <button
              onClick={() => navigate(correctionMode && editSubmissionId ? `/submissions/${editSubmissionId}` : '/innovate')}
              className="ml-auto text-amber-600 hover:text-amber-900 transition-colors flex-shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {correctionMode && !draftLoading && !versionMismatch && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 mb-6 text-sm text-blue-900">
            <Clock size={14} className="text-blue-600 flex-shrink-0" />
            <span>Changes are saved only when you use <strong>Save &amp; exit</strong> or <strong>Save &amp; Resubmit</strong>. Moving between sections does not save automatically.</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm mb-6">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {loadingForm ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-white border border-gray-100 animate-pulse" />)}
          </div>
        ) : programForm && sections.length > 0 && currentSection ? (
          <div className="lg:grid lg:grid-cols-[1fr_200px] lg:gap-8">

            <div className="min-w-0">
              <MobileProgress sections={sections} currentStep={step} />

              <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">

                <div className="px-6 sm:px-8 pt-6 pb-5 border-b border-gray-100">
                  <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: accent }}>
                    {toTitleCase(currentSection.code)}
                  </p>
                  <h2 className="text-xl font-extrabold text-gray-900">{currentSection.title}</h2>
                  {currentSection.description && (
                    <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{currentSection.description}</p>
                  )}
                </div>

                <div className="px-6 sm:px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                  {step === 0 && (
                    <div className="sm:col-span-2" data-field-key="submission_title">
                      <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                        {isHackathon ? 'Project name' : 'Idea title'}
                        <span className="text-red-400 ml-0.5">*</span>
                      </label>
                      <input
                        className={withErrorClass(Boolean(error) && !title.trim())}
                        placeholder={isHackathon ? 'Name your solution or project…' : 'Give your idea a name…'}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        autoFocus
                      />
                      <p className="text-xs text-gray-400 mt-1.5">
                        {isHackathon
                          ? 'A concise project title — e.g. "AgriTech micro-lending platform for smallholder farmers"'
                          : 'A clear, concise title — e.g. "Digital micro-lending for smallholder farmers"'
                        }
                      </p>
                    </div>
                  )}

                  {currentSectionFields.map((field) => {
                    const state = resolveFieldState(field, effectiveValues)
                    const isWide = ['textarea', 'file', 'boolean', 'multiselect'].includes(field.field_type)
                    return (
                      <div key={field.id} className={isWide ? 'sm:col-span-2' : ''} data-field-key={field.key}>
                        <FieldControl
                          field={field}
                          required={state.required}
                          disabled={!state.enabled}
                          error={fieldErrors[field.key]}
                          value={values[field.key]}
                          files={files[field.key] ?? []}
                          onChange={(val) => handleFieldChange(field.key, val)}
                          onFilesChange={(fs) => handleFileChange(field.key, fs)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 mt-5">
                <button
                  onClick={() => { setStep((c) => Math.max(0, c - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  disabled={step === 0 || submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft size={15} /> Back
                </button>

                {!isLastStep ? (
                  <button
                    onClick={handleContinue}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors cursor-pointer"
                    style={{ background: accent }}
                  >
                    Continue <ChevronRight size={15} />
                  </button>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    {selectedProgram?.terms_and_conditions?.document_link && (
                      <a
                        href={selectedProgram.terms_and_conditions.document_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
                      >
                        View Terms & Conditions
                      </a>
                    )}
                    {!correctionMode && (
                      <label className="flex items-start gap-2 text-sm text-gray-700 max-w-xs text-left cursor-pointer">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => { setConsent(e.target.checked); if (e.target.checked && error === CONSENT_MESSAGE) setError('') }}
                          required
                          aria-required="true"
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                        />
                        <span>I agree to the terms and privacy notice.</span>
                      </label>
                    )}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !programId || !title.trim() || (!correctionMode && !consent)}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all cursor-pointer"
                    style={{ background: accent }}
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3"/>
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        {correctionMode ? 'Resubmitting…' : 'Submitting…'}
                      </>
                    ) : (
                      <>{correctionMode ? 'Save & Resubmit' : isHackathon ? 'Submit Application' : isChallengeEntry ? 'Submit Entry' : 'Submit Idea'} <ArrowRight size={14} /></>
                    )}
                  </button>
                  </div>
                )}
              </div>

              <div className="lg:hidden mt-4 flex justify-center">
                <button
                  onClick={handleSaveExit}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 cursor-pointer"
                >
                  <Save size={12} /> {saving ? 'Saving…' : 'Save & exit'}
                </button>
              </div>
            </div>

            <SectionSidebar
              sections={sections}
              currentStep={step}
              completedUpTo={completedUpTo}
              accent={accent}
              onSaveExit={handleSaveExit}
              saving={saving}
            />

          </div>
        ) : null}

      </div>
    </div>
  )
}


export default function Innovate() {
  const { isAuthenticated, isVerified, user } = useAuth()
  const location = useLocation()
  useEffect(() => {
    if (isAuthenticated && !isVerified) {
      localStorage.setItem('ceda_post_verify_redirect', `${location.pathname}${location.search}`)
    }
  }, [isAuthenticated, isVerified, location.pathname, location.search])
  if (!isAuthenticated) return <LockedState />
  if (!isVerified) return <UnverifiedState email={user?.email} />
  return <SubmissionForm />
}


function ChallengeEntryBlocked({ program, onBack }: { program: Program; onBack: () => void }) {
  const now = useNow()
  const opens = new Date(program.opening_date).getTime()
  const closes = new Date(program.closing_date).getTime()
  const notOpenYet = now < opens

  useEffect(() => {
    if (!notOpenYet) return
    const timer = setTimeout(() => window.location.reload(), Math.max(0, opens - Date.now()) + 1500)
    return () => clearTimeout(timer)
  }, [notOpenYet, opens])

  const entry = program.entry
  const title = notOpenYet
    ? 'This challenge has not opened yet'
    : now > closes ? 'Entries for this challenge have closed' : 'You can\'t enter this challenge'
  const message = notOpenYet
    ? `Entries open on ${new Date(opens).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}. This page opens the entry form automatically when the countdown ends.`
    : now > closes ? 'The entry deadline has passed, so new entries can no longer be started or submitted.' : entry?.message ?? ''

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-gray-50 px-4 py-16">
      <div className="surface rounded-3xl p-8 sm:p-10 max-w-lg w-full text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#F0641E] mb-2">Innovation Challenge</p>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">{program.title}</h1>
        <p className="text-[15px] font-semibold text-gray-700 mt-4">{title}</p>
        <p className="text-[13.5px] text-gray-500 mt-2 leading-relaxed">{message}</p>
        {notOpenYet && (
          <div className="flex justify-center mt-6">
            <Countdown target={opens} now={now} />
          </div>
        )}
        <button onClick={onBack} className="btn-dark mt-8">View challenge details</button>
      </div>
    </div>
  )
}
