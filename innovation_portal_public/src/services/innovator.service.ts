import api from './api'
import { query, unwrapData } from './envelope'
import type {
  ChallengeMatches, Envelope, IdeasFilter, IdeasList, Lang, LinkChallengeResult,
  MySummary, ProfileCompleteness, RecommendedChallenge, Timeline, UpdatesFeed,
} from '../types/innovator'

/** Screens 2.1, 2.2 and 2.4 (B2, on main). */
export const innovatorService = {
  async summary(lang?: Lang): Promise<MySummary> {
    const { data } = await api.get<Envelope<MySummary>>(`/me/summary/${query({ lang })}`)
    return unwrapData(data)
  },

  async ideas(filter: IdeasFilter = 'all', lang?: Lang): Promise<IdeasList> {
    const { data } = await api.get<Envelope<IdeasList>>(`/me/ideas/${query({ filter, lang })}`)
    return unwrapData(data)
  },

  /** `since` is ISO 8601. The API defaults to the last 30 days. */
  async updates(since?: string): Promise<UpdatesFeed> {
    const { data } = await api.get<Envelope<UpdatesFeed>>(`/me/updates/${query({ since })}`)
    return unwrapData(data)
  },

  async recommendedChallenges(lang?: Lang): Promise<RecommendedChallenge[]> {
    const { data } = await api.get<Envelope<RecommendedChallenge[]>>(`/me/challenges/recommended/${query({ lang })}`)
    return unwrapData(data)
  },

  async challengeMatches(ideaId: string, lang?: Lang): Promise<ChallengeMatches> {
    const { data } = await api.get<Envelope<ChallengeMatches>>(`/me/ideas/${ideaId}/challenge-matches/${query({ lang })}`)
    return unwrapData(data)
  },

  /** "Link it in one tap": then open the form at unanswered_questions[0]. */
  async linkChallenge(ideaId: string, programId: string): Promise<LinkChallengeResult> {
    const { data } = await api.post<Envelope<LinkChallengeResult>>(`/me/ideas/${ideaId}/link-challenge/${programId}/`, {})
    return unwrapData(data)
  },

  async profileCompleteness(): Promise<ProfileCompleteness> {
    const { data } = await api.get<Envelope<ProfileCompleteness> | ProfileCompleteness>('/profile/')
    const profile = unwrapData<Partial<ProfileCompleteness>>(data)
    return { percent_complete: profile.percent_complete ?? 0, missing_fields: profile.missing_fields ?? [] }
  },

  /** Screen 2.4: the signed-in owner's view, with the officer on the current stage. */
  async timeline(submissionId: string): Promise<Timeline> {
    const { data } = await api.get<Envelope<{ timeline: Timeline }> | { timeline: Timeline }>(
      `/submissions/${submissionId}/tracking-detail/`,
    )
    return unwrapData<{ timeline: Timeline }>(data).timeline
  },
}
