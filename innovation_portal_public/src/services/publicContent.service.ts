import api from './api'

// Public website content (B6 part 1, on main). Every call sends the current language (Accept-Language,
// set in api.ts), so text arrives already translated. Responses use the {success, message, data} wrapper.

export type Lang = 'en' | 'tn'

export interface MediaRef {
  id: string | null
  kind: 'image' | 'video' | 'audio' | 'document' | string
  url: string | null
  monochrome_url: string | null
  captions_url: string | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  alt_text: string | { en: string; tn: string } | null
}

export interface ButtonLink {
  label: string
  url: string
}

export interface SectorRef {
  id: string
  slug: string
  name: string
}

/** Challenge card shape shared by the home page and the public challenge list (B5). */
export interface ChallengeCard {
  id: string
  slug: string
  title: string
  status: 'open' | 'upcoming' | 'closed'
  summary: string
  support_headline: string
  sectors: SectorRef[]
  opens_at: string | null
  closes_at: string | null
  days_left: number
  window_progress: number | null
  /** B5 list and detail only. */
  sector?: SectorRef | null
  cover_url?: string | null
  has_results?: boolean
  results_url?: string | null
}

export type ChallengeStatus = 'open' | 'upcoming' | 'closed'

export interface ChallengeList {
  counts: Record<ChallengeStatus | 'all', number>
  results: ChallengeCard[]
}

/** GET /api/programs/public/{slug}/ (1.8). Never judges or scores. */
export interface ChallengeDetail extends ChallengeCard {
  description: string
  problem_statement: string
  who_can_enter: string
  where: string
  what_we_look_for: string[]
  support_package: { title: string; amount_label: string; description: string }[]
  judging_criteria: { name: string; description: string; weight: number }[]
  key_dates: { title: string; starts_at: string | null; ends_at: string | null }[]
  faqs: { question: string; answer: string }[]
  partners: { name: string; tier: string; url: string; logo_url: string | null }[]
  started_count: number
  estimated_minutes: number | null
  form_id: string | null
  availability: Record<string, unknown>
}

export type PostType = 'news' | 'event' | 'opportunity' | 'result' | 'notice' | 'newsletter'

export interface PostCard {
  id: string
  slug: string
  type: PostType
  title: string
  excerpt: string
  cover: MediaRef | null
  duration_seconds: number | null
  published_at: string | null
  is_new: boolean
  is_pinned: boolean
  tags: string[]
  event_starts_at: string | null
  event_place: string
  newsletter_issue: string
  read_time: string | number | null
}

export interface PostDetail extends PostCard {
  body: string
  related: PostCard[]
}

export interface PartnerCard {
  id: string
  name: string
  short_label: string
  tier: 'lead_sponsor' | 'partner' | 'supporter'
  url: string
  logo: MediaRef | null
}

export interface QuoteCard {
  id: string
  name: string
  job_title: string
  committee_role: string
  quote: string
  photo_url: string | null
}

export interface StoryCard {
  id: string
  kind: string
  name: string
  business: string
  quote: string
  photo_url: string | null
  program: string
  year: number | null
}

/** U7: the banner's cut-out photo (PNG with a transparent background, saved as WebP and PNG). */
export interface HeroPhoto {
  src: string
  srcset: string
  png_src: string
  width: number
  height: number
  alt_en: string
  alt_tn: string
  size: 'small' | 'medium' | 'large'
}

/** Sections the home page can return. Unknown types are skipped by the page, not treated as errors. */
export type HomeSection =
  | { id: string | null; type: 'hero_banner'; settings: { headline: string; highlighted_words: string; text: string; primary_button: ButtonLink | null; secondary_button: ButtonLink | null; show_watermark: boolean; show_quick_start: boolean }; data: { photo: HeroPhoto | null } | null }
  | { id: string | null; type: 'partners_strip'; settings: { title: string; max_items: number }; data: { items: PartnerCard[] } }
  | { id: string | null; type: 'challenges'; settings: { title: string; max_items: number; only_open: boolean }; data: { items: ChallengeCard[] } }
  | { id: string | null; type: 'leadership_quotes'; settings: { title: string; max_items: number }; data: { rotation_seconds: number; items: QuoteCard[] } }
  | { id: string | null; type: 'news_flash'; settings: { title: string; max_items: number }; data: { items: PostCard[] } }
  | { id: string | null; type: 'bulletin_board'; settings: { title: string; max_items: number }; data: { items: PostCard[] } }
  | { id: string | null; type: 'sectors'; settings: { title: string }; data: { items: { sector: SectorRef; example: string; icon: string }[] } }
  | { id: string | null; type: 'how_it_works'; settings: { title: string; steps: { title: string; text: string; icon: string }[] }; data: null }
  | { id: string | null; type: 'cta_band'; settings: { headline: string; text: string; button: ButtonLink | null }; data: null }
  | { id: string | null; type: 'stories'; settings: { title: string; max_items: number }; data: { items: StoryCard[] } }

export interface HomePage {
  version: number | null
  published_at: string | null
  language: Lang
  sections: (HomeSection | { id: string | null; type: string; settings: unknown; data: unknown })[]
}

interface Wrapped<T> {
  data: T
}
const unwrap = <T,>(body: Wrapped<T> | T): T =>
  body && typeof body === 'object' && 'data' in (body as Wrapped<T>) ? (body as Wrapped<T>).data : (body as T)

export interface PostListParams {
  type?: PostType | ''
  q?: string
  sort?: 'newest' | 'oldest' | 'popular'
  page?: number
}

/** GET /api/content/public/posts/: on page 1 without a search, the pinned or highlighted post comes as `featured`. */
export interface PostList {
  featured: PostCard | null
  results: PostCard[]
  page: number
  pages: number
  total: number
}

export const publicContent = {
  async home(): Promise<HomePage> {
    const { data } = await api.get('/content/public/home/')
    return unwrap<HomePage>(data)
  },
  async posts(params: PostListParams = {}): Promise<PostList> {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
    const { data } = await api.get('/content/public/posts/', { params: clean })
    return unwrap<PostList>(data)
  },
  async post(slug: string): Promise<PostDetail> {
    const { data } = await api.get(`/content/public/posts/${encodeURIComponent(slug)}/`)
    return unwrap<PostDetail>(data)
  },
  async upcomingEvents(): Promise<PostCard[]> {
    const { data } = await api.get('/content/public/events/upcoming/')
    return unwrap<PostCard[]>(data) ?? []
  },
  async newsletters(): Promise<PostCard[]> {
    const { data } = await api.get('/content/public/newsletters/')
    return unwrap<PostCard[]>(data) ?? []
  },
  async challenges(params: { status?: ChallengeStatus | ''; sector?: string; sort?: 'closing_soon' | 'newest' | '' } = {}): Promise<ChallengeList> {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
    const { data } = await api.get('/programs/public/challenges/', { params: clean })
    return unwrap<ChallengeList>(data)
  },
  async challenge(slug: string): Promise<ChallengeDetail> {
    const { data } = await api.get(`/programs/public/${encodeURIComponent(slug)}/`)
    return unwrap<ChallengeDetail>(data)
  },
  async partners(placement = 'home'): Promise<PartnerCard[]> {
    const { data } = await api.get('/content/public/partners/', { params: { placement } })
    return unwrap<PartnerCard[]>(data) ?? []
  },
}
