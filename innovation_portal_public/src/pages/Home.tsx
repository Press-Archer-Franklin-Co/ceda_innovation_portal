import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ChevronLeft, ChevronRight, Calendar,
  Megaphone, Zap, Trophy, Users, Star, TrendingUp,
  Volume2, VolumeX,
} from 'lucide-react'
import { programsService } from '../services/programs.service'
import { contentService } from '../services/content.service'
import type { ContentItem as ApiContentItem, WinnerSpotlight as ApiWinner, SiteSettings, LeadershipCard } from '../services/content.service'
import { useAuth } from '../context/AuthContext'
import type { Program } from '../types/api'
import Badge from '../components/ui/Badge'
import ContentMedia from '../components/ui/ContentMedia'
import heroImage from '../assets/main.png'
import ChallengeSpotlight from '../components/challenges/ChallengeSpotlight'
import { newsItems } from '../data/news'
import type { NewsItem } from '../data/news'

const CATEGORY_CODE_MAP: Record<string, string> = {
  announcement:    'Announcement',
  challenge_update:'Challenge Update',
  winners:         'Winners',
  partnership:     'Partnership',
  success_story:   'Success Story',
}

function apiItemToNewsItem(item: ApiContentItem): NewsItem {
  return {
    id:       item.id,
    title:    item.title,
    excerpt:  item.excerpt,
    date:     item.published_at ?? item.created_at,
    category: (CATEGORY_CODE_MAP[item.category] ?? item.category) as NewsItem['category'],
    readTime: item.read_time ?? '—',
    image:    item.image_url ?? item.category,
    cover_is_video: Boolean(item.cover_is_video),
    featured: item.is_highlighted,
    highlight_priority: item.highlight_priority ?? null,
    tags:     item.tags,
  }
}


function HeroCard() {
  const { isAuthenticated } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    contentService.getSiteSettings()
      .then((s) => {
        setSiteSettings(s)
        setMuted(s.hero_video_muted !== false)
      })
      .catch(() => {})
  }, [])

  const toggleMute = () => {
    if (!videoRef.current) return
    const next = !muted
    videoRef.current.muted = next
    setMuted(next)
  }

  const hasVideo = Boolean(siteSettings?.hero_video_url)

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-7 pb-4">
      <div
        className="relative rounded-3xl overflow-hidden min-h-[360px] flex items-center"
        style={{ background: 'linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)' }}
      >
        {hasVideo && (
          <video
            ref={videoRef}
            key={siteSettings!.hero_video_url!}
            src={siteSettings!.hero_video_url!}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            playsInline
            muted={muted}
            preload="none"
          />
        )}

        <div
          className="absolute inset-0"
          style={{
            background: hasVideo
              ? 'linear-gradient(125deg, rgba(3,26,12,0.82) 0%, rgba(90,60,50,0.65) 55%, rgba(12,92,48,0.45) 100%)'
              : undefined,
          }}
        />

        {!hasVideo && (
          <div className="absolute inset-0 opacity-[0.5]" style={{
            backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }} />
        )}

        {!hasVideo && (
          <div className="absolute right-0 top-0 bottom-0 w-2/3 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 85% 50%, rgba(240,100,30,0.13) 0%, transparent 65%)',
          }} />
        )}

        {!hasVideo && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none select-none"
            aria-hidden="true"
            style={{ opacity: 0.055 }}
          >
            <line x1="76%" y1="12%" x2="76%" y2="38%" stroke="white" strokeWidth="0.8" />
            <line x1="76%" y1="38%" x2="88%" y2="38%" stroke="white" strokeWidth="0.8" />
            <line x1="88%" y1="18%" x2="88%" y2="62%" stroke="white" strokeWidth="0.8" />
            <line x1="88%" y1="62%" x2="94%" y2="62%" stroke="white" strokeWidth="0.8" />
            <line x1="94%" y1="45%" x2="94%" y2="78%" stroke="white" strokeWidth="0.8" />
            <circle cx="76%" cy="12%" r="2.5" fill="white" />
            <circle cx="76%" cy="38%" r="3.5" fill="none" stroke="white" strokeWidth="1" />
            <circle cx="88%" cy="18%" r="2" fill="white" />
            <circle cx="88%" cy="38%" r="2.5" fill="white" />
            <circle cx="88%" cy="62%" r="3.5" fill="none" stroke="white" strokeWidth="1" />
            <circle cx="94%" cy="45%" r="2" fill="white" />
            <circle cx="94%" cy="78%" r="2.5" fill="white" />
            <polygon points="72%,22% 74%,18% 78%,18% 80%,22% 78%,26% 74%,26%" fill="none" stroke="white" strokeWidth="0.7" />
            <polygon points="82%,72% 84%,68% 88%,68% 90%,72% 88%,76% 84%,76%" fill="none" stroke="white" strokeWidth="0.7" />
          </svg>
        )}

        <div className="relative z-10 px-10 sm:px-14 py-14 max-w-[500px]">
          <p className="eyebrow-white mb-4">What We Do</p>
          <h1 className="text-5xl sm:text-[54px] font-extrabold text-white leading-[1.06] mb-5 tracking-tight">
            We innovate
          </h1>
          <p className="text-white/65 text-[13.5px] leading-[1.75] mb-9 max-w-[340px]">
            Great businesses start with great ideas. We help citizens turn
            their ideas into ventures that grow Botswana's economy.
          </p>
          <div className="flex flex-wrap gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/innovate"    className="btn-white">Submit Idea</Link>
                <Link to="/dashboard"   className="btn-white">My Dashboard</Link>
                <Link to="/suggestions" className="btn-indigo">Feedback Xchange</Link>
              </>
            ) : (
              <>
                <Link to="/innovate"    className="btn-white">Submit Idea</Link>
                <Link to="/guidelines"  className="btn-white">Guidelines</Link>
                <Link to="/suggestions" className="btn-indigo">Feedback Xchange</Link>
              </>
            )}
          </div>
        </div>

        {!hasVideo && (
          <div className="hidden sm:block absolute right-0 bottom-0 h-[118%] w-[460px] pointer-events-none">
            <img
              src={heroImage}
              alt="Person wearing VR headset"
              className="h-full w-full object-contain object-bottom select-none"
              style={{ filter: 'drop-shadow(0 0 60px rgba(0,0,0,0.35))' }}
              draggable={false}
              fetchPriority="high"
              loading="eager"
            />
          </div>
        )}

        {hasVideo && (
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute video' : 'Mute video'}
            className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/90 backdrop-blur-sm transition-all hover:text-white"
            style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)' }}
          >
            {muted
              ? <><VolumeX size={13} /> Unmute</>
              : <><Volume2 size={13} /> Mute</>
            }
          </button>
        )}
      </div>
    </section>
  )
}



