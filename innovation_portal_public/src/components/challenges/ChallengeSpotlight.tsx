import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Trophy } from 'lucide-react'
import { programsService } from '../../services/programs.service'
import { useAuth } from '../../context/AuthContext'
import type { Program } from '../../types/api'
import Countdown, { useNow } from './Countdown'

function typeCode(p: Program) {
  return typeof p.program_type === 'object' && p.program_type !== null
    ? (p.program_type as { code?: string })?.code ?? ''
    : String(p.program_type ?? '')
}

export default function ChallengeSpotlight() {
  const { isAuthenticated } = useAuth()
  const [challenges, setChallenges] = useState<Program[]>([])
  const now = useNow()

  useEffect(() => {
    programsService.getPublic()
      .then(list => setChallenges(list.filter(p => typeCode(p) === 'innovation_challenge' && p.status === 'published')))
      .catch(() => setChallenges([]))
  }, [isAuthenticated])

  const upcomingOrLive = challenges
    .filter(p => !p.closing_date || new Date(p.closing_date).getTime() > now)
    .map(p => {
      const opens = new Date(p.opening_date).getTime()
      const live = opens <= now
      return { program: p, live, target: live ? new Date(p.closing_date).getTime() : opens }
    })
    .sort((a, b) => Number(b.live) - Number(a.live) || a.target - b.target)

  if (upcomingOrLive.length === 0) return null
  const { program, live, target } = upcomingOrLive[0]
  const others = upcomingOrLive.length - 1
  const entry = program.entry
  const usedAll = entry?.blocked_by === 'limit'

  let cta = { label: 'View Challenge', to: `/hackathons/${program.id}` }
  if (live && entry?.can_enter) {
    cta = isAuthenticated
      ? { label: 'Enter Challenge', to: `/innovate?program=${program.id}` }
      : { label: 'Sign in to Enter', to: '/sign-in' }
  }

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
      <div
        className="relative overflow-hidden rounded-3xl px-6 sm:px-10 py-7 flex flex-col lg:flex-row lg:items-center gap-6"
        style={{ background: 'linear-gradient(120deg, #2a1d00 0%, #5c3d00 45%, #9A5200 120%)' }}
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {live ? (
              <span className="inline-flex items-center gap-1.5 bg-red-500 text-white text-[10.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Live now
              </span>
            ) : (
              <span className="bg-white/15 text-white text-[10.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">Coming soon</span>
            )}
            <span className="inline-flex items-center gap-1.5 text-amber-200 text-[10.5px] font-bold uppercase tracking-widest">
              <Trophy size={11} /> {program.audience === 'internal' ? 'CEDA Staff Innovation Challenge' : 'Innovation Challenge'}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">{program.title}</h2>
          {program.description && <p className="text-white/70 text-[14px] mt-1.5 line-clamp-2 max-w-xl">{program.description}</p>}
          {usedAll && <p className="text-amber-200 text-[12.5px] font-semibold mt-2">You've submitted your entry. Good luck!</p>}
        </div>
        <div className="relative flex flex-col items-start lg:items-end gap-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">{live ? 'Entries close in' : 'Opens in'}</p>
          <Countdown target={target} now={now} tone="dark" />
          <div className="flex items-center gap-3">
            <Link to={cta.to} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#3d2900] text-[13px] font-bold hover:bg-amber-50 transition-colors active:scale-95">
              {cta.label} <ArrowRight size={14} />
            </Link>
            {others > 0 && (
              <Link to="/challenges" className="text-[12.5px] font-semibold text-white/80 hover:text-white">
                +{others} more
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
