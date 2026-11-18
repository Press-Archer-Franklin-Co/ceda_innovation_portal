import { ReactNode } from 'react'
import clsx from 'clsx'

interface StandardHeroProps {
  eyebrow?: string
  title: string
  subtitle?: string
  topSlot?: ReactNode
  image?: { src: string; alt?: string }
  gradient?: string
  actions?: ReactNode
  className?: string
}

const DEFAULT_GRADIENT = 'linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)'

export default function StandardHero({
  eyebrow,
  title,
  subtitle,
  topSlot,
  image,
  gradient = DEFAULT_GRADIENT,
  actions,
  className,
}: StandardHeroProps) {
  return (
    <section className={clsx('max-w-6xl mx-auto px-4 sm:px-6 py-8', className)}>
      <div
        className="relative rounded-3xl px-8 sm:px-10 py-12 overflow-hidden min-h-[220px] flex items-center"
        style={{ background: gradient }}
      >
        <div
          className="absolute inset-0 opacity-[0.45] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />

        <div className="relative z-10 max-w-[520px]">
          {topSlot && <div className="mb-6">{topSlot}</div>}
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-3">{eyebrow}</p>
          )}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-white/70 text-sm max-w-lg leading-relaxed">{subtitle}</p>
          )}
          {actions && <div className="mt-6">{actions}</div>}
        </div>

        {image && (
          <div className="hidden md:block absolute right-0 bottom-0 h-[110%] w-[380px] pointer-events-none">
            <img
              src={image.src}
              alt={image.alt ?? ''}
              className="h-full w-full object-contain object-bottom select-none"
              style={{ filter: 'drop-shadow(0 0 40px rgba(0,0,0,0.3))' }}
              draggable={false}
            />
          </div>
        )}
      </div>
    </section>
  )
}
