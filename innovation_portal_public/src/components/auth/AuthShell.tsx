import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import logoSrc from '../../assets/logo.png'
import { contentService, type PublicStat } from '../../services/content.service'


function RegisterStats() {
  const [stats, setStats] = useState<PublicStat[]>([])
  useEffect(() => {
    contentService.getPublicStats().then(setStats).catch(() => {})
  }, [])
  if (!stats.length) return null
  return (
    <div className="grid grid-cols-2 gap-3 mt-8">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-white/10 rounded-xl p-3">
          <p className="text-white font-extrabold text-lg">{value}</p>
          <p className="text-white/55 text-xs">{label}</p>
        </div>
      ))}
    </div>
  )
}


const SIDE = {
  signin: {
    headline: (
      <>
        Welcome back<br />innovator
      </>
    ),
    body: "Sign in to continue submitting ideas, entering challenges, and collaborating with Botswana's brightest minds.",
    extra: null,
  },
  register: {
    headline: (
      <>
        Join Botswana's<br />Innovation Community
      </>
    ),
    body: "Free registration. No credit card. Join thousands of innovators building Botswana's digital future.",
    extra: <RegisterStats />,
  },
} as const


interface Props {
  mode: 'signin' | 'register'
  children: React.ReactNode
}

export default function AuthShell({ mode, children }: Props) {
  const side = SIDE[mode]

  return (
    <div className="min-h-screen flex">

      <div
        className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12 relative overflow-hidden shrink-0"
        style={{ background: '#A01E0A' }}
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.8) 1px,transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <Link to="/" className="relative flex items-center gap-3 w-fit group">
          <img src={logoSrc} alt="CEDA Innovation Portal" className="h-11 w-auto" />
          <div className="w-px h-9 bg-white/25" />
          <div className="flex flex-col leading-none">
            <span
              style={{ fontFamily: 'Poppins', fontWeight: 900, fontSize: 24, color: '#fff', lineHeight: 1 }}
            >
              ceda
            </span>
            <span className="text-[10px] font-semibold text-white/50 tracking-[0.05em] mt-[4px]">
              Innovation Portal
            </span>
          </div>
        </Link>

        <div className="relative">
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
            {side.headline}
          </h2>
          <p className="text-white/65 text-sm leading-relaxed max-w-xs">
            {side.body}
          </p>
          {side.extra}
        </div>

        <p className="relative text-white/30 text-xs">
          Citizen Entrepreneurial Development Agency (CEDA) {new Date().getFullYear()}
        </p>
      </div>

      <div className="w-full lg:w-3/5 flex items-start lg:items-center justify-center px-6 py-12 bg-white overflow-y-auto">
        <div className="w-full max-w-md">

          <Link to="/" className="flex items-center gap-3 mb-8 lg:hidden">
            <img src={logoSrc} alt="CEDA Innovation Portal" className="h-9 w-auto" />
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex flex-col leading-none">
              <span
                style={{ fontFamily: 'Poppins', fontWeight: 900, fontSize: 22, color: '#A01E0A', lineHeight: 1 }}
              >
                ceda
              </span>
              <span className="text-[10px] font-semibold text-gray-400 tracking-[0.05em] mt-[4px]">
                Innovation Portal
              </span>
            </div>
          </Link>

          <div key={mode} className="animate-slide-in-right">
            {children}
          </div>

        </div>
      </div>
    </div>
  )
}