type Dir = 'left' | 'right'

function TestimonialCarousel() {
  const [cards, setCards]     = useState<LeadershipCard[]>([])
  const [active, setActive]   = useState(0)
  const [dir, setDir]         = useState<Dir>('right')
  const [animKey, setAnimKey] = useState(0)
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    contentService.getLeadershipCards()
      .then(data => setCards(data))
      .catch(() => setCards([]))
  }, [])

  const count = cards.length

  const goTo = (idx: number, direction: Dir = 'right') => {
    if (idx === active || count === 0) return
    setDir(direction)
    setAnimKey(k => k + 1)
    setActive(idx)
    resetTimer()
  }

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (count < 2) return
    timerRef.current = setInterval(() => {
      setDir('right')
      setAnimKey(k => k + 1)
      setActive(a => (a + 1) % count)
    }, 5500)
  }

  useEffect(() => {
    resetTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [count])

  useEffect(() => {
    if (active >= count && count > 0) setActive(0)
  }, [count])

  if (cards.length === 0) return null

  const t = cards[active] ?? cards[0]

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
      <div
        className="rounded-3xl overflow-hidden relative"
        style={{ background: 'radial-gradient(ellipse at 72% 50%, #6B4A3E 0%, #5A3C32 52%, #2E1E18 100%)' }}
      >
        <div className="px-8 sm:px-14 pt-11 pb-4 overflow-hidden">
          <div
            key={animKey}
            className={dir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left'}
          >
            <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-10">
              <div className="shrink-0">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-[3px] border-white/20 shadow-2xl bg-white/10">
                  {t.photo_url
                    ? <img src={t.photo_url} alt={t.full_name} className="w-full h-full object-cover object-top scale-110" />
                    : <div className="w-full h-full flex items-center justify-center text-white/30 text-3xl font-bold select-none">
                        {t.full_name.charAt(0)}
                      </div>
                  }
                </div>
              </div>

              <div className="shrink-0 sm:w-52 text-center sm:text-left">
                <p className="text-white font-bold text-[15px] leading-snug">{t.full_name}</p>
                <p className="text-white/55 text-[11.5px] mt-2 leading-[1.7]">{t.job_title}</p>
                {t.committee_role && (
                  <p className="text-white/35 text-[10.5px] mt-1 leading-[1.6]">({t.committee_role})</p>
                )}
              </div>

              <div className="hidden sm:block w-px self-stretch bg-white/10" />

              <p className="text-white/75 text-[13.5px] leading-[1.85] italic flex-1 text-center sm:text-left">
                "{t.quote}"
              </p>
            </div>
          </div>
        </div>

        {count > 1 && (
          <div className="flex items-center justify-center gap-3 py-6">
            <button
              onClick={() => goTo((active - 1 + count) % count, 'left')}
              className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center text-white/40 hover:text-white hover:border-white/50 transition-all"
              aria-label="Previous"
            >
              <ChevronLeft size={13} />
            </button>
            {cards.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > active ? 'right' : 'left')}
                aria-label={`Go to slide ${i + 1}`}
                style={{
                  height: 8,
                  width: i === active ? 24 : 8,
                  borderRadius: 4,
                  background: i === active ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.22)',
                  transition: 'width 350ms ease, background 350ms ease',
                }}
              />
            ))}
            <button
              onClick={() => goTo((active + 1) % count, 'right')}
              className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center text-white/40 hover:text-white hover:border-white/50 transition-all"
              aria-label="Next"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {count > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.06]">
            <div key={`pb-${active}`} className="h-full bg-white/25 rounded-full"
              style={{ animation: 'progressBar 5.5s linear forwards' }} />
          </div>
        )}
      </div>
    </section>
  )
}


