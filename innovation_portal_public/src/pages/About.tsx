import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { focusAreas, milestones } from '../data/about'
import StandardHero from '../components/ui/StandardHero'
import { contentService, type PublicStat } from '../services/content.service'

const colorMap: Record<string, string> = {
  network:   'bg-[#A01E0A] text-white',
  fintech:   'bg-emerald-700 text-white',
  agri:      'bg-green-700 text-white',
  health:    'bg-blue-700 text-white',
  education: 'bg-violet-700 text-white',
  city:      'bg-amber-700 text-white',
}

const FALLBACK_STATS: PublicStat[] = [
  { key: 'innovators', label: 'Registered Innovators', value: '—',         description: '' },
  { key: 'challenges', label: 'Challenges Hosted',     value: '—',         description: '' },
]

export default function About() {
  const [stats, setStats] = useState<PublicStat[]>(FALLBACK_STATS)

  useEffect(() => {
    contentService.getPublicStats()
      .then(s => { if (s.length) setStats(s) })
      .catch(() => {})
  }, [])

  return (
    <div className="bg-white">
      <StandardHero
        eyebrow="About Us"
        title={"Powering Botswana's Digital Future"}
        subtitle="The CEDA Innovation Portal is our commitment to harnessing the power of collaboration, technology, and creativity to solve Botswana's most pressing challenges and unlock new opportunities."
        image={{ src: '/pages/about_us.png' }}
      />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { title: 'Our Mission', text: "To accelerate digital transformation in Botswana by fostering a thriving ecosystem of innovators, entrepreneurs, and technologists who build impactful solutions." },
            { title: 'Our Vision',  text: "To be the leading force behind a digitally-enabled Botswana — where every citizen benefits from accessible technology and every innovator has a platform to grow." },
            { title: 'Our Values', text: "Collaboration, inclusivity, excellence, and impact. The best innovations emerge from diverse perspectives, shared resources, and a genuine commitment to improving lives." },
          ].map(({ title, text }) => (
            <div key={title} className="rounded-2xl border border-gray-100 shadow-card p-6">
              <h3 className="font-bold text-[#A01E0A] text-lg mb-3">{title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-3xl px-10 py-10" style={{ background: '#A01E0A' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-white/60 uppercase mb-3">Why It Matters</p>
              <h2 className="text-3xl font-extrabold text-white mb-5 leading-tight">
                Innovation is the Engine of National Progress
              </h2>
              <ul className="space-y-3">
                {[
                  'Connecting talented innovators to real-world challenges',
                  'Providing funding, mentorship, and market access',
                  'Building solutions that scale across Botswana and the region',
                  'Creating employment opportunities in the digital sector',
                  'Driving government and private sector digital transformation',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-[#F0641E] shrink-0 mt-0.5" />
                    <span className="text-white/80 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {stats.map(({ value, label }) => (
                <div key={label} className="bg-white/10 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-extrabold text-white">{value}</p>
                  <p className="text-white/60 text-xs mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="eyebrow mb-1.5">What We Focus On</p>
        <h2 className="text-xl font-bold text-gray-900 mb-6">Our Innovation Focus Areas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {focusAreas.map((area) => (
            <div key={area.id} className="rounded-2xl border border-gray-100 shadow-card p-6">
              <div className={`w-10 h-10 rounded-xl ${colorMap[area.icon] ?? 'bg-gray-700 text-white'} flex items-center justify-center text-sm font-bold mb-4`}>
                {area.title.slice(0, 2)}
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{area.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{area.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="eyebrow mb-1.5">Our Journey</p>
        <h2 className="text-xl font-bold text-gray-900 mb-6">Innovation Milestones</h2>
        <div className="space-y-4">
          {milestones.map((m) => (
            <div key={m.year} className="flex gap-5 items-start">
              <div
                className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-white text-xs font-extrabold"
                style={{ background: '#A01E0A' }}
              >
                {m.year}
              </div>
              <div className="flex-1 rounded-2xl border border-gray-100 shadow-card p-4 pt-3.5">
                <p className="font-bold text-gray-900 text-sm">{m.title}</p>
                <p className="text-gray-500 text-xs mt-1">{m.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
