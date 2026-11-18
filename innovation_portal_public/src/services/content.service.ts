import api from './api'
import type { ChallengeEntry, ProgramAudience } from '../types/api'

export interface ContentItem {
  id: string
  title: string
  excerpt: string
  body?: string
  category: 'announcement' | 'challenge_update' | 'winners' | 'partnership' | 'success_story'
  status: 'draft' | 'published' | 'archived'
  image_url: string | null
  cover_is_video?: boolean
  tags: string[]
  read_time: string
  is_highlighted: boolean
  highlight_priority?: number | null
  published_at: string | null
  created_at: string
}

export interface HackathonDetail {
  id: string
  program: string
  program_title: string
  banner_image_url: string | null
  theme: string
  description: string
  rules: string
  eligibility?: string
  prizes: Array<{ position: string; label: string; amount: string; description: string }>
  faq: Array<{ question: string; answer: string }>
  judges: Array<{ name: string; title: string; bio: string; photo_url?: string }>
  schedule: Array<{ date: string; label: string; description?: string }>
  is_published: boolean
  media: Array<{ id: string; media_type: 'photo' | 'video'; file_url: string; caption: string; order: number }>
  program_info?: {
    type_code: string
    status: string
    audience: ProgramAudience
    opens_at: string | null
    closes_at: string | null
    results_announced_at: string | null
    entry: ChallengeEntry
  }
  marking_criteria?: Array<{
    stage: string
    criteria: Array<{ name: string; description: string; max_score: number; weight: number }>
  }>
}

export interface WinnerSpotlight {
  id: string
  program: string
  program_title: string
  team_name: string
  project_name: string
  description: string
  position: string
  position_display: string
  members_count: number
  year: number
  tags: string[]
  photo_url: string | null
  prize_label?: string
  prize_amount?: string
  is_featured: boolean
}

export interface SiteSettings {
  hero_video: string | null
  hero_video_url: string | null
  hero_video_muted: boolean
  prize_money_label?: string
  solutions_deployed?: number
}

export interface PublicStat {
  key: string
  label: string
  value: string
  description: string
}

export interface LeadershipCard {
  id: string
  full_name: string
  job_title: string
  committee_role: string
  quote: string
  photo_url: string | null
  sort_order: number
  is_active: boolean
  start_at: string | null
  end_at: string | null
}

function unwrapList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : (data.results ?? [])
}

export const contentService = {
  async getHighlights(): Promise<ContentItem[]> {
    const { data } = await api.get<ContentItem[] | { results: ContentItem[] }>('/content/news/highlights/')
    return unwrapList(data)
  },

  async getNews(params?: { category?: string; search?: string }): Promise<ContentItem[]> {
    const { data } = await api.get<ContentItem[] | { results: ContentItem[] }>('/content/news/', { params })
    return unwrapList(data)
  },

  async getArticle(id: string): Promise<ContentItem> {
    const { data } = await api.get<ContentItem>(`/content/news/${id}/`)
    return data
  },

  async getHackathons(params?: { program?: string }): Promise<HackathonDetail[]> {
    const { data } = await api.get<HackathonDetail[] | { results: HackathonDetail[] }>('/content/hackathons/', { params })
    return unwrapList(data)
  },

  async getHackathon(id: string): Promise<HackathonDetail> {
    const { data } = await api.get<HackathonDetail>(`/content/hackathons/${id}/`)
    return data
  },

  async getWinners(params?: { featured?: boolean; program?: string; year?: number }): Promise<WinnerSpotlight[]> {
    const { data } = await api.get<WinnerSpotlight[] | { results: WinnerSpotlight[] }>('/content/winners/', { params })
    return unwrapList(data)
  },

  async getSiteSettings(): Promise<SiteSettings> {
    const { data } = await api.get<SiteSettings>('/content/site-settings/')
    return data
  },

  async getLeadershipCards(): Promise<LeadershipCard[]> {
    const { data } = await api.get<LeadershipCard[] | { results: LeadershipCard[] }>('/content/leadership/')
    return unwrapList(data)
  },

  async getPublicStats(): Promise<PublicStat[]> {
    const { data } = await api.get<{ stats: PublicStat[] }>('/content/public-stats/')
    return data.stats ?? []
  },
}
