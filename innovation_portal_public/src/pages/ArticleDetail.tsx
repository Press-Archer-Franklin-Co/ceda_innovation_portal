import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, Tag, Megaphone, Zap, Trophy, Users, Star, TrendingUp } from 'lucide-react'
import { contentService } from '../services/content.service'
import type { ContentItem } from '../services/content.service'
import ContentMedia from '../components/ui/ContentMedia'
import { newsItems } from '../data/news'

const CATEGORY_DISPLAY: Record<string, { label: string; color: string; gradient: string; icon: React.ReactNode }> = {
  announcement:    { label: 'Announcement',    color: '#1D4ED8', gradient: 'linear-gradient(135deg,#0c1a3a 0%,#1e3a8a 100%)', icon: <Megaphone size={20} /> },
  challenge_update:{ label: 'Challenge Update', color: '#F0641E', gradient: 'linear-gradient(135deg,#2E1E18 0%,#5A3C32 100%)', icon: <Zap size={20} /> },
  winners:         { label: 'Winner Spotlight', color: '#9A5200', gradient: 'linear-gradient(135deg,#1a0c00 0%,#4a2c00 100%)', icon: <Trophy size={20} /> },
  partnership:     { label: 'Partnership',      color: '#0891B2', gradient: 'linear-gradient(135deg,#0a1e2e 0%,#0c3d5c 100%)', icon: <Users size={20} /> },
  success_story:   { label: 'Success Story',    color: '#7C3AED', gradient: 'linear-gradient(135deg,#180828 0%,#3d1070 100%)', icon: <Star size={20} /> },
}

const CATEGORY_CODE_MAP: Record<string, string> = {
  'Announcement':    'announcement',
  'Challenge Update':'challenge_update',
  'Winners':         'winners',
  'Partnership':     'partnership',
  'Success Story':   'success_story',
}

function getCfg(category: string) {
  return CATEGORY_DISPLAY[category] ?? {
    label: category, color: '#6B7280',
    gradient: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
    icon: <TrendingUp size={20} />,
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return iso }
}

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<ContentItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return

    contentService.getArticle(id)
      .then(data => setItem(data))
      .catch(() => {
        const found = newsItems.find(n => n.id === id)
        if (found) {
          setItem({
            id:           found.id,
            title:        found.title,
            excerpt:      found.excerpt,
            body:         found.excerpt,
            category:     (CATEGORY_CODE_MAP[found.category] ?? 'announcement') as ContentItem['category'],
            status:       'published',
            image_url:    null,
            cover_is_video: false,
            tags:         found.tags ?? [],
            read_time:    found.readTime,
            is_highlighted: found.featured ?? false,
            published_at: found.date,
            created_at:   found.date,
          })
        } else {
          setError(true)
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/2" />
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-[300px] bg-gray-200 rounded-2xl" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="text-gray-400 text-[15px] mb-4">Article not found.</p>
        <Link to="/news" className="text-sm font-semibold text-[#F0641E] hover:underline flex items-center justify-center gap-1">
          <ArrowLeft size={13} /> Back to news
        </Link>
      </div>
    )
  }

  const cfg = getCfg(item.category)

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <Link to="/news" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#A01E0A] transition-colors">
          <ArrowLeft size={13} /> Innovation Feed
        </Link>
      </div>

      {item.image_url ? (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 mb-8">
          <div className="rounded-2xl overflow-hidden h-[280px] sm:h-[360px]">
            {item.cover_is_video ?? false ? (
              <ContentMedia
                src={item.image_url}
                alt={item.title}
                isVideo
                className="h-full w-full object-cover"
                showControls
              />
            ) : (
              <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 mb-8">
          <div
            className="rounded-2xl overflow-hidden h-[200px] relative flex items-center justify-center"
            style={{ background: cfg.gradient }}
          >
            <div className="absolute inset-0 opacity-[0.5]" style={{
              backgroundImage: 'radial-gradient(circle,rgba(148,163,184,0.9) 1px,transparent 1px)',
              backgroundSize: '18px 18px',
            }} />
            <div className="text-white opacity-[0.08]" style={{ transform: 'scale(6)' }}>{cfg.icon}</div>
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
              <div className="max-w-xl text-white">
                <span className="inline-flex rounded-full bg-[#F0641E] px-4 py-2 text-sm font-bold leading-none text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
                  {item.title}
                </span>
                <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-white/76 line-clamp-2">
                  {item.excerpt}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <article className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <span className="text-[13px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1 text-[13px] text-gray-400">
            <Calendar size={12} /> {formatDate(item.published_at)}
          </span>
          {item.read_time && (
            <>
              <span className="text-gray-300">·</span>
              <span className="flex items-center gap-1 text-[13px] text-gray-400">
                <Clock size={12} /> {item.read_time}
              </span>
            </>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-5">
          {item.title}
        </h1>

        <p className="text-[17px] text-gray-600 leading-[1.8] mb-8 font-medium border-l-[3px] border-[#A01E0A] pl-4">
          {item.excerpt}
        </p>

        {item.body && item.body !== item.excerpt && (
          <div className="prose prose-gray max-w-none text-[15px] leading-[1.85] text-gray-700">
            {item.body.split('\n').map((para, i) => para.trim()
              ? <p key={i} className="mb-5">{para}</p>
              : <br key={i} />
            )}
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-gray-100">
            <Tag size={13} className="text-gray-400 mt-0.5" />
            {item.tags.map(t => (
              <Link
                key={t}
                to={`/news?search=${encodeURIComponent(t)}`}
                className="text-[13px] font-semibold text-gray-500 hover:text-[#A01E0A] transition-colors"
              >
                #{t}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12">
          <Link
            to="/news"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#A01E0A] hover:opacity-75 transition-opacity"
          >
            <ArrowLeft size={14} /> Back to Innovation Feed
          </Link>
        </div>
      </article>
    </div>
  )
}
