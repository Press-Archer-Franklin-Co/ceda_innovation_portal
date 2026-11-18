import { cn } from '../../lib/cn'

export default function CedaInnovationHubLogo({
  alt,
  className,
  tone = 'dark',
}) {
  const dark = tone === 'dark'

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <img
        src="/staff/logo.png"
        alt={alt ?? 'CEDA Innovation Portal'}
        className="block w-10 h-10 object-contain flex-shrink-0"
      />
      <div className={cn('h-9 w-px flex-shrink-0', dark ? 'bg-white/20' : 'bg-ceda-border')} />
      <div className="min-w-0">
        <p
          className={cn('text-[1.9rem] leading-none lowercase', dark ? 'text-white' : 'text-[#A01E0A]')}
          style={{ fontFamily: '"Poppins", sans-serif', fontWeight: 800, letterSpacing: '-0.02em' }}
        >
          ceda
        </p>
        <p className="mt-1 text-[8px] font-semibold tracking-[0.12em] text-[#9ca3af] whitespace-nowrap">
          Innovation Portal | staff
        </p>
      </div>
    </div>
  )
}
