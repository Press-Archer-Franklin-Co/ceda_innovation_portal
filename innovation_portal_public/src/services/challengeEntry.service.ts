import api from './api'
import { unwrapData } from './envelope'

// U10: entering a challenge (1.9, 1.9b, 2.10) and its results (1.10, 2.11). A challenge has its own form, so
// Enter never falls back to the general idea form. `slug` may also be the challenge id (old links carry it).

export type EntryState = 'sign_in' | 'questions' | 'form' | 'not_open' | 'closed' | 'entered' | 'limit' | 'audience'

export interface EntryChallenge {
  id: string
  slug: string
  title: string
  status: 'open' | 'upcoming' | 'closed'
  closes_at: string | null
  opens_at: string | null
  has_results?: boolean
  /** Entry state only (1.9 "Up for grabs", 1.9b closed). */
  support_headline?: string
  results_publish_at?: string | null
}

export interface EntryLink {
  id: string
  reference_number: string
  title: string
  submitted_at: string | null
  url: string
}

export interface EligibilityQuestion {
  id: string
  question: string
  help: string
}

export interface EntryStatus {
  challenge: EntryChallenge
  state: EntryState
  message: string
  questions: EligibilityQuestion[]
  draft_id: string | null
  entry: EntryLink | null
  entries_used: number
  max_entries: number | null
  general_idea_url: string
}

export interface EligibilityResult {
  eligible: boolean
  reasons: { id: string; question: string; reason: string }[]
  draft_id: string | null
  general_idea_url: string
}

export interface Winner {
  position: '1st' | '2nd' | '3rd' | 'runner_up' | 'special' | string
  name: string
  title: string
  description: string
  prize_label: string
  prize_amount: string
  members_count: number
  photo_url: string | null
  district: string
}

export interface ChallengeResults {
  challenge: EntryChallenge
  published: boolean
  published_at: string | null
  results_publish_at: string | null
  winners: Winner[]
  /** Titles only: shortlisted people are not named in public. */
  shortlisted: { title: string }[]
  entries_count: number
  districts_count: number
  /** "How we judged": each criterion's share of the total, in percent. */
  criteria: { name: string; weight: number }[]
}

export type Outcome = 'no_entry' | 'waiting' | 'winner' | 'shortlisted' | 'not_selected'

export interface MyResult {
  challenge: EntryChallenge
  published: boolean
  published_at: string | null
  results_publish_at: string | null
  entry: EntryLink | null
  outcome: Outcome
  position: string | null
  prize_label: string
  prize_amount: string
  scores: { total: number | null; criteria: { name: string; score: number }[] } | null
  scores_shared: boolean
  first_name: string
  entries_count: number
  shortlisted_count: number
  /** The feedback the team released to this person; never judges' names or raw scores. */
  feedback: string
  /** The challenge's event (pitch day or awards), for winners and the shortlist, while it is ahead. */
  next_step: { at: string } | null
}

const base = (slug: string) => `/programs/public/${encodeURIComponent(slug)}`

export const challengeEntryService = {
  async status(slug: string): Promise<EntryStatus> {
    const { data } = await api.get(`${base(slug)}/entry/`)
    return unwrapData<EntryStatus>(data)
  },
  async answer(slug: string, answers: Record<string, boolean>): Promise<EligibilityResult> {
    const { data } = await api.post(`${base(slug)}/eligibility/`, { answers })
    return unwrapData<EligibilityResult>(data)
  },
  async results(slug: string): Promise<ChallengeResults> {
    const { data } = await api.get(`${base(slug)}/results/`)
    return unwrapData<ChallengeResults>(data)
  },
  async myResult(slug: string): Promise<MyResult> {
    const { data } = await api.get(`${base(slug)}/my-result/`)
    return unwrapData<MyResult>(data)
  },
}