const categoryConfig: Record<string, {
  label: string
  color: string
  gradient: string
  icon: React.ReactNode
}> = {
  'Announcement':     { label: 'Announcement',    color: '#1D4ED8', gradient: 'linear-gradient(135deg,#0c1a3a 0%,#1e3a8a 100%)', icon: <Megaphone size={22} /> },
  'Challenge Update': { label: 'Challenge Update', color: '#F0641E', gradient: 'linear-gradient(135deg,#2E1E18 0%,#5A3C32 100%)', icon: <Zap size={22} /> },
  'Winners':          { label: 'Winner Spotlight', color: '#9A5200', gradient: 'linear-gradient(135deg,#1a0c00 0%,#4a2c00 100%)', icon: <Trophy size={22} /> },
  'Partnership':      { label: 'Partnership',      color: '#0891B2', gradient: 'linear-gradient(135deg,#0a1e2e 0%,#0c3d5c 100%)', icon: <Users size={22} /> },
  'Success Story':    { label: 'Success Story',    color: '#7C3AED', gradient: 'linear-gradient(135deg,#180828 0%,#3d1070 100%)', icon: <Star size={22} /> },
}

function getCatConfig(category: string) {
  return categoryConfig[category] ?? {
    label: category, color: '#6B7280',
    gradient: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
    icon: <TrendingUp size={22} />,
  }
}

function formatNewsDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}


function FeedImage({
  item, height, iconScale = 3.5, autoPlayMuted = false,
}: { item: NewsItem & { cover_is_video?: boolean }; height: string; iconScale?: number; autoPlayMuted?: boolean }) {
  const cfg   = getCatConfig(item.category)
  const isUrl = item.image?.startsWith('/') || item.image?.startsWith('http')
  return (
    <div className={`relative overflow-hidden ${height}`} style={{ background: cfg.gradient }}>
      <div className="absolute inset-0 opacity-[0.5]" style={{
        backgroundImage: 'radial-gradient(circle,rgba(148,163,184,0.9) 1px,transparent 1px)',
        backgroundSize: '18px 18px',
      }} />
      {isUrl
        ? (
          <ContentMedia
            src={item.image}
            alt={item.title}
            isVideo={Boolean(item.cover_is_video)}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlayMuted={autoPlayMuted && Boolean(item.cover_is_video)}
            showControls={Boolean(item.cover_is_video) && !autoPlayMuted}
            showMuteToggle={Boolean(item.cover_is_video) && autoPlayMuted}
            loop={autoPlayMuted && Boolean(item.cover_is_video)}
          />
        )
        : <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <div className="text-white opacity-[0.08]" style={{ transform: `scale(${iconScale})` }}>{cfg.icon}</div>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <div className="max-w-[86%]">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/68">{cfg.label}</p>
                <h3 className="mt-2 text-2xl sm:text-[30px] font-extrabold leading-tight text-white">
                  {item.title}
                </h3>
                <p className="mt-3 max-w-xl text-[13px] sm:text-[14px] leading-[1.8] text-white/72 line-clamp-3">
                  {item.excerpt}
                </p>
              </div>
            </div>
          </>
      }
    </div>
  )
}


