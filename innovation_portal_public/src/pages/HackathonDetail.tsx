import { useState, useEffect, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Trophy, HelpCircle, Calendar, Award, Users, Medal, Clock, Lock, ClipboardCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Countdown, { useNow } from '../components/challenges/Countdown'
import { contentService } from '../services/content.service'
import type { HackathonDetail as HackathonDetailType, WinnerSpotlight } from '../services/content.service'

function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

function formatDateTime(d: string) {
  try {
    return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return d }
}


function useChallengeEntry(detail: HackathonDetailType) {
  const { isAuthenticated } = useAuth()
  const now = useNow()
  const info = detail.program_info
  const opens = info?.opens_at ? new Date(info.opens_at).getTime() : null
  const closes = info?.closes_at ? new Date(info.closes_at).getTime() : null
  const notOpenYet = opens !== null && now < opens
  const closed = !info || info.status === 'closed' || info.status === 'archived' || (closes !== null && now > closes)
  const entry = info?.entry
  const blocked = entry?.blocked_by === 'audience' || entry?.blocked_by === 'limit'
  const enter = closed || notOpenYet || !info
    ? null
    : !isAuthenticated
      ? { label: 'Sign in to enter', to: '/login' }
      : blocked ? null : { label: 'Enter Challenge', to: `/innovate?program=${detail.program}` }
  return { info, now, opens, closes, notOpenYet, closed, entry, blocked, enter, isAuthenticated }
}

const ENTER_BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#9A5200] text-white font-bold shadow-lg shadow-amber-900/20 hover:bg-[#b3830c] transition-all active:scale-95'

function ChallengeEntryPanel({ detail }: { detail: HackathonDetailType }) {
  const { info, now, opens, closes, notOpenYet, closed, entry, blocked, enter, isAuthenticated } = useChallengeEntry(detail)
  if (!info || !entry) return null

  let action: ReactNode
  if (closed) {
    action = <p className="text-[13px] font-semibold text-gray-500 flex items-center gap-1.5"><Lock size={13} /> Entries closed</p>
  } else if (notOpenYet) {
    action = <p className="text-[13px] font-semibold text-gray-500">Entries open soon. Check back when the countdown ends.</p>
  } else if (blocked) {
    action = <p className="text-[13px] text-gray-600">{entry.message}</p>
  } else if (enter) {
    action = <Link to={enter.to} className={`${ENTER_BUTTON} w-full px-5 py-3.5 text-[15px]`}>{enter.label} <ArrowRight size={16} /></Link>
  }

  return (
    <div className={`surface rounded-2xl p-5 ${enter ? 'ring-2 ring-[#9A5200]/60' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <Clock size={14} className="text-[#A01E0A]" />
        <p className="text-[13px] font-bold text-gray-900">Entries</p>
        {enter && <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-[#F0641E]">Open now</span>}
      </div>
      {info.opens_at && (
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <span className="text-[12px] text-gray-500">Opens</span>
          <span className="text-[12px] font-bold text-gray-900">{formatDateTime(info.opens_at)}</span>
        </div>
      )}
      {info.closes_at && (
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <span className="text-[12px] text-gray-500">Closes</span>
          <span className="text-[12px] font-bold text-gray-900">{formatDateTime(info.closes_at)}</span>
        </div>
      )}
      {!closed && (notOpenYet || closes !== null) && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">{notOpenYet ? 'Opens in' : 'Closes in'}</p>
          <Countdown target={notOpenYet ? opens! : closes!} now={now} />
        </div>
      )}
      {isAuthenticated && entry.max_entries != null && !notOpenYet && (
        <p className="text-[12px] text-gray-500 mt-3">Your entries: {entry.entries_used} of {entry.max_entries}</p>
      )}
      <div className="mt-4">{action}</div>
    </div>
  )
}

function HeroEntryCta({ detail }: { detail: HackathonDetailType }) {
  const { now, opens, notOpenYet, closed, enter } = useChallengeEntry(detail)
  if (closed) return null
  if (notOpenYet) {
    return (
      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">Entries open in</p>
        <Countdown target={opens!} now={now} tone="dark" />
      </div>
    )
  }
  if (!enter) return null
  return (
    <div className="mt-5 flex items-center gap-3 flex-wrap">
      <Link to={enter.to} className={`${ENTER_BUTTON} px-7 py-3.5 text-[15px]`}>{enter.label} <ArrowRight size={16} /></Link>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white/85">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#F0641E] opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F0641E]" />
        </span>
        Entries are open
      </span>
    </div>
  )
}

function StickyEnterBar({ detail }: { detail: HackathonDetailType }) {
  const { now, closes, enter } = useChallengeEntry(detail)
  if (!enter) return null
  const mins = closes ? Math.max(0, Math.floor((closes - now) / 60000)) : null
  const left = mins === null ? '' : mins >= 1440
    ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h left`
    : `${Math.floor(mins / 60)}h ${mins % 60}m left`
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-[#A01E0A] text-white shadow-[0_-6px_24px_rgba(0,0,0,0.18)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold truncate">Entries are open for {detail.program_title}</p>
          {left && <p className="text-[11.5px] text-white/65">{left} to submit your entry</p>}
        </div>
        <Link to={enter.to} className={`${ENTER_BUTTON} px-5 py-2.5 text-[13.5px] shrink-0`}>{enter.label} <ArrowRight size={14} /></Link>
      </div>
    </div>
  )
}


function PrizeCard({ prize }: { prize: { position: string; label: string; amount: string; description: string } }) {
  const colors: Record<string, string> = { '1st': '#9A5200', '2nd': '#9CA3AF', '3rd': '#B45309' }
  const color = Object.entries(colors).find(([k]) => prize.position?.includes(k))?.[1] ?? '#A01E0A'
  return (
    <div className="surface rounded-2xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={14} style={{ color }} />
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color }}>{prize.position}</span>
      </div>
      <p className="font-bold text-gray-900 text-[15px] mb-1">{prize.label}</p>
      <p className="text-[22px] font-extrabold text-gray-900 mb-2">{prize.amount}</p>
      {prize.description && <p className="text-[13px] text-gray-500 leading-relaxed flex-1">{prize.description}</p>}
    </div>
  )
}



const POSITION_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  '1': { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', icon: '🥇' },
  '2': { bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200', icon: '🥈' },
  '3': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: '🥉' },
}

function positionStyle(pos: string) {
  const key = pos?.replace(/\D/g, '').slice(0, 1)
  return POSITION_STYLES[key] ?? { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: '🏅' }
}

function WinnerCard({ winner }: { winner: WinnerSpotlight }) {
  const style = positionStyle(winner.position)
  return (
    <div className={`rounded-2xl border ${style.border} overflow-hidden flex flex-col bg-white shadow-sm hover:shadow-md transition-shadow`}>
      <div className="relative h-44 bg-gray-100 flex items-center justify-center overflow-hidden">
        {winner.photo_url ? (
          <img src={winner.photo_url} alt={winner.team_name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-300">
            <Trophy size={32} />
            <span className="text-[11px]">No photo</span>
          </div>
        )}
        <span className={`absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
          {style.icon} {winner.position_display || winner.position}
        </span>
        {winner.is_featured && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#A01E0A] text-white">
            Featured
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="font-bold text-gray-900 text-[14px] leading-snug mb-0.5">{winner.project_name}</p>
        <p className="text-[12px] text-gray-500 mb-2">{winner.team_name}</p>
        {(winner.prize_label || winner.prize_amount) && (
          <p className="text-[12px] font-semibold text-amber-700 mb-2">
            {[winner.prize_label, winner.prize_amount].filter(Boolean).join(' · ')}
          </p>
        )}
        {winner.description && (
          <p className="text-[12px] text-gray-400 leading-relaxed line-clamp-3 flex-1">{winner.description}</p>
        )}
        {winner.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {winner.tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


export default function HackathonDetail() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<HackathonDetailType | null>(null)
  const [winners, setWinners] = useState<WinnerSpotlight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'overview' | 'prizes' | 'criteria' | 'faq' | 'schedule' | 'judges' | 'gallery' | 'winners'>('overview')

  useEffect(() => {
    if (!id) return
    Promise.all([
      contentService.getHackathons({ program: id }).then(results =>
        results.length > 0 ? results[0] : contentService.getHackathon(id)
      ),
      contentService.getWinners({ program: id }),
    ])
      .then(([hackathon, winnerList]) => {
        setDetail(hackathon)
        setWinners(winnerList)
        if (winnerList.length > 0) setTab('winners')
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 animate-pulse space-y-5">
        <div className="h-[300px] bg-gray-200 rounded-2xl" />
        <div className="h-10 bg-gray-200 rounded w-1/2" />
        {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="text-gray-400 text-[15px] mb-4">Challenge details not found.</p>
        <Link to="/challenges" className="text-sm font-semibold text-[#F0641E] hover:underline flex items-center justify-center gap-1">
          <ArrowLeft size={13} /> Back to challenges
        </Link>
      </div>
    )
  }

  const isChallenge = detail.program_info?.type_code === 'innovation_challenge'
  const criteria = detail.marking_criteria ?? []
  const typeLabel = isChallenge ? 'Innovation Challenge' : 'Hackathon'

  const tabs = [
    winners.length > 0      ? { id: 'winners',  label: '🏆 Winners' } : null,
    { id: 'overview', label: 'Overview' },
    detail.prizes.length  > 0 ? { id: 'prizes',   label: 'Prizes' }   : null,
    criteria.length       > 0 ? { id: 'criteria', label: 'Judging Criteria' } : null,
    detail.faq.length     > 0 ? { id: 'faq',      label: 'FAQ' }      : null,
    detail.schedule.length> 0 ? { id: 'schedule', label: 'Schedule' } : null,
    detail.judges.length  > 0 ? { id: 'judges',   label: 'Judges' }   : null,
    detail.media.length   > 0 ? { id: 'gallery',  label: 'Gallery' }  : null,
  ].filter(Boolean) as { id: string; label: string }[]

  return (
    <div className={`bg-white min-h-screen ${isChallenge ? 'pb-20' : ''}`}>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div
          className="relative rounded-3xl px-8 sm:px-10 py-12 overflow-hidden min-h-[220px] lg:min-h-0 lg:aspect-[4/1] flex items-end"
          style={{ background: 'linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)' }}
        >
          {detail.banner_image_url && (
            <>
              <img
                src={detail.banner_image_url}
                alt={detail.program_title}
                className="absolute inset-0 w-full h-full object-cover opacity-75"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            </>
          )}

          <div
            className="absolute inset-0 opacity-[0.45] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)',
              backgroundSize: '26px 26px',
            }}
          />

          <Link
            to="/challenges"
            className="absolute top-5 left-8 sm:left-10 inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white transition-colors"
          >
            <ArrowLeft size={12} /> Challenges
          </Link>

          <div className="relative z-10 max-w-[600px]">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                <Trophy size={10} /> {typeLabel}
              </span>
              {isChallenge && detail.program_info?.audience === 'internal' && (
                <span className="inline-flex items-center gap-1.5 bg-white/12 text-white/80 text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/20">
                  CEDA Staff Only
                </span>
              )}
              {winners.length > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-white/12 text-white/80 text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/20">
                  <Medal size={10} /> Closed · Winners Announced
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-2">{detail.program_title}</h1>
            {detail.theme && <p className="text-white/65 text-[14px] leading-relaxed">{detail.theme}</p>}
            {isChallenge && <HeroEntryCta detail={detail} />}
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`flex-shrink-0 px-4 py-2.5 text-[13px] font-semibold transition-colors rounded-lg ${
                tab === t.id ? 'text-[#A01E0A] bg-[#F5EEE8]' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

        {tab === 'winners' && (
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Trophy size={18} className="text-amber-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Winners</h2>
                <p className="text-[13px] text-gray-400">{winners.length} winner{winners.length !== 1 ? 's' : ''} recognised</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {winners.map(w => <WinnerCard key={w.id} winner={w} />)}
            </div>
          </div>
        )}

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {detail.description && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">About this {typeLabel}</h2>
                  <div className="text-[15px] text-gray-600 leading-[1.85] space-y-4">
                    {detail.description.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : null)}
                  </div>
                </div>
              )}
              {detail.rules && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">{detail.eligibility ? 'Rules' : <>Rules &amp; Eligibility</>}</h2>
                  <div className="text-[14px] text-gray-600 leading-[1.85] space-y-3 bg-gray-50 rounded-2xl p-6 font-mono whitespace-pre-wrap">
                    {detail.rules}
                  </div>
                </div>
              )}
              {detail.eligibility && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Eligibility</h2>
                  <div className="text-[14px] text-gray-600 leading-[1.85] bg-gray-50 rounded-2xl p-6 whitespace-pre-wrap">
                    {detail.eligibility}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {isChallenge && <ChallengeEntryPanel detail={detail} />}
              {detail.prizes.length > 0 && (
                <div className="surface rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Award size={14} className="text-amber-500" />
                    <p className="text-[13px] font-bold text-gray-900">Prize Pool</p>
                  </div>
                  {detail.prizes.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-[12px] text-gray-500">{p.position}</span>
                      <span className="text-[13px] font-bold text-gray-900">{p.amount}</span>
                    </div>
                  ))}
                  {detail.prizes.length > 3 && (
                    <button onClick={() => setTab('prizes')} className="text-[12px] text-[#F0641E] font-semibold mt-2 hover:underline">
                      View all prizes →
                    </button>
                  )}
                </div>
              )}
              {detail.schedule.length > 0 && (
                <div className="surface rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar size={14} className="text-[#A01E0A]" />
                    <p className="text-[13px] font-bold text-gray-900">Key Dates</p>
                  </div>
                  {detail.schedule.slice(0, 4).map((s, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                      <span className="text-[11px] font-bold text-[#A01E0A] whitespace-nowrap mt-0.5">{formatDate(s.date)}</span>
                      <span className="text-[12px] text-gray-600">{s.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'prizes' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Prize Structure</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {detail.prizes.map((p, i) => <PrizeCard key={i} prize={p} />)}
            </div>
          </div>
        )}

        {tab === 'criteria' && (
          <div className="max-w-3xl space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Judging Criteria</h2>
            {criteria.map((stage, i) => (
              <div key={i} className="surface rounded-2xl p-5">
                {criteria.length > 1 && <p className="text-[12px] font-bold uppercase tracking-wide text-[#A01E0A] mb-3">{stage.stage}</p>}
                <div className="divide-y divide-gray-100">
                  {stage.criteria.map((c, j) => (
                    <div key={j} className="flex items-start gap-3 py-3">
                      <ClipboardCheck size={15} className="text-[#F0641E] mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-[14px]">{c.name}</p>
                        {c.description && <p className="text-[13px] text-gray-500 leading-relaxed">{c.description}</p>}
                      </div>
                      <span className="text-[12px] font-bold text-gray-700 whitespace-nowrap">out of {c.max_score}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'faq' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {detail.faq.map((f, i) => (
                <details key={i} className="surface rounded-2xl overflow-hidden group">
                  <summary className="px-5 py-4 flex items-start gap-3 cursor-pointer list-none">
                    <HelpCircle size={16} className="text-[#A01E0A] mt-0.5 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-[14px]">{f.question}</span>
                  </summary>
                  <div className="px-5 pb-4 pl-10 text-[14px] text-gray-600 leading-relaxed">{f.answer}</div>
                </details>
              ))}
            </div>
          </div>
        )}

        {tab === 'schedule' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Event Timeline</h2>
            <div className="relative pl-6 border-l-2 border-gray-100 space-y-6">
              {detail.schedule.map((s, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[29px] w-3 h-3 rounded-full bg-[#A01E0A] border-2 border-white" />
                  <p className="text-[11px] font-bold text-[#A01E0A] mb-0.5">{formatDate(s.date)}</p>
                  <p className="font-semibold text-gray-900 text-[14px] mb-1">{s.label}</p>
                  {s.description && <p className="text-[13px] text-gray-500 leading-relaxed">{s.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'judges' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Judging Panel</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {detail.judges.map((j, i) => (
                <div key={i} className="surface rounded-2xl p-5 flex flex-col items-center text-center">
                  {j.photo_url ? (
                    <img src={j.photo_url} alt={j.name} className="w-16 h-16 rounded-full object-cover mb-3 border-2 border-gray-100" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <Users size={22} className="text-gray-400" />
                    </div>
                  )}
                  <p className="font-bold text-gray-900 text-[14px]">{j.name}</p>
                  <p className="text-[12px] text-gray-500 mb-2">{j.title}</p>
                  {j.bio && <p className="text-[12px] text-gray-400 leading-relaxed">{j.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'gallery' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Media Gallery</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {detail.media.map(m => (
                <div key={m.id} className="rounded-2xl overflow-hidden aspect-video bg-gray-100 relative">
                  {m.media_type === 'photo' ? (
                    <img src={m.file_url} alt={m.caption} className="w-full h-full object-cover" />
                  ) : (
                    <video src={m.file_url} className="w-full h-full object-cover" controls />
                  )}
                  {m.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[11px] p-2 truncate">
                      {m.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {isChallenge && <StickyEnterBar detail={detail} />}
    </div>
  )
}
