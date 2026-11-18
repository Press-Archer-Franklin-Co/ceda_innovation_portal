import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, Megaphone, Zap, Trophy, Users, Star, TrendingUp, Inbox } from 'lucide-react'
import { contentService } from '../services/content.service'
import type { ContentItem } from '../services/content.service'
import ContentMedia from '../components/ui/ContentMedia'
import { newsItems } from '../data/news'
import StandardHero from '../components/ui/StandardHero'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonGrid } from '../components/ui/SkeletonCard'


const CATEGORY_DISPLAY: Record<string, { label: string; color: string; gradient: string; icon: React.ReactNode }> = {
  announcement:    { label: 'Announcement',    color: '#1D4ED8', gradient: 'linear-gradient(135deg,#0c1a3a 0%,#1e3a8a 100%)', icon: <Megaphone size={18} /> },
  challenge_update:{ label: 'Challenge Update', color: '#F0641E', gradient: 'linear-gradient(135deg,#2E1E18 0%,#5A3C32 100%)', icon: <Zap size={18} /> },
  winners:         { label: 'Winner Spotlight', color: '#9A5200', gradient: 'linear-gradient(135deg,#1a0c00 0%,#4a2c00 100%)', icon: <Trophy size={18} /> },
  partnership:     { label: 'Partnership',      color: '#0891B2', gradient: 'linear-gradient(135deg,#0a1e2e 0%,#0c3d5c 100%)', icon: <Users size={18} /> },
  success_story:   { label: 'Success Story',    color: '#7C3AED', gradient: 'linear-gradient(135deg,#180828 0%,#3d1070 100%)', icon: <Star size={18} /> },
}

function getCfg(category: string) {
  return CATEGORY_DISPLAY[category] ?? {
    label: category, color: '#6B7280',
    gradient: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
    icon: <TrendingUp size={18} />,
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}


function FeedImage({ item, className }: { item: ContentItem; className: string }) {
  const cfg = getCfg(item.category)
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: cfg.gradient }}>
      <div className="absolute inset-0 opacity-[0.5]" style={{
        backgroundImage: 'radial-gradient(circle,rgba(148,163,184,0.9) 1px,transparent 1px)',
        backgroundSize: '18px 18px',
      }} />
      {item.image_url
        ? (
          <ContentMedia
            src={item.image_url}
            alt={item.title}
            isVideo={Boolean(item.cover_is_video)}
            className="absolute inset-0 h-full w-full object-cover"
            showControls={Boolean(item.cover_is_video)}
          />
        )
        : <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <div className="text-white opacity-[0.08]" style={{ transform: 'scale(3.5)' }}>{cfg.icon}</div>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="max-w-[88%] text-white">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/68">{cfg.label}</p>
                <p className="mt-1 text-sm font-bold leading-snug line-clamp-2">{item.title}</p>
              </div>
            </div>
          </>
      }
    </div>
  )
}


const CATEGORY_CODE_MAP: Record<string, string> = {
  'Announcement':    'announcement',
  'Challenge Update':'challenge_update',
  'Winners':         'winners',
  'Partnership':     'partnership',
  'Success Story':   'success_story',
}

const FALLBACK_ITEMS: ContentItem[] = newsItems.map(n => ({
  id:           n.id,
  title:        n.title,
  excerpt:      n.excerpt,
  category:     (CATEGORY_CODE_MAP[n.category] ?? 'announcement') as ContentItem['category'],
  status:       'published' as const,
  image_url:    null,
  cover_is_video: false,
  tags:         n.tags ?? [],
  read_time:    n.readTime,
  is_highlighted: n.featured ?? false,
  published_at: n.date,
  created_at:   n.date,
}))

const ALL_CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'announcement',    label: 'Announcements' },
  { value: 'challenge_update',label: 'Challenge Updates' },
  { value: 'winners',         label: 'Winners' },
  { value: 'partnership',     label: 'Partnerships' },
  { value: 'success_story',   label: 'Success Stories' },
]


function ArticleCard({ item }: { item: ContentItem }) {
  const cfg = getCfg(item.category)
  return (
    <div className="group flex flex-col surface surface-hover rounded-2xl overflow-hidden">
      <FeedImage item={item} className="h-[180px]" />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-gray-300 text-[11px]">·</span>
          <span className="text-[11px] text-gray-400">{formatDate(item.published_at)}</span>
          {item.read_time && <>
            <span className="text-gray-300 text-[11px]">·</span>
            <span className="text-[11px] text-gray-400">{item.read_time}</span>
          </>}
        </div>
        <Link to={`/news/${item.id}`} className="block">
          <h2 className="text-[15px] font-bold text-gray-900 leading-snug mb-2 group-hover:text-[#A01E0A] transition-colors line-clamp-2 flex-1">
            {item.title}
          </h2>
        </Link>
        <p className="text-[13px] text-gray-500 leading-relaxed line-clamp-3 mb-4">{item.excerpt}</p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
            {item.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F5EEE8] text-[#F0641E]">#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


export default function News() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    setLoading(true)
    setApiError(false)
    contentService.getNews({ category: category || undefined, search: search || undefined })
      .then(data => setItems(data))
      .catch(() => setApiError(true))
      .finally(() => setLoading(false))
  }, [category, search])

  const displayed = category
    ? items.filter(i => i.category === category)
    : items

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  return (
    <div className="bg-white min-h-screen">
      <StandardHero
        eyebrow="Innovation Feed"
        title="News & Highlights"
        subtitle="Stories from CEDA's innovation ecosystem — announcements, hackathon updates, winner spotlights, and success stories."
        actions={
          <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                placeholder="Search articles…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[#F0641E] text-white text-sm font-semibold hover:bg-[#C94F12] transition-colors"
            >
              Search
            </button>
          </form>
        }
      />

      <section className="border-b border-gray-100 sticky top-[62px] z-10 bg-white/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {ALL_CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                category === c.value
                  ? 'bg-[#A01E0A] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c.label}
            </button>
          ))}
          {search && (
            <button
              onClick={() => { setSearch(''); setSearchInput('') }}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              "{search}" ✕
            </button>
          )}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {loading && <SkeletonGrid count={6} />}

        {!loading && apiError && (
          <EmptyState
            icon={Inbox}
            title="Could not load articles"
            body="Please try again."
            action={{
              label: 'Retry',
              onClick: () => {
                setApiError(false); setLoading(true)
                contentService.getNews({ category: category || undefined, search: search || undefined })
                  .then(setItems).catch(() => setApiError(true)).finally(() => setLoading(false))
              }
            }}
          />
        )}

        {!loading && !apiError && displayed.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={search || category ? 'No articles match your filters.' : 'No articles published yet.'}
            action={
              (search || category)
                ? { label: 'Clear filters', onClick: () => { setCategory(''); setSearch(''); setSearchInput('') } }
                : undefined
            }
          />
        )}

        {!loading && !apiError && displayed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayed.map(item => <ArticleCard key={item.id} item={item} />)}
          </div>
        )}
      </section>
    </div>
  )
}