function InnovationFeed() {
  const [feedItems, setFeedItems] = useState<NewsItem[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  useEffect(() => {
    contentService.getHighlights()
      .then(items => setFeedItems(items.map(apiItemToNewsItem)))
      .catch(() => setFeedItems([]))
      .finally(() => setFeedLoading(false))
  }, [])

  if (feedLoading) {
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col lg:flex-row gap-10 xl:gap-16 animate-pulse">
          <div className="flex-1 space-y-4">
            <div className="h-[260px] bg-gray-100 rounded-2xl" />
            <div className="h-5 bg-gray-100 rounded w-1/3" />
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-100 rounded w-full" />
            <div className="h-4 bg-gray-100 rounded w-5/6" />
          </div>
          <div className="lg:w-[320px] space-y-4">
            <div className="h-[170px] bg-gray-100 rounded-2xl" />
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
          </div>
        </div>
      </section>
    )
  }

  const featured  = feedItems[0]
  const sideItems = feedItems.filter(n => n.id !== featured?.id).slice(0, 4)
  const featCfg   = getCatConfig(featured?.category ?? 'Announcement')
  if (!featured) return null

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-col lg:flex-row gap-10 xl:gap-16">

        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-3 border-l-[3px] border-[#A01E0A] pl-3 mb-8">
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#A01E0A]">Best of the Week</span>
          </div>

          <div className="rounded-2xl overflow-hidden mb-6">
            <FeedImage item={featured} height="h-[260px] sm:h-[320px]" iconScale={4.5} autoPlayMuted />
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[13px] font-bold" style={{ color: featCfg.color }}>{featCfg.label}</span>
            <span className="text-gray-300">·</span>
            <span className="text-[13px] text-gray-400">{formatNewsDate(featured.date)}</span>
            <span className="text-gray-300">·</span>
            <span className="text-[13px] text-gray-400">{featured.readTime}</span>
          </div>

          <h2 className="text-[26px] sm:text-[32px] font-extrabold text-gray-900 leading-tight mb-4">
            {featured.title}
          </h2>

          <p className="text-[14px] text-gray-500 leading-[1.8] mb-6 max-w-xl">
            {featured.excerpt}
          </p>

          {featured.tags && featured.tags.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-8">
              {featured.tags.map(tag => (
                <span key={tag} className="text-[13px] font-semibold text-gray-400 hover:text-[#A01E0A] transition-colors cursor-pointer">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <Link
            to={`/news/${featured.id}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 active:scale-[0.98] transition-all"
            style={{ background: '#A01E0A' }}
          >
            Read article <ArrowRight size={14} />
          </Link>
        </div>

        <div className="lg:w-[320px] xl:w-[340px] flex-shrink-0">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
            <h3 className="text-[15px] font-bold text-gray-900">Innovation Feed</h3>
            <Link to="/news" className="text-[12px] font-semibold text-[#F0641E] hover:text-[#A01E0A] transition-colors flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {sideItems[0] && (() => {
            const cfg = getCatConfig(sideItems[0].category)
            return (
              <div className="rounded-2xl overflow-hidden mb-5 group surface surface-hover">
                <FeedImage item={sideItems[0]} height="h-[170px]" iconScale={3} />
                <div className="p-4 bg-white border border-t-0 border-gray-100 rounded-b-2xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="text-gray-300 text-[10px]">·</span>
                    <span className="text-[10px] text-gray-400">{formatNewsDate(sideItems[0].date)}</span>
                  </div>
                  <Link to={`/news/${sideItems[0].id}`} className="block">
                    <h4 className="text-[13.5px] font-bold text-gray-900 leading-snug group-hover:text-[#A01E0A] transition-colors line-clamp-2">
                      {sideItems[0].title}
                    </h4>
                  </Link>
                </div>
              </div>
            )
          })()}

          <div className="divide-y divide-gray-100">
            {sideItems.slice(1).map(item => {
              const cfg = getCatConfig(item.category)
              return (
                <Link key={item.id} to={`/news/${item.id}`} className="flex items-start gap-3 py-4 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                      <span className="text-gray-300 text-[10px]">·</span>
                      <span className="text-[10px] text-gray-400">{formatNewsDate(item.date)}</span>
                    </div>
                    <h4 className="text-[13px] font-semibold text-gray-800 leading-snug group-hover:text-[#A01E0A] transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                  </div>
                  <div className="w-[68px] h-[56px] rounded-xl overflow-hidden flex-shrink-0">
                    <FeedImage item={item} height="h-full" iconScale={1.4} />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

      </div>
    </section>
  )
}


const gradients: Record<string, string> = {
  challenge:  'from-emerald-950 to-emerald-700',
  hackathon:  'from-violet-950 to-violet-700',
  innovation: 'from-green-950 to-green-700',
  research:   'from-blue-950 to-blue-700',
  default:    'from-slate-900 to-slate-600',
}

function gradientFor(type: string): string {
  const t = type?.toLowerCase() ?? ''
  if (t.includes('hackathon'))  return gradients.hackathon
  if (t.includes('innovation')) return gradients.innovation
  if (t.includes('research'))   return gradients.research
  if (t.includes('challenge'))  return gradients.challenge
  return gradients.default
}

function toDisplayStatus(status: string) {
  if (status === 'published') return 'open'
  if (status === 'draft')     return 'upcoming'
  return 'closed'
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  catch { return iso }
}

function ChallengesPreview() {
  const { isAuthenticated } = useAuth()
  const [programs, setPrograms] = useState<Program[]>([])
  const [bannerMap, setBannerMap] = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      programsService.getPublic(),
      contentService.getHackathons(),
    ])
      .then(([data, hackathonContent]) => {
        const hackathons = data
          .filter(p =>
            ['hackathon', 'innovation_challenge'].includes(p.program_type?.code ?? '') && p.status !== 'closed' && p.status !== 'archived'
          )
          .sort((a, b) => new Date(b.opening_date).getTime() - new Date(a.opening_date).getTime())
        setPrograms(hackathons.slice(0, 3))
        setBannerMap(
          hackathonContent.reduce<Record<string, string>>((acc, item) => {
            if (item.program && item.banner_image_url) acc[item.program] = item.banner_image_url
            return acc
          }, {})
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && programs.length === 0) return null

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-end justify-between mb-7">
        <div>
          <p className="eyebrow-muted mb-1">Live Programs</p>
          <h2 className="text-[22px] font-bold text-gray-900 leading-tight">Active Challenges</h2>
        </div>
        <Link to="/challenges"
          className="text-[13px] font-semibold text-[#F0641E] hover:text-[#A01E0A] flex items-center gap-1 group transition-colors">
          View all <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="surface rounded-2xl overflow-hidden animate-pulse">
              <div className="h-[120px] bg-gray-200" />
              <div className="p-5 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {programs.map(p => {
            const typeCode = p.program_type?.code ?? ''
            const challenge = typeCode === 'innovation_challenge'
            let ds = toDisplayStatus(p.status)
            if (challenge && ds === 'open') {
              if (Date.now() < new Date(p.opening_date).getTime()) ds = 'upcoming'
              else if (Date.now() > new Date(p.closing_date).getTime()) ds = 'closed'
            }
            const canEnter = ds === 'open' && (!challenge || (p.entry?.can_enter ?? true))
            const bannerUrl = bannerMap[p.id]
            return (
              <div key={p.id} className="surface surface-hover rounded-2xl overflow-hidden flex flex-col group cursor-pointer">
                <div className={`h-[120px] bg-gradient-to-br ${gradientFor(typeCode)} relative flex items-center justify-center`}>
                  <Badge variant={ds as 'open' | 'upcoming' | 'closed'} className="absolute top-3 left-3 z-10">
                    {ds.charAt(0).toUpperCase() + ds.slice(1)}
                  </Badge>
                  {bannerUrl ? (
                    <>
                      <img src={bannerUrl} alt={p.title} className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                    </>
                  ) : (
                    <span className="text-white/[0.08] text-[80px] font-black tracking-tighter select-none leading-none">
                      {p.title.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <Link to={`/hackathons/${p.id}`} className="font-bold text-gray-900 text-[13.5px] leading-snug mb-1.5 hover:text-[#A01E0A] transition-colors">{p.title}</Link>
                  <p className="text-[12px] text-gray-400 line-clamp-2 leading-relaxed flex-1">{p.description}</p>
                  <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-gray-100">
                    <span className="flex items-center gap-1 text-[12px] text-gray-400">
                      <Calendar size={11} />
                      {ds === 'upcoming' && challenge ? `Opens ${formatDate(p.opening_date)}` : p.closing_date ? `Closes ${formatDate(p.closing_date)}` : '—'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/hackathons/${p.id}`}
                        className="text-[12px] font-semibold text-gray-500 hover:text-[#A01E0A] transition-colors"
                      >
                        Details
                      </Link>
                      {canEnter && (
                        <Link
                          to={isAuthenticated ? `/innovate?program=${p.id}` : '/login'}
                          className="text-[12px] font-semibold text-[#A01E0A] flex items-center gap-1 hover:gap-1.5 transition-all duration-200"
                        >
                          {challenge ? 'Enter' : 'Apply'} <ArrowRight size={11} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}


const MEDAL: Record<string, { label: string; ring: string; badge: string; glow: string }> = {
  '1': { label: '1st Place', ring: 'ring-2 ring-amber-400/60',  badge: 'bg-amber-400 text-white',  glow: 'shadow-[0_0_20px_rgba(251,191,36,0.25)]' },
  '2': { label: '2nd Place', ring: 'ring-2 ring-slate-300/80',  badge: 'bg-slate-500 text-white',  glow: 'shadow-[0_0_20px_rgba(100,116,139,0.18)]' },
  '3': { label: '3rd Place', ring: 'ring-2 ring-orange-400/50', badge: 'bg-orange-500 text-white', glow: 'shadow-[0_0_20px_rgba(234,88,12,0.18)]'  },
}
const MEDALS = ['🥇', '🥈', '🥉']
function medal(pos: string) {
  const key = pos?.replace(/\D/g, '').charAt(0) ?? ''
  return MEDAL[key] ?? { label: pos, ring: 'ring-1 ring-gray-200', badge: 'bg-gray-500 text-white', glow: '' }
}
function medalEmoji(pos: string) {
  const n = parseInt(pos?.replace(/\D/g, '') ?? '99')
  return MEDALS[n - 1] ?? '🏅'
}

function WinnerGroupGrid({ group }: {
  group: { programId: string; items: ApiWinner[] }
}) {
  const [first, ...rest] = group.items
  if (!first) return null
  const firstM = medal(first.position)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">

      <Link
        to={`/hackathons/${group.programId}`}
        className={`md:col-span-2 rounded-3xl overflow-hidden relative flex flex-col bg-gray-900 ${firstM.ring} ${firstM.glow} hover:-translate-y-1 transition-all duration-300 group`}
        style={{ minHeight: 280 }}
      >
        {first.photo_url ? (
          <img
            src={first.photo_url}
            alt={first.team_name}
            className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-80 group-hover:scale-[1.02] transition-all duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-10">
            <Trophy size={80} className="text-white" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        <div className="relative z-10 p-5 flex-1 flex flex-col justify-end">
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${firstM.badge}`}>
              {medalEmoji(first.position)} {firstM.label}
            </span>
            {first.is_featured && (
              <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-white/20 text-white/90 border border-white/20">
                Featured
              </span>
            )}
          </div>
          <h3 className="text-white font-extrabold text-[20px] leading-snug mb-1">{first.project_name}</h3>
          <p className="text-white/60 text-[12px] font-medium flex items-center gap-1.5">
            <Users size={11} />
            {first.team_name}
            {first.members_count > 0 && <span className="text-white/35">· {first.members_count} member{first.members_count !== 1 ? 's' : ''}</span>}
          </p>
          {first.description && (
            <p className="text-white/50 text-[12px] leading-relaxed mt-2 line-clamp-2 max-w-md">{first.description}</p>
          )}
          {first.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {first.tags.slice(0, 4).map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/10">{t}</span>
              ))}
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-4">
        {rest.slice(0, 2).map(w => {
          const m = medal(w.position)
          return (
            <Link
              key={w.id}
              to={`/hackathons/${group.programId}`}
              className={`rounded-2xl overflow-hidden relative flex flex-col bg-gray-900 ${m.ring} ${m.glow} hover:-translate-y-0.5 transition-all duration-300 group`}
              style={{ minHeight: 128 }}
            >
              {w.photo_url ? (
                <img src={w.photo_url} alt={w.team_name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-75 group-hover:scale-[1.02] transition-all duration-500" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center opacity-10">
                  <Trophy size={36} className="text-white" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="relative z-10 p-4 flex flex-col justify-end h-full">
                <span className={`self-start inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 ${m.badge}`}>
                  {medalEmoji(w.position)} {m.label}
                </span>
                <p className="text-white font-bold text-[13px] leading-snug">{w.project_name}</p>
                <p className="text-white/50 text-[11px] mt-0.5">{w.team_name}</p>
              </div>
            </Link>
          )
        })}
        {rest.length > 2 && (
          <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden bg-white">
            {rest.slice(2).map(w => (
              <Link key={w.id} to={`/hackathons/${group.programId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                <span className="text-base flex-shrink-0">{medalEmoji(w.position)}</span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 leading-snug truncate group-hover:text-[#A01E0A] transition-colors">{w.project_name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{w.team_name}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

function FeaturedWinners() {
  const [winners, setWinners] = useState<ApiWinner[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    contentService.getWinners({ featured: true })
      .then(setWinners)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && winners.length === 0) return null

  const groups: { programId: string; programTitle: string; year: number; items: ApiWinner[] }[] = []
  const seen = new Map<string, number>()
  for (const w of winners) {
    if (!seen.has(w.program)) {
      seen.set(w.program, groups.length)
      groups.push({ programId: w.program, programTitle: w.program_title, year: w.year, items: [] })
    }
    groups[seen.get(w.program)!].items.push(w)
  }
  groups.forEach(g => g.items.sort((a, b) =>
    parseInt(a.position?.replace(/\D/g, '') || '99') - parseInt(b.position?.replace(/\D/g, '') || '99')
  ))

  return (
    <section className="py-10 pb-20" style={{ background: 'linear-gradient(180deg, #fff 0%, #f9fafb 100%)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        <div className="flex items-end justify-between mb-10">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: 'linear-gradient(135deg, #9A5200 0%, #f59e0b 100%)' }}>
              <Trophy size={20} className="text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-amber-600 mb-1">Hall of Innovation</p>
              <h2 className="text-[26px] font-extrabold text-gray-900 leading-tight">Featured Winners</h2>
            </div>
          </div>
          <Link to="/challenges"
            className="text-[13px] font-semibold text-[#F0641E] hover:text-[#A01E0A] flex items-center gap-1 group transition-colors">
            All events <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-10">
            {[1, 2].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-44 mb-5" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 h-[280px] rounded-3xl bg-gray-200" />
                  <div className="flex flex-col gap-4">
                    <div className="h-[128px] rounded-2xl bg-gray-200" />
                    <div className="h-[128px] rounded-2xl bg-gray-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-12">
            {groups.map(group => (
              <div key={group.programId}>
                <Link
                  to={`/hackathons/${group.programId}`}
                  className="inline-flex items-center gap-2 mb-5 group"
                >
                  <span className="font-bold text-gray-800 text-[15px] group-hover:text-[#A01E0A] transition-colors">{group.programTitle}</span>
                  <span className="text-[11px] text-gray-400 font-semibold px-2 py-0.5 rounded-full bg-gray-100">{group.year}</span>
                  <ArrowRight size={13} className="text-gray-300 group-hover:text-[#A01E0A] group-hover:translate-x-0.5 transition-all" />
                </Link>
                <WinnerGroupGrid group={group} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}


export default function Home() {
  return (
    <div className="bg-white">
      <HeroCard />
      <ChallengeSpotlight />
      <InnovationFeed />
      <TestimonialCarousel />
      <ChallengesPreview />
      <FeaturedWinners />
    </div>
  )
}
