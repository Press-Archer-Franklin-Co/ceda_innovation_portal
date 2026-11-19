import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Calendar, Inbox, Trophy } from 'lucide-react'
import { programsService } from '../services/programs.service'
import { contentService } from '../services/content.service'
import { useAuth } from '../context/AuthContext'
import type { Program } from '../types/api'
import { parseApiError } from '../utils/apiError'
import Badge from '../components/ui/Badge'
import StandardHero from '../components/ui/StandardHero'
import FilterPills from '../components/ui/FilterPills'
import SearchInput from '../components/ui/SearchInput'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonGrid } from '../components/ui/SkeletonCard'
import clsx from 'clsx'


type DisplayStatus = 'open' | 'upcoming' | 'closed'

function programTypeCode(p: Program): string {
  return typeof p.program_type === 'object' && p.program_type !== null
    ? (p.program_type as { code?: string })?.code ?? ''
    : String(p.program_type)
}

const isChallenge = (p: Program) => programTypeCode(p) === 'innovation_challenge'

function programDisplayStatus(p: Program): DisplayStatus {
  if (isChallenge(p) && p.status === 'published') {
    const now = Date.now()
    if (p.opening_date && now < new Date(p.opening_date).getTime()) return 'upcoming'
    if (p.closing_date && now > new Date(p.closing_date).getTime()) return 'closed'
  }
  return toDisplayStatus(p.status)
}

function toDisplayStatus(status: string): DisplayStatus {
  if (status === 'published') return 'open'
  if (status === 'draft')     return 'upcoming'
  if (status === 'closed' || status === 'archived') return 'closed'
  return 'upcoming'
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

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}


const statusFilters: { value: 'all' | DisplayStatus; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'open',     label: 'Open' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'closed',   label: 'Closed' },
]


export default function Challenges() {
  const { isAuthenticated } = useAuth()
  const [programs,  setPrograms]  = useState<Program[]>([])
  const [bannerMap, setBannerMap] = useState<Record<string, string>>({})
  const [loading,   setLoading]   = useState(true)
  const [apiError,  setApiError]  = useState('')
  const [search,    setSearch]    = useState('')
  const [status,    setStatus]    = useState<'all' | DisplayStatus>('all')

  const load = () => {
    setLoading(true)
    setApiError('')
    Promise.all([
      programsService.getPublic(),
      contentService.getHackathons(),
    ])
      .then(([data, hackathonContent]) => {
        const hackathons = data
          .filter(p => ['hackathon', 'innovation_challenge'].includes(programTypeCode(p)))
          .sort((a, b) => new Date(b.opening_date).getTime() - new Date(a.opening_date).getTime())
        setPrograms(hackathons)
        setBannerMap(
          hackathonContent.reduce<Record<string, string>>((acc, item) => {
            if (item.program && item.banner_image_url) acc[item.program] = item.banner_image_url
            return acc
          }, {})
        )
      })
      .catch(err => setApiError(parseApiError(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = programs.filter(p => {
    const q  = search.toLowerCase()
    const ds = programDisplayStatus(p)
    return (
      (!q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) &&
      (status === 'all' || ds === status)
    )
  })

  return (
    <div className="bg-white">

      <StandardHero
        eyebrow="Open Programs"
        title="Innovation Challenges"
        subtitle="Enter a challenge, build a solution, win prizes, and make a real impact across Botswana."
        image={{ src: '/pages/challenges.png', alt: '' }}
      />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search challenges…"
            className="flex-1"
          />
          <FilterPills
            options={statusFilters}
            value={status}
            onChange={setStatus}
          />
        </div>

        {apiError && (
          <EmptyState
            title="Failed to load challenges"
            body={apiError}
            action={{ label: 'Retry', onClick: load }}
          />
        )}

        {loading && <SkeletonGrid />}

        {!loading && !apiError && filtered.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={programs.length === 0 ? 'No challenges available yet.' : 'No challenges match your filters.'}
            action={
              programs.length > 0
                ? { label: 'Clear filters', onClick: () => { setSearch(''); setStatus('all') } }
                : undefined
            }
          />
        )}

        {!loading && !apiError && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(p => {
              const ds = programDisplayStatus(p)
              const bannerUrl = bannerMap[p.id]
              const typeCode = programTypeCode(p)
              const challenge = isChallenge(p)
              const canEnter = !challenge || (p.entry?.can_enter ?? true)
              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden hover:shadow-[0_6px_24px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
                >
                  <Link
                    to={`/hackathons/${p.id}`}
                    className={`h-36 bg-gradient-to-br ${gradientFor(typeCode)} flex items-center justify-center relative`}
                  >
                    <Badge status={ds} className="absolute top-3 left-3 z-10" />
                    {challenge && (
                      <span className="absolute top-3 right-3 z-10 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-[#A01E0A]">
                        {p.audience === 'internal' ? 'CEDA Staff Challenge' : 'Innovation Challenge'}
                      </span>
                    )}
                    {bannerUrl ? (
                      <>
                        <img src={bannerUrl} alt={p.title} className={`absolute inset-0 h-full w-full object-cover ${ds === 'closed' ? 'opacity-60 grayscale-[30%]' : ''}`} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                      </>
                    ) : (
                      <span className="text-white/[0.08] text-[72px] font-black tracking-tighter select-none leading-none">
                        {p.title.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {ds === 'closed' && (
                      <Trophy size={28} className="text-amber-400/60 relative z-10" />
                    )}
                  </Link>

                  <div className="p-5 bg-white flex flex-col flex-1">
                    <Link
                      to={`/hackathons/${p.id}`}
                      className="font-bold text-gray-900 text-[13.5px] leading-snug mb-1.5 hover:text-[#A01E0A] transition-colors"
                    >
                      {p.title}
                    </Link>
                    <p className="text-[12px] text-gray-400 line-clamp-2 leading-relaxed flex-1">{p.description}</p>

                    <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-gray-100">
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar size={11} />
                        {ds === 'upcoming' && challenge && p.opening_date
                          ? `Opens ${formatDate(p.opening_date)}`
                          : p.closing_date ? `Closes ${formatDate(p.closing_date)}` : '—'}
                      </p>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/hackathons/${p.id}`}
                          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#A01E0A] transition-colors"
                        >
                          Details
                        </Link>
                        {ds === 'closed' ? (
                          <Link
                            to={`/hackathons/${p.id}`}
                            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                          >
                            <Trophy size={11} />
                            See Results
                          </Link>
                        ) : !canEnter || (challenge && ds !== 'open') ? (
                          <Link
                            to={`/hackathons/${p.id}`}
                            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            View
                            <ArrowRight size={11} />
                          </Link>
                        ) : (
                          <Link
                            to={ds === 'open'
                              ? (isAuthenticated ? `/innovate?program=${p.id}` : '/login')
                              : '/login'}
                            className={clsx(
                              'flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-[#A01E0A] text-white hover:bg-[#7E1708]',
                            )}
                          >
                            {ds === 'open' ? (challenge ? 'Enter' : 'Apply') : 'Notify Me'}
                            <ArrowRight size={11} />
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

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div
          className="relative rounded-3xl px-10 py-8 text-center overflow-hidden"
          style={{ background: 'linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-[0.45] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)', backgroundSize: '26px 26px' }}
          />
          <div className="relative z-10">
            <h3 className="font-bold text-white text-xl mb-2">Have a challenge idea?</h3>
            <p className="text-white/70 text-sm mb-6">Suggest a new challenge that addresses a real need in Botswana.</p>
            <Link to="/suggestions" className="btn-white inline-flex">
              Submit a Suggestion <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
